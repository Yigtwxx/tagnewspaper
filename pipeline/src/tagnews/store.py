"""Persistence. `MongoStore` for real runs, `MemoryStore` for tests and dry runs."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import datetime
from typing import Any, Protocol

from pymongo import ASCENDING, DESCENDING, MongoClient, ReplaceOne
from pymongo.database import Database

from tagnews.models import (
    ArticleDoc,
    EventDoc,
    MarketDoc,
    RunRecord,
    Snapshot,
    SourceHealth,
    StatCandidate,
    StatDoc,
    StatKey,
)

log = logging.getLogger(__name__)

Doc = dict[str, Any]


class Store(Protocol):
    def publishing_paused(self) -> bool: ...
    def known_guids(self, guids: Iterable[str]) -> set[str]: ...
    def known_urls(self, urls: Iterable[str]) -> set[str]: ...
    def articles_since(self, since: datetime) -> list[ArticleDoc]: ...
    def articles_to_retry(
        self, since: datetime, max_attempts: int
    ) -> list[ArticleDoc]: ...
    def get_article(self, article_id: str) -> ArticleDoc | None: ...
    def save_article(self, article: ArticleDoc) -> None: ...
    def load_events(self) -> list[EventDoc]: ...
    def save_events(self, events: list[EventDoc]) -> None: ...
    def load_stats(self) -> list[StatDoc]: ...
    def save_stat(self, stat: StatDoc) -> None: ...
    def add_stat_candidates(self, candidates: list[StatCandidate]) -> None: ...
    def stat_candidates(self, key: StatKey) -> list[StatCandidate]: ...
    def get_health(self, name: str) -> SourceHealth: ...
    def save_health(self, health: SourceHealth) -> None: ...
    def save_snapshot(self, snapshot: Snapshot) -> None: ...
    def save_run(self, run: RunRecord) -> None: ...
    def last_run_at(self) -> datetime | None: ...
    def load_market(self) -> MarketDoc | None: ...
    def save_market(self, doc: MarketDoc) -> None: ...


class MongoStore:
    def __init__(self, uri: str, db_name: str) -> None:
        self._client: MongoClient[Doc] = MongoClient(
            uri,
            tz_aware=True,
            appname="tagnews-pipeline",
            serverSelectionTimeoutMS=15_000,
        )
        self.db: Database[Doc] = self._client[db_name]

    def close(self) -> None:
        self._client.close()

    def publishing_paused(self) -> bool:
        doc = self.db.settings.find_one({"_id": "global"})
        return bool(doc and doc.get("publishing_paused"))

    def known_guids(self, guids: Iterable[str]) -> set[str]:
        guid_list = list(guids)
        if not guid_list:
            return set()
        cursor = self.db.articles.find({"gn_guid": {"$in": guid_list}}, {"gn_guid": 1})
        return {doc["gn_guid"] for doc in cursor}

    def known_urls(self, urls: Iterable[str]) -> set[str]:
        url_list = list(urls)
        if not url_list:
            return set()
        cursor = self.db.articles.find({"url": {"$in": url_list}}, {"url": 1})
        return {doc["url"] for doc in cursor}

    def articles_since(self, since: datetime) -> list[ArticleDoc]:
        cursor = self.db.articles.find({"published_at": {"$gte": since}})
        return [ArticleDoc.model_validate(doc) for doc in cursor]

    def articles_to_retry(self, since: datetime, max_attempts: int) -> list[ArticleDoc]:
        cursor = self.db.articles.find(
            {
                "enrich_status": "error",
                "enrich_attempts": {"$lt": max_attempts},
                "published_at": {"$gte": since},
            }
        ).sort("published_at", DESCENDING)
        return [ArticleDoc.model_validate(doc) for doc in cursor.limit(10)]

    def get_article(self, article_id: str) -> ArticleDoc | None:
        doc = self.db.articles.find_one({"_id": article_id})
        return ArticleDoc.model_validate(doc) if doc else None

    def save_article(self, article: ArticleDoc) -> None:
        self.db.articles.replace_one(
            {"_id": article.id}, article.to_mongo(), upsert=True
        )

    def load_events(self) -> list[EventDoc]:
        return [EventDoc.model_validate(doc) for doc in self.db.events.find()]

    def save_events(self, events: list[EventDoc]) -> None:
        if not events:
            return
        self.db.events.bulk_write(
            [ReplaceOne({"_id": e.id}, e.to_mongo(), upsert=True) for e in events]
        )

    def load_stats(self) -> list[StatDoc]:
        return [StatDoc.model_validate(doc) for doc in self.db.stats.find()]

    def save_stat(self, stat: StatDoc) -> None:
        self.db.stats.replace_one(
            {"_id": stat.id}, stat.model_dump(mode="python", by_alias=True), upsert=True
        )

    def add_stat_candidates(self, candidates: list[StatCandidate]) -> None:
        if candidates:
            self.db.stat_candidates.insert_many([c.model_dump() for c in candidates])

    def stat_candidates(self, key: StatKey) -> list[StatCandidate]:
        cursor = self.db.stat_candidates.find({"key": key}, {"_id": 0})
        return [StatCandidate.model_validate(doc) for doc in cursor]

    def get_health(self, name: str) -> SourceHealth:
        doc = self.db.source_health.find_one({"_id": name})
        return SourceHealth.model_validate(doc) if doc else SourceHealth(id=name)

    def save_health(self, health: SourceHealth) -> None:
        self.db.source_health.replace_one(
            {"_id": health.id},
            health.model_dump(mode="python", by_alias=True),
            upsert=True,
        )

    def save_snapshot(self, snapshot: Snapshot) -> None:
        self.db.snapshot.replace_one(
            {"_id": "current"}, snapshot.to_mongo(), upsert=True
        )

    def save_run(self, run: RunRecord) -> None:
        self.db.runs.replace_one({"_id": run.id}, run.to_mongo(), upsert=True)

    def last_run_at(self) -> datetime | None:
        doc = self.db.runs.find_one(
            {"ok": True, "dry_run": False}, sort=[("started_at", DESCENDING)]
        )
        return doc["started_at"] if doc else None

    def load_market(self) -> MarketDoc | None:
        doc = self.db.market.find_one({"_id": "MRT"})
        return MarketDoc.model_validate(doc) if doc else None

    def save_market(self, doc: MarketDoc) -> None:
        self.db.market.replace_one({"_id": doc.id}, doc.to_mongo(), upsert=True)

    def set_publishing_paused(self, paused: bool) -> None:
        self.db.settings.update_one(
            {"_id": "global"}, {"$set": {"publishing_paused": paused}}, upsert=True
        )

    def ensure_indexes(self) -> list[str]:
        created = [
            self.db.articles.create_index([("url", ASCENDING)], unique=True),
            self.db.articles.create_index(
                [
                    ("display", ASCENDING),
                    ("published_at", DESCENDING),
                    ("_id", DESCENDING),
                ]
            ),
            self.db.articles.create_index(
                [
                    ("display", ASCENDING),
                    ("category", ASCENDING),
                    ("published_at", DESCENDING),
                    ("_id", DESCENDING),
                ]
            ),
            self.db.articles.create_index([("cluster_id", ASCENDING)]),
            self.db.articles.create_index([("gn_guid", ASCENDING)], sparse=True),
            self.db.articles.create_index(
                [("enrich_status", ASCENDING), ("published_at", DESCENDING)]
            ),
            self.db.events.create_index([("date", ASCENDING)]),
            self.db.stat_candidates.create_index([("key", ASCENDING)]),
            # Keep the free tier small: run logs and candidates expire.
            self.db.runs.create_index(
                [("started_at", DESCENDING)], expireAfterSeconds=90 * 24 * 3600
            ),
            self.db.stat_candidates.create_index(
                [("seen_at", ASCENDING)], expireAfterSeconds=365 * 24 * 3600
            ),
        ]
        return created


class MemoryStore:
    """In-memory Store used by tests and `run --dry-run`."""

    def __init__(self) -> None:
        self.articles: dict[str, ArticleDoc] = {}
        self.events: dict[str, EventDoc] = {}
        self.stats: dict[str, StatDoc] = {}
        self.candidates: list[StatCandidate] = []
        self.health: dict[str, SourceHealth] = {}
        self.snapshot: Snapshot | None = None
        self.runs: list[RunRecord] = []
        self.market: MarketDoc | None = None
        self.paused = False

    def publishing_paused(self) -> bool:
        return self.paused

    def known_guids(self, guids: Iterable[str]) -> set[str]:
        known = {a.gn_guid for a in self.articles.values() if a.gn_guid}
        return {g for g in guids if g in known}

    def known_urls(self, urls: Iterable[str]) -> set[str]:
        known = {a.url for a in self.articles.values()}
        return {u for u in urls if u in known}

    def articles_since(self, since: datetime) -> list[ArticleDoc]:
        return [a for a in self.articles.values() if a.published_at >= since]

    def articles_to_retry(self, since: datetime, max_attempts: int) -> list[ArticleDoc]:
        return [
            a
            for a in self.articles.values()
            if a.enrich_status == "error"
            and a.enrich_attempts < max_attempts
            and a.published_at >= since
        ][:10]

    def get_article(self, article_id: str) -> ArticleDoc | None:
        return self.articles.get(article_id)

    def save_article(self, article: ArticleDoc) -> None:
        self.articles[article.id] = article

    def load_events(self) -> list[EventDoc]:
        return [e.model_copy(deep=True) for e in self.events.values()]

    def save_events(self, events: list[EventDoc]) -> None:
        for event in events:
            self.events[event.id] = event

    def load_stats(self) -> list[StatDoc]:
        return list(self.stats.values())

    def save_stat(self, stat: StatDoc) -> None:
        self.stats[stat.id] = stat

    def add_stat_candidates(self, candidates: list[StatCandidate]) -> None:
        self.candidates.extend(candidates)

    def stat_candidates(self, key: StatKey) -> list[StatCandidate]:
        return [c for c in self.candidates if c.key == key]

    def get_health(self, name: str) -> SourceHealth:
        return self.health.get(name, SourceHealth(id=name))

    def save_health(self, health: SourceHealth) -> None:
        self.health[health.id] = health

    def save_snapshot(self, snapshot: Snapshot) -> None:
        self.snapshot = snapshot

    def save_run(self, run: RunRecord) -> None:
        self.runs.append(run)

    def last_run_at(self) -> datetime | None:
        done = [r.started_at for r in self.runs if r.ok and not r.dry_run]
        return max(done) if done else None

    def load_market(self) -> MarketDoc | None:
        return self.market.model_copy(deep=True) if self.market else None

    def save_market(self, doc: MarketDoc) -> None:
        self.market = doc
