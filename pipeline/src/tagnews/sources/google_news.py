"""Google News RSS search (primary source)."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import datetime
from urllib.parse import quote

import feedparser
import httpx

from tagnews.sources.base import RawItem, SourceError, get_with_retry, struct_to_utc
from tagnews.textnorm import collapse_ws, domain_of, strip_source_suffix

log = logging.getLogger(__name__)

NAME = "google_news"


def build_url(base_url: str, query: str) -> str:
    return f"{base_url}?q={quote(query)}&hl=tr&gl=TR&ceid=TR:tr"


def parse_feed(content: bytes, now: datetime) -> list[RawItem]:
    """Parse a Google News RSS document. Raises SourceError when it is not a feed."""
    feed = feedparser.parse(content)
    if feed.bozo and not feed.entries:
        raise SourceError(f"unparseable feed: {type(feed.bozo_exception).__name__}")
    if "title" not in feed.feed and not feed.entries:
        raise SourceError("response is not an RSS feed")
    items: list[RawItem] = []
    for entry in feed.entries:
        link = entry.get("link")
        title = entry.get("title")
        if not link or not title:
            continue
        source = entry.get("source") or {}
        source_name = collapse_ws(source.get("title") or "")
        source_href = source.get("href") or ""
        source_domain = domain_of(source_href) if source_href else ""
        if not source_name or not source_domain:
            continue
        items.append(
            RawItem(
                title=strip_source_suffix(title, source_name),
                url=link,
                source_name=source_name,
                source_domain=source_domain,
                published_at=struct_to_utc(entry.get("published_parsed"), now),
                origin="google_news",
                guid=entry.get("id") or link,
                needs_decode="news.google.com" in link,
            )
        )
    return items


def fetch(
    client: httpx.Client,
    base_url: str,
    queries: Sequence[str],
    now: datetime,
) -> list[RawItem]:
    """Fetch every query; any HTTP/parse problem or zero total results is a failure."""
    seen: set[str] = set()
    items: list[RawItem] = []
    for query in queries:
        url = build_url(base_url, query)
        response = get_with_retry(client, url, timeout=20.0)
        if response.status_code != 200:
            raise SourceError(f"HTTP {response.status_code}")
        for item in parse_feed(response.content, now):
            key = item.guid or item.url
            if key in seen:
                continue
            seen.add(key)
            items.append(item)
    if not items:
        # The search window spans several days; an empty answer means we are blocked
        # or the endpoint changed, not that nobody wrote about Martı TAG.
        raise SourceError("unexpected zero results")
    log.info("google_news: %d items from %d queries", len(items), len(queries))
    return items
