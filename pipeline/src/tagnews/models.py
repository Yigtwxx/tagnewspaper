"""Pydantic models mirroring `shared/CONTRACT.md`.

Collections store datetimes as BSON Dates (timezone-aware UTC datetimes here).
The `snapshot` document stores ISO-8601 UTC strings via `model_dump(mode="json")`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, PlainSerializer

Category = Literal[
    "dava",
    "regulasyon",
    "taksici_odasi",
    "sirket",
    "surucu_yolcu",
    "saha",
    "ekonomi",
    "diger",
]
Actor = Literal[
    "marti",
    "taksici_odasi",
    "ibb_ukome",
    "bakanlik",
    "mahkeme",
    "surucu",
    "yolcu",
    "diger",
]
Display = Literal["full", "headline_only", "hidden"]
RiskLevel = Literal["low", "medium", "high"]
Origin = Literal["google_news", "publisher_rss", "gdelt"]
EventType = Literal["court_decision", "filing", "regulation", "statement", "other"]
StatKey = Literal["registered_riders", "drivers", "drivers_istanbul"]

CATEGORIES: tuple[Category, ...] = (
    "dava",
    "regulasyon",
    "taksici_odasi",
    "sirket",
    "surucu_yolcu",
    "saha",
    "ekonomi",
    "diger",
)
ACTORS: tuple[Actor, ...] = (
    "marti",
    "taksici_odasi",
    "ibb_ukome",
    "bakanlik",
    "mahkeme",
    "surucu",
    "yolcu",
    "diger",
)


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _iso_z(value: datetime) -> str:
    return _ensure_utc(value).strftime("%Y-%m-%dT%H:%M:%SZ")


# A UTC datetime: "YYYY-MM-DDTHH:MM:SSZ" in JSON mode, a datetime in python mode
# (so pymongo stores a BSON Date).
UtcDatetime = Annotated[
    datetime,
    AfterValidator(_ensure_utc),
    PlainSerializer(_iso_z, return_type=str, when_used="json"),
]
IsoDate = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class SourceRef(_Model):
    name: str
    domain: str


class ActorStatement(_Model):
    actor: Actor
    summary: str


class ArticleView(_Model):
    """Public projection of an article (snapshot `latest`, `/api/news`)."""

    id: str
    url: str
    title: str
    source: SourceRef
    published_at: UtcDatetime
    display: Display
    summary: str | None
    category: Category
    actors: list[Actor]
    is_allegation: bool
    risk_level: RiskLevel
    cluster_id: str
    origin: Origin


class ArticleDoc(_Model):
    """A document in the `articles` collection.

    Fields after `prompt_version` are pipeline-internal bookkeeping, not part of the
    public contract (the web app never reads them).
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = Field(alias="_id")
    url: str
    title: str
    source: SourceRef
    published_at: UtcDatetime
    fetched_at: UtcDatetime
    display: Display
    summary: str | None
    category: Category
    actors: list[Actor]
    actor_statements: list[ActorStatement]
    is_allegation: bool
    risk_level: RiskLevel
    cluster_id: str
    origin: Origin
    model: str | None
    prompt_version: str | None
    gn_guid: str | None = None
    relevant: bool = True
    enrich_status: Literal["ok", "title_only", "refused", "error", "guard_failed"] = (
        "ok"
    )
    enrich_attempts: int = 0

    def to_view(self) -> ArticleView:
        return ArticleView(
            id=self.id,
            url=self.url,
            title=self.title,
            source=self.source,
            published_at=self.published_at,
            display=self.display,
            summary=self.summary,
            category=self.category,
            actors=self.actors,
            is_allegation=self.is_allegation,
            risk_level=self.risk_level,
            cluster_id=self.cluster_id,
            origin=self.origin,
        )

    def to_mongo(self) -> dict[str, object]:
        return self.model_dump(mode="python", by_alias=True)


class EventEvidence(_Model):
    url: str
    source_name: str
    domain: str


class EventView(_Model):
    id: str
    date: IsoDate
    type: EventType
    title: str
    description: str
    court: str | None
    evidence: list[EventEvidence]
    published: bool
    is_seed: bool


