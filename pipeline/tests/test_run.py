"""End-to-end runs against mocked HTTP, a fake LLM and an in-memory store."""

from __future__ import annotations

from datetime import date, datetime

import httpx
import pytest
import respx

from tagnews.config import Settings
from tagnews.llm import LlmResult
from tagnews.market import ALPHA_VANTAGE_URL, EDGAR_SUBMISSIONS_URL
from tagnews.run import Deps, run_pipeline
from tagnews.store import MemoryStore
from tagnews.textnorm import article_id

from conftest import (
    EDGAR_SAMPLE,
    FIXTURES,
    SOURCE_TEXT,
    FakeExtractor,
    FakeMatcher,
    FakeSummarizer,
    alpha_vantage_payload,
    load_json,
    make_enrichment,
    weekdays,
)

BASE = "https://news.google.test/rss/search"
REVALIDATE = "https://site.test/api/revalidate"


def _decoder(batch: list[str]) -> list[dict[str, object]]:
    """Deterministic fake: the same Google URL always decodes to the same target."""
    return [
        {
            "success": True,
            "decoded_url": f"https://pub.example/haber/{article_id(url)}?utm_source=gn",
        }
        for url in batch
    ]


def _deps(
    store: MemoryStore,
    client: httpx.Client,
    summarizer: FakeSummarizer | None,
    text: str | None,
    now: datetime,
    market: bool = False,
    alphavantage_api_key: str | None = None,
    matcher: FakeMatcher | None = None,
) -> Deps:
    settings = Settings(
        google_news_base_url=BASE,
        google_news_queries=('"Martı TAG"',),
        revalidate_url=REVALIDATE,
        revalidate_secret="test-secret",
        alphavantage_api_key=alphavantage_api_key,
        sec_user_agent="tagnewspaper ops@example.test",
    )
    return Deps(
        settings=settings,
        store=store,
        http=client,
        summarizer=summarizer,
        extractor=FakeExtractor(text),
        batch_decoder=_decoder,
        now=lambda: now,
        gdelt_sleep=False,
        market=market,
        matcher=matcher,
    )


def _mock_google() -> None:
    respx.get(url__startswith=BASE).mock(
        return_value=httpx.Response(
            200, content=(FIXTURES / "google_news_sample.xml").read_bytes()
        )
    )


@respx.mock
def test_run_pipeline_new_items_publishes_summaries(now: datetime) -> None:
    _mock_google()
    revalidate = respx.post("https://site.test/api/revalidate").mock(
        return_value=httpx.Response(200, json={"revalidated": True})
    )
    store = MemoryStore()
    summarizer = FakeSummarizer([])
    with httpx.Client() as client:
        run = run_pipeline(
            _deps(store, client, summarizer, SOURCE_TEXT, now), max_items=3
        )

    assert run.ok, run.errors
    assert run.counts.new == 3
    assert run.counts.summarized == 3, f"counts: {run.counts}"
    assert run.tokens.input == 300
    assert run.cost_usd is not None and run.cost_usd > 0
    assert len(store.articles) == 3
    article = next(iter(store.articles.values()))
    assert article.display == "full"
    assert article.url.startswith("https://pub.example/haber/")
    assert "utm_source" not in article.url
    assert article.gn_guid
    assert store.snapshot is not None and len(store.snapshot.latest) == 3
    assert revalidate.called
    assert revalidate.calls[0].request.headers["x-revalidate-secret"] == "test-secret"
    # Three outlets, one event; their fake texts are identical, so it stays unpublished.
    event = next(iter(store.events.values()))
    assert len(event.evidence) == 3 and not event.published
    # One figure (4,9 milyon) from copies of one text: not corroborated.
    assert len(store.candidates) == 3 and not store.stats

    # A second run sees the same feed: nothing new, no extra LLM calls.
    calls = len(summarizer.calls)
    with httpx.Client() as client:
        second = run_pipeline(
            _deps(store, client, summarizer, SOURCE_TEXT, now), max_items=3
        )
    assert second.counts.new == 3  # the 3 items not processed the first time
    assert len(store.articles) == 6
    assert len(summarizer.calls) == calls + 3


