"""The shared fixtures are the contract with the web app: both sides must parse them."""

from __future__ import annotations

import json

from tagnews.models import ArticleDoc, MarketDoc, NewsPage, Snapshot

from conftest import SHARED_FIXTURES


def _load(name: str) -> dict[str, object]:
    return json.loads((SHARED_FIXTURES / name).read_text(encoding="utf-8"))


def test_snapshot_fixture_roundtrip_is_lossless() -> None:
    raw = _load("snapshot.sample.json")
    snapshot = Snapshot.model_validate(raw)
    assert snapshot.lead is not None
    assert len(snapshot.daily_counts) == 90
    assert len(snapshot.category_weekly) == 16
    assert all(len(week.counts) == 8 for week in snapshot.category_weekly)
    assert snapshot.to_mongo() == raw


def test_article_fixture_roundtrip_is_lossless() -> None:
    raw = _load("article.sample.json")
    article = ArticleDoc.model_validate(raw)
    assert article.id == raw["_id"]
    internal = {"gn_guid", "relevant", "enrich_status", "enrich_attempts"}
    dumped = article.model_dump(mode="json", by_alias=True, exclude=internal)
    assert dumped == raw


def test_news_page_fixture_roundtrip_is_lossless() -> None:
    raw = _load("news_page.sample.json")
    page = NewsPage.model_validate(raw)
    assert page.next_cursor is not None
    assert page.model_dump(mode="json") == raw


def test_market_fixture_roundtrip_is_lossless() -> None:
    raw = _load("market.sample.json")
    market = MarketDoc.model_validate(raw)
    assert market.id == market.symbol == "MRT"
    assert market.prices and market.price_source == "Alpha Vantage"
    assert all(
        f.url.startswith("https://www.sec.gov/Archives/") for f in market.filings
    )
    assert market.to_mongo() == raw