class EventDoc(_Model):
    """An `events` document; `fingerprints` maps evidence URL -> text shingles."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = Field(alias="_id")
    date: IsoDate
    type: EventType
    title: str
    description: str
    court: str | None
    evidence: list[EventEvidence]
    published: bool
    is_seed: bool
    fingerprints: dict[str, list[int]] = Field(default_factory=dict)

    def to_view(self) -> EventView:
        return EventView(
            id=self.id,
            date=self.date,
            type=self.type,
            title=self.title,
            description=self.description,
            court=self.court,
            evidence=self.evidence,
            published=self.published,
            is_seed=self.is_seed,
        )

    def to_mongo(self) -> dict[str, object]:
        return self.model_dump(mode="python", by_alias=True)


class Stat(_Model):
    key: StatKey
    label: str
    value: int
    as_of: IsoDate
    scope: str
    source_name: str
    source_url: str


class StatDoc(Stat):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = Field(alias="_id")

    def to_view(self) -> Stat:
        return Stat(**self.model_dump(exclude={"id"}))


class StatCandidate(_Model):
    """A figure found in an article; promoted to `stats` only when corroborated."""

    model_config = ConfigDict(extra="ignore")

    key: StatKey
    value: int
    raw_text: str
    as_of: IsoDate
    url: str
    source_name: str
    domain: str
    fingerprint: list[int]
    seen_at: UtcDatetime


class LeadSource(_Model):
    name: str
    domain: str
    url: str


class Lead(_Model):
    article: ArticleView
    sources: list[LeadSource]


class DailyCount(_Model):
    date: IsoDate
    count: int


class SourceCount(_Model):
    name: str
    domain: str
    count: int


class CategoryWeek(_Model):
    week_start: IsoDate
    counts: dict[Category, int]


class ActorStatementView(_Model):
    actor: Actor
    summary: str
    date: UtcDatetime
    article_id: str
    source_name: str
    url: str


class Totals(_Model):
    articles_90d: int
    sources_90d: int


class TermCount(_Model):
    term: str
    count: int


class Snapshot(_Model):
    id: Literal["current"] = Field(default="current", alias="_id")
    generated_at: UtcDatetime
    last_run_at: UtcDatetime
    lead: Lead | None
    latest: list[ArticleView]
    events: list[EventView]
    stats: list[Stat]
    daily_counts: list[DailyCount]
    source_counts: list[SourceCount]
    category_weekly: list[CategoryWeek]
    actor_statements: list[ActorStatementView]
    totals: Totals
    top_terms: list[TermCount] = Field(default_factory=list)

    def to_mongo(self) -> dict[str, object]:
        """JSON-mode dump: the snapshot stores ISO strings, not BSON Dates."""
        return self.model_dump(mode="json", by_alias=True)


class NewsPage(_Model):
    items: list[ArticleView]
    next_cursor: str | None


class RunCounts(_Model):
    fetched: int = 0
    new: int = 0
    summarized: int = 0
    headline_only: int = 0
    hidden: int = 0
    irrelevant: int = 0


class TokenUsage(_Model):
    input: int = 0
    output: int = 0


class RunRecord(_Model):
    id: str = Field(alias="_id")
    started_at: UtcDatetime
    finished_at: UtcDatetime | None = None
    ok: bool = False
    origin_used: list[Origin] = Field(default_factory=list)
    counts: RunCounts = Field(default_factory=RunCounts)
    errors: list[str] = Field(default_factory=list)
    tokens: TokenUsage = Field(default_factory=TokenUsage)
    cost_usd: float | None = None
    dry_run: bool = False
    paused: bool = False

    def to_mongo(self) -> dict[str, object]:
        return self.model_dump(mode="python", by_alias=True)


class SourceHealth(_Model):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = Field(alias="_id")
    consecutive_failures: int = 0
    skip_until: UtcDatetime | None = None
    last_error: str | None = None


def utc_now() -> datetime:
    return datetime.now(UTC)
