"""Publishers' own RSS feeds, filtered by keyword (fallback source).

The list spans outlets across the political spectrum on purpose (neutrality).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime

import feedparser
import httpx

from tagnews.sources.base import RawItem, SourceError, get_with_retry, struct_to_utc
from tagnews.textnorm import canonicalize_url, collapse_ws, tr_lower

log = logging.getLogger(__name__)

NAME = "publisher_rss"


@dataclass(frozen=True)
class Feed:
    name: str
    domain: str
    url: str


FEEDS: tuple[Feed, ...] = (
    Feed("CNN Türk", "cnnturk.com", "https://www.cnnturk.com/feed/rss/all/news"),
    Feed("Habertürk", "haberturk.com", "https://www.haberturk.com/rss"),
    Feed("Hürriyet", "hurriyet.com.tr", "https://www.hurriyet.com.tr/rss/gundem"),
    Feed("Sözcü", "sozcu.com.tr", "https://www.sozcu.com.tr/feeds-rss-category-gundem"),
    Feed("DW Türkçe", "dw.com", "https://rss.dw.com/rdf/rss-tur-all"),
    Feed("NTV", "ntv.com.tr", "https://www.ntv.com.tr/turkiye.rss"),
    Feed("bianet", "bianet.org", "https://bianet.org/rss/biamag"),
    Feed(
        "Anadolu Ajansı", "aa.com.tr", "https://www.aa.com.tr/tr/rss/default?cat=guncel"
    ),
    Feed("BBC Türkçe", "bbc.com", "https://feeds.bbci.co.uk/turkce/rss.xml"),
    Feed("Cumhuriyet", "cumhuriyet.com.tr", "https://www.cumhuriyet.com.tr/rss"),
    Feed(
        "Milliyet",
        "milliyet.com.tr",
        "https://www.milliyet.com.tr/rss/rssnew/sondakikarss.xml",
    ),
    Feed("Sabah", "sabah.com.tr", "https://www.sabah.com.tr/rss/gundem.xml"),
    Feed("TRT Haber", "trthaber.com", "https://www.trthaber.com/sondakika.rss"),
    Feed("Dünya", "dunya.com", "https://www.dunya.com/rss"),
    Feed("Ekonomim", "ekonomim.com", "https://www.ekonomim.com/rss"),
    Feed(
        "Bloomberg HT",
        "bloomberght.com",
        "https://www.bloomberght.com/rss/tum-haberler.xml",
    ),
    Feed(
        "Gazete Duvar",
        "gazeteduvar.com.tr",
        "https://www.gazeteduvar.com.tr/export/rss",
    ),
    Feed("Karar", "karar.com", "https://www.karar.com/service/rss.php"),
)

# "Martı" is also the word for seagull, so require a mobility/legal co-term,
# unless the text says "Martı TAG" outright.
_DIRECT_RE = re.compile(r"\bmart[ıi]\s*tag\b")
_MARTI_RE = re.compile(r"\bmart[ıi]('|’)?(n[ıi]n|ya|y[ıi]|da|dan|ile)?\b")
_CO_TERMS_RE = re.compile(
    r"\b(tag|taksi\w*|s[üu]r[üu]c[üu]\w*|yolcu\w*|ukome|korsan|scooter|uygulama\w*|"
    r"payla[şs][ıi]ml[ıi]|mahkeme\w*|dava\w*|haks[ıi]z rekabet)"
)


def is_relevant(text: str) -> bool:
    lowered = tr_lower(text)
    if _DIRECT_RE.search(lowered):
        return True
    return bool(_MARTI_RE.search(lowered) and _CO_TERMS_RE.search(lowered))


def parse_feed(content: bytes, feed: Feed, now: datetime) -> list[RawItem]:
    parsed = feedparser.parse(content)
    if parsed.bozo and not parsed.entries:
        raise SourceError(f"{feed.name}: unparseable feed")
    items: list[RawItem] = []
    for entry in parsed.entries:
        link = entry.get("link")
        title = collapse_ws(entry.get("title") or "")
        if not link or not title:
            continue
        summary = entry.get("summary") or ""
        if not is_relevant(f"{title} {summary}"):
            continue
        items.append(
            RawItem(
                title=title,
                url=canonicalize_url(link),
                source_name=feed.name,
                source_domain=feed.domain,
                published_at=struct_to_utc(
                    entry.get("published_parsed") or entry.get("updated_parsed"), now
                ),
                origin="publisher_rss",
                guid=None,
            )
        )
    return items


def fetch(
    client: httpx.Client, now: datetime, feeds: tuple[Feed, ...] = FEEDS
) -> list[RawItem]:
    """Fetch all feeds; individual feed failures are tolerated, all failing is not."""
    items: list[RawItem] = []
    failures = 0
    for feed in feeds:
        try:
            response = get_with_retry(
                client, feed.url, timeout=15.0, follow_redirects=True
            )
            if response.status_code != 200:
                raise SourceError(f"{feed.name}: HTTP {response.status_code}")
            items.extend(parse_feed(response.content, feed, now))
        except SourceError as exc:
            failures += 1
            log.warning("publisher_rss: %s failed: %s", feed.name, type(exc).__name__)
    if failures == len(feeds):
        raise SourceError("all publisher feeds failed")
    log.info("publisher_rss: %d relevant items (%d feeds failed)", len(items), failures)
    return items
