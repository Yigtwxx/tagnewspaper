"""Source chain: Google News first, publisher RSS + GDELT when Google fails.

A source that fails 3 runs in a row is skipped for 24 hours and then retried
automatically, so a temporary block heals without human intervention.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Protocol

import httpx

from tagnews.models import Origin, SourceHealth
from tagnews.sources import gdelt, google_news, publisher_rss
from tagnews.sources.base import RawItem, SourceError

log = logging.getLogger(__name__)

FAILURES_BEFORE_SKIP = 3
SKIP_DURATION = timedelta(hours=24)


class HealthStore(Protocol):
    def get_health(self, name: str) -> SourceHealth: ...

    def save_health(self, health: SourceHealth) -> None: ...


class MemoryHealthStore:
    def __init__(self) -> None:
        self._data: dict[str, SourceHealth] = {}

    def get_health(self, name: str) -> SourceHealth:
        return self._data.get(name, SourceHealth(id=name))

    def save_health(self, health: SourceHealth) -> None:
        self._data[health.id] = health


@dataclass
class ChainResult:
    items: list[RawItem] = field(default_factory=list)
    origins_used: list[Origin] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


Fetcher = Callable[[], list[RawItem]]


def _attempt(
    name: str,
    origin: Origin,
    fetcher: Fetcher,
    health_store: HealthStore,
    now: datetime,
    result: ChainResult,
) -> bool:
    health = health_store.get_health(name)
    if health.skip_until is not None and health.skip_until > now:
        result.errors.append(f"{name}: skipped until {health.skip_until.isoformat()}")
        return False
    try:
        items = fetcher()
    except SourceError as exc:
        failures = health.consecutive_failures + 1
        skip_until = now + SKIP_DURATION if failures >= FAILURES_BEFORE_SKIP else None
        health_store.save_health(
            SourceHealth(
                id=name,
                consecutive_failures=failures,
                skip_until=skip_until,
                last_error=str(exc)[:200],
            )
        )
        result.errors.append(f"{name}: {exc}")
        log.warning("source %s failed (%d in a row): %s", name, failures, exc)
        return False
    # Success (or a retry after the skip window): reset the counter.
    health_store.save_health(SourceHealth(id=name))
    result.items.extend(items)
    result.origins_used.append(origin)
    return True


def collect(
    client: httpx.Client,
    health_store: HealthStore,
    now: datetime,
    google_base_url: str,
    google_queries: tuple[str, ...],
    gdelt_sleep: bool = True,
) -> ChainResult:
    result = ChainResult()

    def google() -> list[RawItem]:
        return google_news.fetch(client, google_base_url, google_queries, now)

    if _attempt(google_news.NAME, "google_news", google, health_store, now, result):
        return result

    log.warning("falling back to publisher RSS + GDELT")

    def publishers() -> list[RawItem]:
        return publisher_rss.fetch(client, now)

    def gdelt_fetch() -> list[RawItem]:
        return gdelt.fetch(client, now, sleep=gdelt_sleep)

    _attempt(publisher_rss.NAME, "publisher_rss", publishers, health_store, now, result)
    _attempt(gdelt.NAME, "gdelt", gdelt_fetch, health_store, now, result)
    return result