@respx.mock
def test_run_pipeline_guard_failure_degrades_to_headline(now: datetime) -> None:
    _mock_google()
    respx.post("https://site.test/api/revalidate").mock(
        return_value=httpx.Response(200)
    )
    bad = make_enrichment(
        summary=(
            "Martı TAG vergi kaçırıyor ve faturaları usulsüz kesiyor. Bu durum "
            "taksicileri zor durumda bırakıyor ve hemen durdurulması gerekiyor."
        ),
        is_allegation=True,
        risk_level="high",
    )
    summarizer = FakeSummarizer(
        [LlmResult("ok", bad, 10, 5), LlmResult("ok", bad, 10, 5)]
    )
    store = MemoryStore()
    with httpx.Client() as client:
        run = run_pipeline(
            _deps(store, client, summarizer, SOURCE_TEXT, now), max_items=1
        )
    article = next(iter(store.articles.values()))
    assert article.display == "headline_only", "unattributed allegation must not ship"
    assert article.summary is None
    assert article.is_allegation
    assert article.enrich_status == "guard_failed"
    assert summarizer.calls[1][1], "the retry must carry guard feedback"
    assert run.counts.headline_only == 1


@respx.mock
def test_run_pipeline_short_text_is_headline_only(now: datetime) -> None:
    _mock_google()
    respx.post("https://site.test/api/revalidate").mock(
        return_value=httpx.Response(200)
    )
    summarizer = FakeSummarizer([])
    store = MemoryStore()
    with httpx.Client() as client:
        run_pipeline(
            _deps(store, client, summarizer, "çok kısa metin", now), max_items=1
        )
    article = next(iter(store.articles.values()))
    assert article.display == "headline_only"
    assert article.summary is None
    assert summarizer.calls[0][0].text is None, "title_only mode: no snippet summaries"


@respx.mock
def test_run_pipeline_refusal_and_irrelevant_are_not_summarized(now: datetime) -> None:
    _mock_google()
    respx.post("https://site.test/api/revalidate").mock(
        return_value=httpx.Response(200)
    )
    summarizer = FakeSummarizer(
        [
            LlmResult("refused", None, 5, 0, "cyber"),
            LlmResult("ok", make_enrichment(relevant=False, summary=""), 5, 5),
        ]
    )
    store = MemoryStore()
    with httpx.Client() as client:
        run = run_pipeline(
            _deps(store, client, summarizer, SOURCE_TEXT, now), max_items=2
        )
    statuses = sorted((a.enrich_status, a.display) for a in store.articles.values())
    assert statuses == [("ok", "hidden"), ("refused", "headline_only")]
    assert run.counts.irrelevant == 1 and run.counts.headline_only == 1


@respx.mock
def test_run_pipeline_paused_skips_everything(now: datetime) -> None:
    google = respx.get(url__startswith=BASE).mock(return_value=httpx.Response(200))
    store = MemoryStore()
    store.paused = True
    with httpx.Client() as client:
        run = run_pipeline(_deps(store, client, FakeSummarizer([]), SOURCE_TEXT, now))
    assert run.paused and run.ok
    assert not google.called
    assert store.snapshot is None


@respx.mock
def test_run_pipeline_llm_error_is_retried_next_run(now: datetime) -> None:
    _mock_google()
    respx.post("https://site.test/api/revalidate").mock(
        return_value=httpx.Response(200)
    )
    store = MemoryStore()
    failing = FakeSummarizer([LlmResult("error", None, 0, 0, "rate_limited")])
    with httpx.Client() as client:
        run_pipeline(_deps(store, client, failing, SOURCE_TEXT, now), max_items=1)
    article = next(iter(store.articles.values()))
    assert article.enrich_status == "error" and article.enrich_attempts == 1

    healthy = FakeSummarizer([])
    with httpx.Client() as client:
        run_pipeline(_deps(store, client, healthy, SOURCE_TEXT, now), max_items=1)
    assert store.articles[article.id].display == "full", "the retry pass fixed it"


