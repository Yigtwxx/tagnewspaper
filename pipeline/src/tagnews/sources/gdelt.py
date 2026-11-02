"""GDELT DOC 2.0 API (fallback source). Limit: one request per 5 seconds."""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime

import httpx

from tagnews.sources.base import RawItem, SourceError, get_with_retry
from tagnews.textnorm import canonicalize_url, collapse_ws, domain_of

log = logging.getLogger(__name__)

NAME = "gdelt"
API_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
QUERY = '("Martı TAG" OR "Martı taksi") sourcelang:turkish'
MIN_INTERVAL_S = 5.5

_last_call: float = 0.0


def _respect_rate_limit(sleep: bool) -> None:
    global _last_call
    wait = MIN_INTERVAL_S - (time.monotonic() - _last_call)
    if wait > 0 and sleep:
        time.sleep(wait)
    _last_call = time.monotonic()


def parse_seendate(value: str, fallback: datetime) -> datetime:
    try:
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return fallback


def parse_response(payload: object, now: datetime) -> list[RawItem]:
    if not isinstance(payload, dict):
        raise SourceError("unexpected GDELT payload")
    articles = payload.get("articles") or []
    items: list[RawItem] = []
    for article in articles:
        url = article.get("url")
        title = collapse_ws(article.get("title") or "")
        if not url or not title:
            continue
        domain = (article.get("domain") or domain_of(url)).removeprefix("www.")
        items.append(
            RawItem(
                title=title,
                url=canonicalize_url(url),
                source_name=domain,
                source_domain=domain,
                published_at=parse_seendate(article.get("seendate", ""), now),
                origin="gdelt",
            )
        )
    return items


def fetch(client: httpx.Client, now: datetime, sleep: bool = True) -> list[RawItem]:
    _respect_rate_limit(sleep)
    params = {
        "query": QUERY,
        "mode": "artlist",
        "maxrecords": "75",
        "format": "json",
        "timespan": "3d",
        "sort": "datedesc",
    }
    response = get_with_retry(client, API_URL, timeout=30.0, params=params)
    if response.status_code != 200:
        raise SourceError(f"HTTP {response.status_code}")
    content_type = response.headers.get("content-type", "")
    if "json" not in content_type:
        # GDELT answers rate-limited calls with a plain-text notice.
        raise SourceError("non-JSON response (rate limited?)")
    try:
        payload = response.json()
    except ValueError as exc:
        raise SourceError("invalid JSON") from exc
    items = parse_response(payload, now)
    log.info("gdelt: %d items", len(items))
    return items
