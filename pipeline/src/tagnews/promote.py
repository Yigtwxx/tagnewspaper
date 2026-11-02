"""Promotion rules for timeline events and headline figures.

An event is published when it is backed by two genuinely independent texts (wire
copies of one AA/DHA/İHA story count once) or by one allow-listed primary source.
A figure replaces the current one only when two independent domains agree (±2%)
and it is newer than what the site shows.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import date

from rapidfuzz import fuzz

from tagnews.models import EventDoc, EventEvidence, EventType, StatCandidate, StatDoc
from tagnews.textnorm import collapse_ws, jaccard, normalize_for_match, tr_lower

WIRE_COPY_JACCARD = 0.35
STAT_TOLERANCE = 0.02
EVENT_TITLE_SIMILARITY = 60.0

PRIMARY_DOMAINS: frozenset[str] = frozenset(
    {
        "marti.tech",
        "martitechnology.com",
        "ibb.istanbul",
        "ibb.gov.tr",
        "uab.gov.tr",
        "ticaret.gov.tr",
        "resmigazete.gov.tr",
        "tbmm.gov.tr",
        "yargitay.gov.tr",
        "anayasa.gov.tr",
        "sec.gov",
        "kap.org.tr",
    }
)

STAT_LABELS: dict[str, tuple[str, str]] = {
    "registered_riders": ("TAG yolcusu", "Türkiye"),
    "drivers": ("Kayıtlı sürücü", "Türkiye"),
    "drivers_istanbul": ("İstanbul'daki kayıtlı sürücü", "İstanbul"),
}

_MULTIPLIERS = {"bin": 1_000, "milyon": 1_000_000, "milyar": 1_000_000_000}
_NUMBER_RE = re.compile(
    r"(?P<num>\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(?P<mult>bin|milyon|milyar)?"
)


def is_primary(domain: str) -> bool:
    return any(domain == d or domain.endswith(f".{d}") for d in PRIMARY_DOMAINS)


def parse_turkish_number(raw: str) -> int | None:
    """'584.000' -> 584000, '4,9 milyon' -> 4900000, '351 bin' -> 351000."""
    match = _NUMBER_RE.search(tr_lower(raw))
    if match is None:
        return None
    num, mult = match.group("num"), match.group("mult")
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", num):
        value = float(num.replace(".", ""))  # dots are thousands separators
    else:
        value = float(num.replace(",", "."))  # comma (or dot) is the decimal mark
    if mult:
        value *= _MULTIPLIERS[mult]
    return round(value)


def appears_in(raw: str, source_text: str) -> bool:
    needle = normalize_for_match(raw)
    return bool(needle) and needle in normalize_for_match(source_text)


def valid_iso_date(value: str, today: date) -> bool:
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return False
    return date(2018, 1, 1) <= parsed <= today


def independent_count(domains: list[str], fingerprints: list[list[int]]) -> int:
    """Number of evidence groups that are neither the same domain nor wire copies."""
    groups: list[tuple[set[str], list[list[int]]]] = []
    for domain, fp in zip(domains, fingerprints, strict=True):
        for group_domains, group_fps in groups:
            if domain in group_domains or any(
                jaccard(fp, other) >= WIRE_COPY_JACCARD for other in group_fps
            ):
                group_domains.add(domain)
                group_fps.append(fp)
                break
        else:
            groups.append(({domain}, [fp]))
    return len(groups)


@dataclass(frozen=True)
class EventCandidate:
    date: str
    date_text: str
    type: EventType
    title: str
    description: str
    court: str | None
    evidence: EventEvidence
    fingerprint: list[int]


def event_id(day: str, event_type: str, title: str) -> str:
    key = f"{day}|{event_type}|{normalize_for_match(title)}"
    return "ev-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def _same_event(existing: EventDoc, cand: EventCandidate) -> bool:
    if existing.type != cand.type:
        return False
    delta = abs(date.fromisoformat(existing.date) - date.fromisoformat(cand.date))
    if delta.days > 1:
        return False
    if (
        existing.court
        and cand.court
        and fuzz.partial_ratio(
            normalize_for_match(existing.court), normalize_for_match(cand.court)
        )
        >= 85
    ):
        return True
    score = fuzz.token_set_ratio(
        normalize_for_match(existing.title), normalize_for_match(cand.title)
    )
    return score >= EVENT_TITLE_SIMILARITY


def should_publish(event: EventDoc) -> bool:
    if event.is_seed:
        return True
    if any(is_primary(e.domain) for e in event.evidence):
        return True
    domains = [e.domain for e in event.evidence]
    fps = [event.fingerprints.get(e.url, []) for e in event.evidence]
    return independent_count(domains, fps) >= 2


def merge_event(events: list[EventDoc], cand: EventCandidate) -> EventDoc:
    """Attach the candidate to a matching event or create a new one. Returns it."""
    for event in events:
        if _same_event(event, cand):
            if all(e.url != cand.evidence.url for e in event.evidence):
                event.evidence.append(cand.evidence)
                event.fingerprints[cand.evidence.url] = cand.fingerprint
            event.published = should_publish(event)
            return event
    event = EventDoc(
        _id=event_id(cand.date, cand.type, cand.title),
        date=cand.date,
        type=cand.type,
        title=collapse_ws(cand.title)[:120],
        description=collapse_ws(cand.description)[:400],
        court=cand.court,
        evidence=[cand.evidence],
        published=False,
        is_seed=False,
        fingerprints={cand.evidence.url: cand.fingerprint},
    )
    event.published = should_publish(event)
    events.append(event)
    return event


def promote_stat(
    current: StatDoc | None, candidates: list[StatCandidate]
) -> StatDoc | None:
    """Return an updated stat only when a primary source states a newer figure.

    User figures are the company's to announce. News articles often quote other
    numbers (claims by opponents, older figures), so press coverage alone never
    changes a stat, however many outlets repeat it.
    """
    primary = [
        c
        for c in candidates
        if is_primary(c.domain) and (current is None or c.as_of > current.as_of)
    ]
    if not primary:
        return None
    anchor = max(primary, key=lambda c: (c.as_of, c.value))
    default_label, default_scope = STAT_LABELS[anchor.key]
    return StatDoc(
        _id=anchor.key,
        key=anchor.key,
        label=current.label if current else default_label,
        value=anchor.value,
        as_of=anchor.as_of,
        scope=current.scope if current else default_scope,
        source_name=anchor.source_name,
        source_url=anchor.url,
    )