@respx.mock
def test_run_pipeline_market_refresh_precedes_single_revalidate(now: datetime) -> None:
    _mock_google()
    edgar = respx.get(EDGAR_SUBMISSIONS_URL).mock(
        return_value=httpx.Response(200, json=load_json(EDGAR_SAMPLE))
    )
    respx.get(url__startswith=ALPHA_VANTAGE_URL).mock(
        return_value=httpx.Response(
            200, json=alpha_vantage_payload(weekdays(date(2026, 10, 1), 5))
        )
    )
    revalidate = respx.post(REVALIDATE).mock(return_value=httpx.Response(200))
    store = MemoryStore()
    with httpx.Client() as client:
        deps = _deps(
            store,
            client,
            FakeSummarizer([]),
            SOURCE_TEXT,
            now,
            market=True,
            alphavantage_api_key="av-test-key",
        )
        run = run_pipeline(deps, max_items=1)

    assert run.ok and not run.errors, run.errors
    assert store.market is not None and len(store.market.prices) == 5
    assert revalidate.call_count == 1, "one POST covers news and market"
    order = [call.request.url.host for call in respx.calls]
    assert order.index("data.sec.gov") < order.index("site.test"), order
    assert edgar.call_count == 1


@respx.mock
def test_run_pipeline_market_failure_keeps_news_run_ok(now: datetime) -> None:
    _mock_google()
    respx.get(EDGAR_SUBMISSIONS_URL).mock(return_value=httpx.Response(403))
    revalidate = respx.post(REVALIDATE).mock(return_value=httpx.Response(200))
    store = MemoryStore()
    with httpx.Client() as client:
        run = run_pipeline(
            _deps(store, client, FakeSummarizer([]), SOURCE_TEXT, now, market=True),
            max_items=1,
        )

    assert run.ok
    assert run.errors == ["market edgar: HTTP 403"]
    assert store.market is None
    assert store.snapshot is not None and revalidate.called


@respx.mock
def test_run_pipeline_market_crash_is_logged_not_raised(
    now: datetime, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_google()
    respx.post(REVALIDATE).mock(return_value=httpx.Response(200))
    store = MemoryStore()

    def broken() -> None:
        raise RuntimeError("market collection unreadable")

    monkeypatch.setattr(store, "load_market", broken)
    with httpx.Client() as client:
        run = run_pipeline(
            _deps(store, client, FakeSummarizer([]), SOURCE_TEXT, now, market=True),
            max_items=1,
        )

    assert run.ok
    assert run.errors == ["market: RuntimeError"]
    assert store.runs[-1].ok, "the run log is still written"


@respx.mock
def test_run_pipeline_story_matcher_groups_articles_and_counts_tokens(
    now: datetime,
) -> None:
    _mock_google()
    respx.post("https://site.test/api/revalidate").mock(
        return_value=httpx.Response(200)
    )
    matcher = FakeMatcher("c-story")
    store = MemoryStore()
    with httpx.Client() as client:
        run = run_pipeline(
            _deps(store, client, FakeSummarizer([]), SOURCE_TEXT, now, matcher=matcher),
            max_items=3,
        )

    clusters = {a.cluster_id for a in store.articles.values()}
    assert clusters == {"c-story"}, (
        f"matched articles should share the story: {clusters}"
    )
    assert run.tokens.input == 3 * 100 + 3 * 20, f"matcher tokens missing: {run.tokens}"
    assert matcher.offered[0] == [], "the first article has no earlier story to join"
    assert "c-story" in matcher.offered[-1], "later articles see stories saved this run"
