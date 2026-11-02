from __future__ import annotations

from datetime import datetime, timedelta

from tagnews.models import (
    ActorStatement,
    ArticleDoc,
    Category,
    Display,
    EventDoc,
    SourceRef,
    StatDoc,
)
from tagnews.snapshot import build_snapshot


def _article(
    idx: int,
    domain: str,
    published_at: datetime,
    cluster_id: str,
    category: Category = "dava",
    display: Display = "full",
    statements: list[ActorStatement] | None = None,
) -> ArticleDoc:
    return ArticleDoc(
        _id=f"{idx:016x}",
        url=f"https://{domain}/haber/{idx}",
        title=f"Haber {idx}",
        source=SourceRef(name=domain.split(".")[0].title(), domain=domain),
        published_at=published_at,
        fetched_at=published_at,
        display=display,
        summary="Habere göre bir gelişme yaşandı." if display == "full" else None,
        category=category,
        actors=["marti"],
        actor_statements=statements or [],
        is_allegation=False,
        risk_level="low",
        cluster_id=cluster_id,
        origin="google_news",
        model="claude-haiku-5-5",
        prompt_version="summarize_v1",
    )


def test_build_snapshot_mixed_articles_matches_contract(now: datetime) -> None:
    statement = ActorStatement(
        actor="taksici_odasi", summary="Oda tepki gösterdi, açıkladı."
    )
    articles = [
        _article(1, "a.example", now - timedelta(hours=2), "big"),
        _article(
            2, "b.example", now - timedelta(hours=3), "big", statements=[statement]
        ),
        _article(3, "c.example", now - timedelta(hours=4), "big"),
        _article(4, "d.example", now - timedelta(hours=1), "solo", category="saha"),
        _article(
            5, "d.example", now - timedelta(days=40), "old", display="headline_only"
        ),
        _article(6, "e.example", now - timedelta(days=200), "ancient"),
        _article(7, "f.example", now - timedelta(hours=1), "hid", display="hidden"),
    ]
    events = [
        EventDoc(
            _id="ev-b",
            date="2026-10-23",
            type="court_decision",
            title="B",
            description="b",
            court=None,
            evidence=[],
            published=True,
            is_seed=True,
        ),
        EventDoc(
            _id="ev-a",
            date="2026-06-24",
            type="court_decision",
            title="A",
            description="a",
            court=None,
            evidence=[],
            published=True,
            is_seed=True,
        ),
        EventDoc(
            _id="ev-x",
            date="2026-10-01",
            type="filing",
            title="X",
            description="x",
            court=None,
            evidence=[],
            published=False,
            is_seed=False,
        ),
    ]
    stats = [
        StatDoc(
            _id="drivers",
            key="drivers",
            label="Kayıtlı sürücü",
            value=584_000,
            as_of="2026-09-02",
            scope="Türkiye",
            source_name="Martı",
            source_url="https://ir.marti.tech/x",
        ),
        StatDoc(
            _id="registered_riders",
            key="registered_riders",
            label="TAG yolcusu",
            value=4_900_000,
            as_of="2026-09-02",
            scope="Türkiye",
            source_name="Martı",
            source_url="https://ir.marti.tech/x",
        ),
    ]
    snap = build_snapshot(articles, events, stats, now, last_run_at=now)

    assert snap.lead is not None, "expected a lead story"
    assert snap.lead.article.cluster_id == "big", (
        f"lead was {snap.lead.article.cluster_id}"
    )
    assert [s.domain for s in snap.lead.sources] == [
        "a.example",
        "b.example",
        "c.example",
    ]
    assert [a.id for a in snap.latest][:2] == [f"{4:016x}", f"{1:016x}"]
    assert all(a.display != "hidden" for a in snap.latest)
    assert len(snap.latest) == 5, "200-day-old and hidden articles are excluded"
    assert [e.id for e in snap.events] == ["ev-a", "ev-b"], "published only, date order"
    assert [s.key for s in snap.stats] == ["registered_riders", "drivers"]
    assert len(snap.daily_counts) == 90
    assert snap.daily_counts[-1].date == "2026-11-02"
    assert sum(d.count for d in snap.daily_counts) == snap.totals.articles_90d == 5
    assert len(snap.category_weekly) == 16
    assert snap.category_weekly[-1].week_start == "2026-11-02"
    assert snap.category_weekly[-1].counts["dava"] == 3
    assert snap.category_weekly[-1].counts["saha"] == 1
    assert snap.source_counts[0].domain == "d.example"
    assert [s.actor for s in snap.actor_statements] == ["taksici_odasi"]
    dumped = snap.to_mongo()
    assert dumped["_id"] == "current"
    assert dumped["generated_at"] == "2026-11-02T09:00:00Z"


def test_build_snapshot_empty_db_returns_empty_sections(now: datetime) -> None:
    snap = build_snapshot([], [], [], now, last_run_at=now)
    assert snap.lead is None
    assert snap.latest == []
    assert snap.totals.articles_90d == 0
    assert all(d.count == 0 for d in snap.daily_counts)
