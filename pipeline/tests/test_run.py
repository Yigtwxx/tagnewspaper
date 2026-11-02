"""End-to-end runs against mocked HTTP, a fake LLM and an in-memory store."""

from __future__ import annotations

from datetime import datetime

import httpx
import respx

from tagnews.config import Settings
from tagnews.llm import LlmResult
from tagnews.run import Deps, run_pipeline
from tagnews.store import MemoryStore
from tagnews.textnorm import article_id

from conftest import (
    FIXTURES,
    SOURCE_TEXT,
    FakeExtractor,
    FakeSummarizer,
    make_enrichment,
)

BASE = "https://news.google.test/rss/search"


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
) -> Deps:
    settings = Settings(
        google_news_base_url=BASE,
        google_news_queries=('"Martı TAG"',),
        revalidate_url="https://site.test/api/revalidate",
        revalidate_secret="test-secret",
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
