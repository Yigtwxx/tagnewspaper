"""Build the single `snapshot` document the home page renders (see CONTRACT)."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from tagnews.models import (
    ACTORS,
    CATEGORIES,
    ActorStatementView,
    ArticleDoc,
    CategoryWeek,
    DailyCount,
    EventDoc,
    Lead,
    LeadSource,
    Snapshot,
    SourceCount,
    StatDoc,
    TermCount,
    Totals,
)
from tagnews.textnorm import words

ISTANBUL = ZoneInfo("Europe/Istanbul")
LATEST_LIMIT = 24
DAYS = 90
WEEKS = 16
TOP_SOURCES = 30
STATEMENTS_PER_ACTOR = 3
LEAD_WINDOW = timedelta(hours=48)
LEAD_MAX_SOURCES = 8
STAT_ORDER = ("registered_riders", "drivers", "drivers_istanbul")
TERM_DAYS = 30
TOP_TERMS = 12
TERM_MIN_LEN = 4
TERM_MIN_COUNT = 2

# Words every story shares, Turkish function words and leftover suffix fragments
# (apostrophes split "Martı'nın" into "martı" + "nın").
TERM_STOPWORDS: frozenset[str] = frozenset(
    [
        "martı",
        "marti",
        "tag",
        "taksi",
        "uygulaması",
        "uygulama",
        "haber",
        "haberi",
        "son",
        "dakika",
        "yeni",
        "için",
        "gibi",
        "kadar",
        "daha",
        "sonra",
        "önce",
        "olarak",
        "olan",
        "olduğu",
        "oldu",
        "olacak",
        "etti",
        "eden",
        "edildi",
        "ediyor",
        "dedi",
        "açıkladı",
        "açıklama",
        "yaptı",
        "yapılan",
        "değil",
        "ancak",
        "ama",
        "veya",
        "ile",
        "ise",
        "bile",
        "hem",
        "çok",
        "bütün",
        "tüm",
        "bunu",
        "buna",
        "bunun",
        "şimdi",
        "artık",
        "yine",
        "nasıl",
        "neden",
        "nerede",
        "hangi",
        "kimin",
        "karşı",
        "üzerine",
        "ilgili",
        "ilişkin",
        "tarafından",
        "yeniden",
        "bugün",
        "dün",
        "yarın",
        "hafta",
        "haftası",
        "günü",
        "yılı",
        "türkiye",
        "türk",
        "istanbul",
        "nın",
        "nin",
        "nun",
        "nün",
        "ının",
        "inin",
        "ünün",
        "unun",
        "daki",
        "deki",
        "taki",
        "teki",
        "dan",
        "den",
        "tan",
        "ten",
        "lar",
        "ler",
        "ları",
        "leri",
    ]
)


def local_date(value: datetime) -> date:
    return value.astimezone(ISTANBUL).date()


def _visible(articles: list[ArticleDoc]) -> list[ArticleDoc]:
    return [a for a in articles if a.display != "hidden" and a.relevant]


def _newest_first(articles: list[ArticleDoc]) -> list[ArticleDoc]:
    return sorted(articles, key=lambda a: (a.published_at, a.id), reverse=True)


def pick_lead(articles: list[ArticleDoc], now: datetime) -> Lead | None:
    if not articles:
        return None
    recent = [a for a in articles if now - a.published_at <= LEAD_WINDOW]
    pool = recent or _newest_first(articles)[:1]
    clusters: dict[str, list[ArticleDoc]] = defaultdict(list)
    for article in pool:
        clusters[article.cluster_id].append(article)

    def rank(members: list[ArticleDoc]) -> tuple[int, datetime]:
        return (
            len({m.source.domain for m in members}),
            max(m.published_at for m in members),
        )

    best = max(clusters.values(), key=rank)
    representative = sorted(
        best, key=lambda a: (a.display == "full", a.published_at), reverse=True
    )[0]
    sources: list[LeadSource] = []
    seen: set[str] = set()
    for member in _newest_first(best):
        if member.source.domain in seen:
            continue
        seen.add(member.source.domain)
        sources.append(
            LeadSource(
                name=member.source.name, domain=member.source.domain, url=member.url
            )
        )
    return Lead(article=representative.to_view(), sources=sources[:LEAD_MAX_SOURCES])


def daily_counts(articles: list[ArticleDoc], today: date) -> list[DailyCount]:
    counts = Counter(local_date(a.published_at) for a in articles)
    start = today - timedelta(days=DAYS - 1)
    return [
        DailyCount(
            date=(start + timedelta(days=i)).isoformat(),
            count=counts.get(start + timedelta(days=i), 0),
        )
        for i in range(DAYS)
    ]


def source_counts(articles: list[ArticleDoc]) -> list[SourceCount]:
    by_domain: Counter[str] = Counter()
    names: dict[str, Counter[str]] = defaultdict(Counter)
    for article in articles:
        by_domain[article.source.domain] += 1
        names[article.source.domain][article.source.name] += 1
    ranked = sorted(by_domain.items(), key=lambda kv: (-kv[1], kv[0]))[:TOP_SOURCES]
    return [
        SourceCount(name=names[domain].most_common(1)[0][0], domain=domain, count=count)
        for domain, count in ranked
    ]


def category_weekly(articles: list[ArticleDoc], today: date) -> list[CategoryWeek]:
    this_monday = today - timedelta(days=today.weekday())
    weeks = [this_monday - timedelta(weeks=w) for w in range(WEEKS - 1, -1, -1)]
    table: dict[date, Counter[str]] = {w: Counter() for w in weeks}
    for article in articles:
        day = local_date(article.published_at)
        monday = day - timedelta(days=day.weekday())
        if monday in table:
            table[monday][article.category] += 1
    return [
        CategoryWeek(
            week_start=w.isoformat(),
            counts={c: table[w].get(c, 0) for c in CATEGORIES},
        )
        for w in weeks
    ]


def actor_statements(articles: list[ArticleDoc]) -> list[ActorStatementView]:
    per_actor: dict[str, list[ActorStatementView]] = defaultdict(list)
    for article in _newest_first(articles):
        if article.display != "full":
            continue
        for statement in article.actor_statements:
            bucket = per_actor[statement.actor]
            if len(bucket) >= STATEMENTS_PER_ACTOR:
                continue
            bucket.append(
                ActorStatementView(
                    actor=statement.actor,
                    summary=statement.summary,
                    date=article.published_at,
                    article_id=article.id,
                    source_name=article.source.name,
                    url=article.url,
                )
            )
    return [view for actor in ACTORS for view in per_actor.get(actor, [])]


def top_terms(articles: list[ArticleDoc], today: date) -> list[TermCount]:
    """Top title words of the last 30 days; one vote per article.."""
    since = today - timedelta(days=TERM_DAYS - 1)
    counts: Counter[str] = Counter()
    for article in articles:
        if local_date(article.published_at) < since:
            continue
        tokens = {
            token
            for token in words(article.title)
            if len(token) >= TERM_MIN_LEN
            and not token.isdigit()
            and token not in TERM_STOPWORDS
        }
        counts.update(tokens)
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [
        TermCount(term=term, count=n)
        for term, n in ranked[:TOP_TERMS]
        if n >= TERM_MIN_COUNT
    ]


def build_snapshot(
    articles: list[ArticleDoc],
    events: list[EventDoc],
    stats: list[StatDoc],
    now: datetime,
    last_run_at: datetime,
) -> Snapshot:
    """`articles` should cover at least the last 90 days; older ones are ignored."""
    today = local_date(now)
    window_start = today - timedelta(days=DAYS - 1)
    visible = [
        a for a in _visible(articles) if local_date(a.published_at) >= window_start
    ]
    daily = daily_counts(visible, today)
    return Snapshot(
        generated_at=now,
        last_run_at=last_run_at,
        lead=pick_lead(visible, now),
        latest=[a.to_view() for a in _newest_first(visible)[:LATEST_LIMIT]],
        events=[
            e.to_view()
            for e in sorted(events, key=lambda e: (e.date, e.id))
            if e.published
        ],
        stats=[
            s.to_view() for s in sorted(stats, key=lambda s: STAT_ORDER.index(s.key))
        ],
        daily_counts=daily,
        source_counts=source_counts(visible),
        category_weekly=category_weekly(visible, today),
        actor_statements=actor_statements(visible),
        totals=Totals(
            articles_90d=sum(d.count for d in daily),
            sources_90d=len({a.source.domain for a in visible}),
        ),
        top_terms=top_terms(visible, today),
    )
