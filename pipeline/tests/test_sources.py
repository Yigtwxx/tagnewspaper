from __future__ import annotations

from datetime import datetime

import httpx
import pytest
import respx

from tagnews.sources import gdelt, google_news, publisher_rss
from tagnews.sources.base import SourceError
from tagnews.sources.chain import MemoryHealthStore, collect

from conftest import FIXTURES

BASE = "https://news.google.test/rss/search"
QUERIES = ('"Martı TAG"',)

RSS_WITH_ONE_MATCH = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Gundem</title>
<item><title>Martı TAG sürücüleri için yeni karar</title>
<link>https://www.ornek.example/haber/1?utm_source=rss</link>
<pubDate>Sun, 01 Nov 2026 19:28:00 GMT</pubDate></item>
<item><title>Sahilde martılar sürü halinde</title>
<link>https://www.ornek.example/haber/2</link>
<pubDate>Sun, 01 Nov 2026 18:00:00 GMT</pubDate></item>
</channel></rss>""".encode()


def test_google_parse_recorded_feed_yields_items(now: datetime) -> None:
    items = google_news.parse_feed(
        (FIXTURES / "google_news_sample.xml").read_bytes(), now
    )
    assert len(items) == 6
    first = items[0]
    assert first.origin == "google_news"
    assert first.needs_decode
    assert first.source_name == "T24"
    assert first.source_domain == "t24.com.tr"
    assert not first.title.endswith(" - T24")
    assert first.guid


def test_google_parse_html_page_raises_source_error(now: datetime) -> None:
    with pytest.raises(SourceError):
        google_news.parse_feed(b"<html><body>blocked</body></html>", now)


def test_publisher_is_relevant_seagull_text_is_rejected() -> None:
    assert publisher_rss.is_relevant("MARTI TAG için karar çıktı")
    assert publisher_rss.is_relevant("Martı'nın taksi uygulaması mahkemede")
    assert not publisher_rss.is_relevant("Sahilde martılar sürü halinde")
    assert not publisher_rss.is_relevant("Martı kuşu yuvasını terk etti")


def test_publisher_parse_feed_keeps_only_relevant_items(now: datetime) -> None:
    feed = publisher_rss.Feed("Örnek", "ornek.example", "https://ornek.example/rss")
    items = publisher_rss.parse_feed(RSS_WITH_ONE_MATCH, feed, now)
    assert [i.url for i in items] == ["https://www.ornek.example/haber/1"]
    assert items[0].origin == "publisher_rss"


def test_gdelt_parse_response_canonicalizes_urls(now: datetime) -> None:
    payload = {
        "articles": [
            {
                "url": "https://www.ornek.example/a?utm_medium=x",
                "title": "Martı TAG kararı",
                "seendate": "20261101T193000Z",
                "domain": "ornek.example",
            }
        ]
    }
    items = gdelt.parse_response(payload, now)
    assert items[0].url == "https://www.ornek.example/a"
    assert items[0].published_at.hour == 19


@respx.mock
def test_chain_google_healthy_uses_google_only(now: datetime) -> None:
    respx.get(url__startswith=BASE).mock(
        return_value=httpx.Response(
            200, content=(FIXTURES / "google_news_sample.xml").read_bytes()
        )
    )
    health = MemoryHealthStore()
    with httpx.Client() as client:
        result = collect(client, health, now, BASE, QUERIES, gdelt_sleep=False)
    assert result.origins_used == ["google_news"]
    assert len(result.items) == 6
    assert health.get_health("google_news").consecutive_failures == 0


@respx.mock
def test_chain_google_429_falls_back_to_publishers_and_gdelt(now: datetime) -> None:
    respx.get(url__startswith=BASE).mock(return_value=httpx.Response(429))
    for feed in publisher_rss.FEEDS:
        respx.get(feed.url).mock(
            return_value=httpx.Response(200, content=RSS_WITH_ONE_MATCH)
        )
    respx.get(url__startswith=gdelt.API_URL).mock(
        return_value=httpx.Response(
            200,
            json={"articles": []},
            headers={"content-type": "application/json"},
        )
    )
    health = MemoryHealthStore()
    with httpx.Client() as client:
        result = collect(client, health, now, BASE, QUERIES, gdelt_sleep=False)
    assert result.origins_used == ["publisher_rss", "gdelt"]
    assert {i.origin for i in result.items} == {"publisher_rss"}
    assert health.get_health("google_news").consecutive_failures == 1
    assert any("google_news" in e for e in result.errors)


@respx.mock
def test_chain_three_google_failures_skips_google_for_24h(now: datetime) -> None:
    google = respx.get(url__startswith=BASE).mock(return_value=httpx.Response(403))
    for feed in publisher_rss.FEEDS:
        respx.get(feed.url).mock(
            return_value=httpx.Response(200, content=RSS_WITH_ONE_MATCH)
        )
    respx.get(url__startswith=gdelt.API_URL).mock(return_value=httpx.Response(429))
    health = MemoryHealthStore()
    with httpx.Client() as client:
        for _ in range(3):
            collect(client, health, now, BASE, QUERIES, gdelt_sleep=False)
        state = health.get_health("google_news")
        assert state.consecutive_failures == 3
        assert state.skip_until is not None and state.skip_until > now
        calls_before = google.call_count
        result = collect(client, health, now, BASE, QUERIES, gdelt_sleep=False)
        assert google.call_count == calls_before  # skipped, not called
        assert result.origins_used == ["publisher_rss"]


@respx.mock
def test_google_fetch_zero_results_raises_source_error(now: datetime) -> None:
    empty = (
        b'<?xml version="1.0"?><rss version="2.0">'
        b"<channel><title>x</title></channel></rss>"
    )
    respx.get(url__startswith=BASE).mock(
        return_value=httpx.Response(200, content=empty)
    )
    with httpx.Client() as client, pytest.raises(SourceError, match="zero results"):
        google_news.fetch(client, BASE, QUERIES, now)
