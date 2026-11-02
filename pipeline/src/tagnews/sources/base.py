"""Shared types for news sources."""

from __future__ import annotations

import calendar
import time
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from tagnews.models import Origin


class SourceError(Exception):
    """A source could not deliver usable results (HTTP error, block, parse failure)."""


@dataclass(frozen=True)
class RawItem:
    """One news item as delivered by a source, before decoding/enrichment."""

    title: str
    url: str
    source_name: str
    source_domain: str
    published_at: datetime
    origin: Origin
    guid: str | None = None
    # True when `url` is a news.google.com redirect that still needs decoding.
    needs_decode: bool = False


def struct_to_utc(value: time.struct_time | None, fallback: datetime) -> datetime:
    """feedparser's `*_parsed` fields are UTC struct_time values."""
    if value is None:
        return fallback
    return datetime.fromtimestamp(calendar.timegm(value), tz=UTC)


class _ServerError(Exception):
    pass


@retry(
    retry=retry_if_exception_type((httpx.TransportError, _ServerError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
def _get(
    client: httpx.Client,
    url: str,
    timeout: float,
    params: dict[str, str] | None,
    follow_redirects: bool,
    headers: dict[str, str] | None,
) -> httpx.Response:
    response = client.get(
        url,
        params=params,
        headers=headers,
        timeout=timeout,
        follow_redirects=follow_redirects,
    )
    if response.status_code >= 500:
        raise _ServerError(str(response.status_code))
    return response


def get_with_retry(
    client: httpx.Client,
    url: str,
    timeout: float = 20.0,
    params: dict[str, str] | None = None,
    follow_redirects: bool = False,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    """GET with backoff on network errors and 5xx.

    4xx (incl. 429) is returned as-is: for feeds a 403/429 is a block signal that
    should trigger the fallback chain rather than hammering the server. `headers`
    are merged over the client's defaults (e.g. a per-API User-Agent).
    """
    try:
        return _get(client, url, timeout, params, follow_redirects, headers)
    except _ServerError as exc:
        raise SourceError(f"HTTP {exc}") from exc
    except httpx.HTTPError as exc:
        raise SourceError(f"request failed: {type(exc).__name__}") from exc
