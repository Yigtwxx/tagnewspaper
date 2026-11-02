"""Command line: `python -m tagnews {run,market,hide,seed,init-db}`."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Sequence
from pathlib import Path

import httpx

from tagnews import revalidate
from tagnews.config import Settings, configure_logging, load_settings
from tagnews.decode import default_batch_decoder
from tagnews.extract import TextExtractor
from tagnews.llm import AnthropicSummarizer, Summarizer
from tagnews.market import MarketRefresh, refresh_market
from tagnews.models import EventDoc, StatDoc, utc_now
from tagnews.promote import is_primary_stat
from tagnews.run import Deps, rebuild_snapshot, run_pipeline
from tagnews.store import MemoryStore, MongoStore

log = logging.getLogger("tagnews")

SEED_DIR = Path(__file__).resolve().parents[2] / "seed"
# The roles each database user needs (created in Atlas, never by this code).
ATLAS_USERS_HELP = """\
Create two database users in Atlas (Database Access), scoped to one database:
  atlas dbusers create --username pipeline_rw --role readWrite@{db} --password <strong>
  atlas dbusers create --username web_ro      --role read@{db}      --password <strong>
pipeline_rw -> pipeline/.env and the MONGODB_URI GitHub secret
web_ro      -> web/.env.local and the Vercel MONGODB_URI env var
Network Access: 0.0.0.0/0 (GitHub Actions and Vercel use dynamic IPs).
"""


def _http_client(settings: Settings) -> httpx.Client:
    return httpx.Client(
        headers={
            "User-Agent": settings.user_agent,
            "Accept-Language": "tr-TR,tr;q=0.9",
        },
        follow_redirects=False,
    )


def _mongo(settings: Settings) -> MongoStore:
    if not settings.mongodb_uri:
        sys.exit("MONGODB_URI is not set (see pipeline/.env.example)")
    return MongoStore(settings.mongodb_uri, settings.mongodb_db)


def cmd_run(settings: Settings, dry_run: bool, max_items: int | None) -> int:
    with _http_client(settings) as http:
        if dry_run:
            store = MemoryStore()
            summarizer: Summarizer | None = None
            limit = max_items or 5
        else:
            if not settings.anthropic_api_key:
                sys.exit("ANTHROPIC_API_KEY is not set (see pipeline/.env.example)")
            store = _mongo(settings)
            summarizer = AnthropicSummarizer(
                settings.anthropic_api_key, settings.anthropic_model
            )
            limit = max_items or settings.max_items_per_run
        deps = Deps(
            settings=settings,
            store=store,
            http=http,
            summarizer=summarizer,
            extractor=TextExtractor(http) if settings.fetch_fulltext else None,
            batch_decoder=default_batch_decoder(),
        )
        run = run_pipeline(deps, dry_run=dry_run, max_items=limit)
        if isinstance(store, MongoStore):
            store.close()
    if dry_run:
        _print_dry_run(store, run.model_dump(mode="json", by_alias=True))
    return 0 if run.ok else 1


def _print_dry_run(store: MemoryStore, run: dict[str, object]) -> None:
    print(json.dumps(run, ensure_ascii=False, indent=2))
    for article in sorted(
        store.articles.values(), key=lambda a: a.published_at, reverse=True
    ):
        print(
            f"- [{article.origin}] {article.published_at:%Y-%m-%d %H:%M} "
            f"{article.source.name} | {article.title[:90]} | {article.url[:80]}"
        )
    if store.snapshot:
        totals = store.snapshot.totals
        print(f"snapshot: latest={len(store.snapshot.latest)} totals={totals}")


def cmd_market(settings: Settings, force: bool, dry_run: bool) -> int:
    """Refresh the `market` document; `--dry-run` fetches and prints, writes nothing."""
    store: MemoryStore | MongoStore = MemoryStore() if dry_run else _mongo(settings)
    try:
        if store.publishing_paused():
            print("publishing is paused (settings.publishing_paused); nothing to do")
            return 0
        with _http_client(settings) as http:
            result = refresh_market(
                store,
                http,
                utc_now(),
                force=force or dry_run,
                alphavantage_api_key=settings.alphavantage_api_key,
                sec_user_agent=settings.sec_user_agent,
            )
            if result.written and not dry_run:
                revalidate.trigger(
                    http, settings.revalidate_url, settings.revalidate_secret
                )
    finally:
        if isinstance(store, MongoStore):
            store.close()
    _print_market(result)
    return 1 if result.status == "failed" else 0


def _print_market(result: MarketRefresh) -> None:
    print(f"market: {result.status}")
    for error in result.errors:
        print(f"  error: {error}")
    doc = result.doc
    if doc is None:
        return
    print(f"updated_at={doc.updated_at.isoformat()} price_source={doc.price_source}")
    if doc.prices:
        last = doc.prices[-1]
        print(f"prices: {len(doc.prices)} bars, last {last.date} close {last.close}")
    for filing in doc.filings:
        print(f"- {filing.filed} {filing.form:<14} {filing.title[:70]} | {filing.url}")


def cmd_hide(settings: Settings, article_id: str) -> int:
    store = _mongo(settings)
    article = store.get_article(article_id)
    if article is None:
        print(f"no article with id {article_id}")
        return 1
    article.display = "hidden"
    store.save_article(article)
    now = utc_now()
    rebuild_snapshot(store, now, store.last_run_at() or now)
    with _http_client(settings) as http:
        revalidate.trigger(http, settings.revalidate_url, settings.revalidate_secret)
    store.close()
    print(f"hidden: {article_id} ({article.source.name})")
    return 0


def load_seed(seed_dir: Path) -> tuple[list[EventDoc], list[StatDoc]]:
    events_raw = json.loads((seed_dir / "events.json").read_text(encoding="utf-8"))
    stats_raw = json.loads((seed_dir / "stats.json").read_text(encoding="utf-8"))
    events = [
        EventDoc.model_validate({**e, "is_seed": True, "published": True})
        for e in events_raw
    ]
    stats = [StatDoc.model_validate({**s, "_id": s["key"]}) for s in stats_raw]
    return events, stats


def cmd_seed(settings: Settings, seed_dir: Path) -> int:
    events, stats = load_seed(seed_dir)
    store = _mongo(settings)
    store.save_events(events)
    for stat in stats:
        current = {s.key: s for s in store.load_stats()}.get(stat.key)
        stale = current is None or not is_primary_stat(current)
        if stale or current.as_of <= stat.as_of:
            store.save_stat(stat)
    now = utc_now()
    rebuild_snapshot(store, now, store.last_run_at() or now)
    with _http_client(settings) as http:
        revalidate.trigger(http, settings.revalidate_url, settings.revalidate_secret)
    store.close()
    print(f"seeded {len(events)} events, {len(stats)} stats")
    return 0


def cmd_init_db(settings: Settings) -> int:
    store = _mongo(settings)
    for name in store.ensure_indexes():
        print(f"index ok: {name}")
    store.close()
    print(ATLAS_USERS_HELP.format(db=settings.mongodb_db))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tagnews", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="run one ingestion cycle")
    run.add_argument(
        "--dry-run",
        action="store_true",
        help="fetch + decode + cluster only; no database, no LLM, no revalidate",
    )
    run.add_argument("--max-items", type=int, default=None)
    market = sub.add_parser(
        "market", help="refresh the MRT market document (SEC EDGAR + Alpha Vantage)"
    )
    market.add_argument(
        "--force", action="store_true", help="ignore the once-a-day guard"
    )
    market.add_argument(
        "--dry-run",
        action="store_true",
        help="fetch + parse and print; no database, no revalidate",
    )
    hide = sub.add_parser("hide", help="hide one article (correction/removal request)")
    hide.add_argument("article_id")
    seed = sub.add_parser("seed", help="load curated events/stats from seed/")
    seed.add_argument("--dir", type=Path, default=SEED_DIR)
    sub.add_parser("init-db", help="create indexes and print the user setup")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = load_settings()
    configure_logging(settings.log_level)
    if args.command == "run":
        return cmd_run(settings, args.dry_run, args.max_items)
    if args.command == "market":
        return cmd_market(settings, args.force, args.dry_run)
    if args.command == "hide":
        return cmd_hide(settings, args.article_id)
    if args.command == "seed":
        return cmd_seed(settings, args.dir)
    return cmd_init_db(settings)
