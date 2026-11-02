"""One ingestion run: collect -> decode -> dedupe -> extract -> enrich -> guard ->
promote -> snapshot -> market (once a day) -> revalidate -> run log."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import httpx

from tagnews import revalidate
from tagnews.cluster import ClusterItem, assign_clusters
from tagnews.config import Settings, estimate_cost_usd
from tagnews.decode import BatchDecoder, decode_urls
from tagnews.extract import Extractor
from tagnews.guards import check, final_scrub, source_text_usable
from tagnews.llm import PROMPT_VERSION, ArticleInput, Enrichment, LlmResult, Summarizer
from tagnews.market import refresh_market
from tagnews.models import (
    ActorStatement,
    ArticleDoc,
    EventDoc,
    EventEvidence,
    RunRecord,
    SourceRef,
    StatCandidate,
    StatDoc,
    StatKey,
    utc_now,
)
from tagnews.pii import scrub
from tagnews.promote import (
    EventCandidate,
    appears_in,
    merge_event,
    parse_turkish_number,
    promote_stat,
    valid_iso_date,
)
from tagnews.snapshot import build_snapshot as _build_snapshot
from tagnews.snapshot import local_date
from tagnews.sources.base import RawItem
from tagnews.sources.chain import collect
from tagnews.store import Store
from tagnews.textnorm import article_id, canonicalize_url, shingle_fingerprint

log = logging.getLogger(__name__)

MAX_ENRICH_ATTEMPTS = 3
CLUSTER_LOOKBACK = timedelta(hours=96)
SNAPSHOT_LOOKBACK = timedelta(days=91)
STAT_KEYS: tuple[StatKey, ...] = ("registered_riders", "drivers", "drivers_istanbul")


@dataclass
class Deps:
    settings: Settings
    store: Store
    http: httpx.Client
    summarizer: Summarizer | None
    extractor: Extractor | None
    batch_decoder: BatchDecoder
    now: Callable[[], datetime] = utc_now
    gdelt_sleep: bool = True
    # Refresh the daily `market` document after the snapshot (off in news-only tests).
    market: bool = True


@dataclass(frozen=True)
class Candidate:
    """A new item after decoding, ready to be processed."""

    item: RawItem
    url: str
    id: str


@dataclass
class ItemOutcome:
    article: ArticleDoc
    events: list[EventCandidate] = field(default_factory=list)
    stats: list[StatCandidate] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0


def _base_article(
    cand: Candidate, cluster_id: str, now: datetime, model: str | None
) -> ArticleDoc:
    return ArticleDoc(
        _id=cand.id,
        url=cand.url,
        title=final_scrub(cand.item.title),
        source=SourceRef(name=cand.item.source_name, domain=cand.item.source_domain),
        published_at=cand.item.published_at,
        fetched_at=now,
        display="headline_only",
        summary=None,
        category="diger",
        actors=[],
        actor_statements=[],
        is_allegation=False,
        risk_level="low",
        cluster_id=cluster_id,
        origin=cand.item.origin,
        model=model,
        prompt_version=PROMPT_VERSION if model else None,
        gn_guid=cand.item.guid if cand.item.origin == "google_news" else None,
        relevant=True,
        enrich_status="title_only",
        enrich_attempts=0,
    )


def _apply_classification(article: ArticleDoc, enrichment: Enrichment) -> None:
    article.category = enrichment.category
    article.actors = list(dict.fromkeys(enrichment.actors))
    article.is_allegation = enrichment.is_allegation
    article.risk_level = enrichment.risk_level
    article.relevant = enrichment.relevant


def _extract_facts(
    enrichment: Enrichment,
    text: str,
    cand: Candidate,
    now: datetime,
) -> tuple[list[EventCandidate], list[StatCandidate]]:
    today = local_date(now)
    fingerprint = shingle_fingerprint(text)
    evidence = EventEvidence(
        url=cand.url, source_name=cand.item.source_name, domain=cand.item.source_domain
    )
    events = [
        EventCandidate(
            date=ev.date,
            date_text=ev.date_text,
            type=ev.type,
            title=final_scrub(ev.title),
            description=final_scrub(ev.description),
            court=ev.court,
            evidence=evidence,
            fingerprint=fingerprint,
        )
        for ev in enrichment.events
        if valid_iso_date(ev.date, today) and appears_in(ev.date_text, text)
    ]
    stats: list[StatCandidate] = []
    for claim in enrichment.stat_claims:
        value = parse_turkish_number(claim.raw_text)
        if value is None or value <= 0 or not appears_in(claim.raw_text, text):
            continue
        as_of = (
            claim.as_of
            if claim.as_of and valid_iso_date(claim.as_of, today)
            else local_date(cand.item.published_at).isoformat()
        )
        stats.append(
            StatCandidate(
                key=claim.key,
                value=value,
                raw_text=claim.raw_text,
                as_of=as_of,
                url=cand.url,
                source_name=cand.item.source_name,
                domain=cand.item.source_domain,
                fingerprint=fingerprint,
                seen_at=now,
            )
        )
    return events, stats


def process_item(
    deps: Deps, cand: Candidate, cluster_id: str, attempts: int = 0
) -> ItemOutcome:
    now = deps.now()
    summarizer = deps.summarizer
    article = _base_article(
        cand, cluster_id, now, summarizer.model if summarizer else None
    )
    article.enrich_attempts = attempts
    outcome = ItemOutcome(article=article)

    text: str | None = None
    if deps.settings.fetch_fulltext and deps.extractor is not None:
        raw_text = deps.extractor.fetch_text(cand.url)
        text = scrub(raw_text).text if raw_text else None
    usable = source_text_usable(text)

    if summarizer is None:
        return outcome  # dry run: headline only, no AI text

    llm_input = ArticleInput(
        title=cand.item.title,
        source_name=cand.item.source_name,
        url=cand.url,
        published_at=cand.item.published_at,
        text=text if usable else None,
    )

    def call(feedback: list[str] | None = None) -> LlmResult:
        result = summarizer.enrich(llm_input, feedback)
        outcome.input_tokens += result.input_tokens
        outcome.output_tokens += result.output_tokens
        return result

    result = call()
    if result.status == "error":
        article.enrich_status = "error"
        article.enrich_attempts = attempts + 1
        return outcome
    if result.status == "refused" or result.enrichment is None:
        article.enrich_status = "refused"
        return outcome

    enrichment = result.enrichment
    _apply_classification(article, enrichment)
    if not enrichment.relevant:
        article.display = "hidden"
        article.enrich_status = "ok"
        return outcome
    if not usable or text is None:
        article.enrich_status = "title_only"
        return outcome

    final: Enrichment | None = enrichment
    violations = check(enrichment, text)
    if violations:
        log.info("guard: %s -> regenerating", ",".join(v.code for v in violations))
        retry = call([v.message for v in violations])
        retried = retry.enrichment if retry.status == "ok" else None
        if retried is not None and retried.relevant and not check(retried, text):
            final = retried
            _apply_classification(article, retried)
        else:
            final = None

    if final is None:
        article.enrich_status = "guard_failed"
        article.display = "headline_only"
    else:
        article.enrich_status = "ok"
        article.display = "full"
        article.summary = final_scrub(final.summary.strip())
        article.actor_statements = [
            ActorStatement(actor=s.actor, summary=final_scrub(s.summary.strip()))
            for s in final.actor_statements
        ]
    # Facts are verified against the source text itself, independent of the summary.
    outcome.events, outcome.stats = _extract_facts(final or enrichment, text, cand, now)
    return outcome


def _new_candidates(
    deps: Deps, items: list[RawItem], run: RunRecord, limit: int
) -> list[Candidate]:
    store = deps.store
    google = [i for i in items if i.needs_decode]
    known_guids = store.known_guids(i.guid for i in google if i.guid)
    google = [i for i in google if not i.guid or i.guid not in known_guids]
    others = [i for i in items if not i.needs_decode]

    # Newest first; decode only what we can process this run (plus slack for dupes).
    google.sort(key=lambda i: i.published_at, reverse=True)
    google = google[: limit * 2]
    outcome = decode_urls(
        [i.url for i in google], deps.batch_decoder, deps.settings.max_decodes_per_run
    )

    resolved: list[tuple[RawItem, str]] = []
    for item in google:
        if item.url in outcome.deferred:
            continue
        resolved.append(
            (item, canonicalize_url(outcome.decoded.get(item.url, item.url)))
        )
    resolved.extend((item, item.url) for item in others)

    known_urls = store.known_urls(url for _, url in resolved)
    seen: set[str] = set()
    fresh: list[Candidate] = []
    for item, url in sorted(resolved, key=lambda r: r[0].published_at, reverse=True):
        if url in known_urls or url in seen:
            continue
        seen.add(url)
        fresh.append(Candidate(item=item, url=url, id=article_id(url)))
    if len(fresh) > limit:
        log.info("processing %d of %d new items this run", limit, len(fresh))
    run.counts.new = min(len(fresh), limit)
    return fresh[:limit]


def _count(run: RunRecord, article: ArticleDoc) -> None:
    if not article.relevant:
        run.counts.irrelevant += 1
    elif article.display == "full":
        run.counts.summarized += 1
    elif article.display == "headline_only":
        run.counts.headline_only += 1
    else:
        run.counts.hidden += 1


def rebuild_snapshot(store: Store, now: datetime, last_run_at: datetime) -> None:
    snapshot = _build_snapshot(
        store.articles_since(now - SNAPSHOT_LOOKBACK),
        store.load_events(),
        store.load_stats(),
        now,
        last_run_at,
    )
    store.save_snapshot(snapshot)


def _promote_stats(store: Store, new: list[StatCandidate]) -> list[StatDoc]:
    store.add_stat_candidates(new)
    current = {s.key: s for s in store.load_stats()}
    changed: list[StatDoc] = []
    for key in {c.key for c in new}:
        promoted = promote_stat(current.get(key), store.stat_candidates(key))
        if promoted is not None:
            store.save_stat(promoted)
            changed.append(promoted)
            log.info(
                "stat %s updated to %d (as of %s)", key, promoted.value, promoted.as_of
            )
    return changed


def _refresh_market(deps: Deps, run: RunRecord) -> None:
    """The daily market job. Any failure is logged and recorded, never raised."""
    try:
        result = refresh_market(
            deps.store,
            deps.http,
            deps.now(),
            alphavantage_api_key=deps.settings.alphavantage_api_key,
            sec_user_agent=deps.settings.sec_user_agent,
        )
    except Exception as exc:  # the market page must never break the news run
        log.exception("market refresh failed")
        run.errors.append(f"market: {type(exc).__name__}")
        return
    run.errors.extend(f"market {error}" for error in result.errors)


def run_pipeline(
    deps: Deps, dry_run: bool = False, max_items: int | None = None
) -> RunRecord:
    started = deps.now()
    store = deps.store
    run = RunRecord(
        _id=f"run-{started:%Y%m%dT%H%M%S%fZ}", started_at=started, dry_run=dry_run
    )
    if store.publishing_paused():
        log.warning("publishing is paused (settings.publishing_paused); nothing to do")
        run.paused, run.ok, run.finished_at = True, True, deps.now()
        store.save_run(run)
        return run

    chain = collect(
        deps.http,
        store,
        started,
        deps.settings.google_news_base_url,
        deps.settings.google_news_queries,
        gdelt_sleep=deps.gdelt_sleep,
    )
    run.origin_used = chain.origins_used
    run.errors.extend(chain.errors)
    run.counts.fetched = len(chain.items)
    if not chain.origins_used:
        log.error("every source failed; keeping the current snapshot")
        run.finished_at = deps.now()
        store.save_run(run)
        return run

    limit = max_items or deps.settings.max_items_per_run
    fresh = _new_candidates(deps, chain.items, run, limit)

    existing = [
        ClusterItem(
            id=a.id, title=a.title, published_at=a.published_at, cluster_id=a.cluster_id
        )
        for a in store.articles_since(started - CLUSTER_LOOKBACK)
    ]
    clusters = assign_clusters(
        [
            ClusterItem(id=c.id, title=c.item.title, published_at=c.item.published_at)
            for c in fresh
        ],
        existing,
    )

    events = store.load_events()
    touched: dict[str, EventDoc] = {}
    stat_candidates: list[StatCandidate] = []
    tokens_in = tokens_out = 0

    processed: set[str] = set()

    def handle(outcome: ItemOutcome) -> None:
        nonlocal tokens_in, tokens_out
        processed.add(outcome.article.id)
        store.save_article(outcome.article)
        _count(run, outcome.article)
        tokens_in += outcome.input_tokens
        tokens_out += outcome.output_tokens
        for cand in outcome.events:
            event = merge_event(events, cand)
            touched[event.id] = event
        stat_candidates.extend(outcome.stats)

    for cand in fresh:
        try:
            handle(process_item(deps, cand, clusters[cand.id]))
        except Exception as exc:  # one bad article must not kill the run
            log.exception("failed to process %s", cand.item.source_domain)
            run.errors.append(f"item {cand.id}: {type(exc).__name__}")

    if deps.summarizer is not None and not dry_run:
        for article in store.articles_to_retry(
            started - timedelta(hours=48), MAX_ENRICH_ATTEMPTS
        ):
            if article.id in processed:
                continue  # failed moments ago; retry on a later run
            retry_cand = Candidate(
                item=RawItem(
                    title=article.title,
                    url=article.url,
                    source_name=article.source.name,
                    source_domain=article.source.domain,
                    published_at=article.published_at,
                    origin=article.origin,
                    guid=article.gn_guid,
                ),
                url=article.url,
                id=article.id,
            )
            try:
                handle(
                    process_item(
                        deps, retry_cand, article.cluster_id, article.enrich_attempts
                    )
                )
            except Exception as exc:
                log.exception("retry failed for %s", article.source.domain)
                run.errors.append(f"retry {article.id}: {type(exc).__name__}")

    store.save_events(list(touched.values()))
    _promote_stats(store, stat_candidates)

    finished = deps.now()
    rebuild_snapshot(store, finished, last_run_at=started)
    if not dry_run:
        if deps.market:
            # Before revalidate: the web caches everything under one tag, so a
            # single POST refreshes both the news and the market page.
            _refresh_market(deps, run)
        revalidate.trigger(
            deps.http, deps.settings.revalidate_url, deps.settings.revalidate_secret
        )

    run.tokens.input, run.tokens.output = tokens_in, tokens_out
    if deps.summarizer is not None:
        run.cost_usd = estimate_cost_usd(deps.summarizer.model, tokens_in, tokens_out)
    run.ok = True
    run.finished_at = deps.now()
    store.save_run(run)
    log.info(
        "run done: fetched=%d new=%d full=%d headline=%d irrelevant=%d "
        "tokens=%d/%d cost=%s",
        run.counts.fetched,
        run.counts.new,
        run.counts.summarized,
        run.counts.headline_only,
        run.counts.irrelevant,
        tokens_in,
        tokens_out,
        run.cost_usd,
    )
    return run
