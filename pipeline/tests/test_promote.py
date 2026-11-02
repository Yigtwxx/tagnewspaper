from __future__ import annotations

from datetime import date, datetime

import pytest

from tagnews.models import EventEvidence, StatCandidate, StatDoc
from tagnews.promote import (
    EventCandidate,
    appears_in,
    independent_count,
    is_primary_stat,
    merge_event,
    parse_turkish_number,
    promote_stat,
    valid_iso_date,
)
from tagnews.textnorm import shingle_fingerprint

WIRE_TEXT = (
    "İstanbul Bölge Adliye Mahkemesi 14. Hukuk Dairesi 23 Ekim 2026 tarihinde "
    "Martı TAG hakkında açılan haksız rekabet davasında ilk derece kararını "
    "kaldırdı ve davaları reddetti. Mahkeme yasa koyucunun yasaklamadığı "
    "faaliyetin yasaklanamayacağını belirtti."
)
OTHER_TEXT = (
    "Taksici esnaf odalarının dört yıldır sürdürdüğü dava 23 Ekim 2026 günü "
    "sonuçlandı. İstinaf aşamasında heyet, şirketin başvurusunu yerinde bularak "
    "önceki hükmü bozdu; gerekçede kent ulaşımı için yeni bir yasal çerçeve "
    "gerektiği vurgulandı."
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("584.000", 584_000),
        ("4.900.000", 4_900_000),
        ("4,9 milyon", 4_900_000),
        ("4.9 milyon", 4_900_000),
        ("584 bin", 584_000),
        ("351 binden fazla", 351_000),
        ("yaklaşık 1,2 milyar", 1_200_000_000),
        ("sayı yok", None),
    ],
)
def test_parse_turkish_number_formats_parse_to_int(
    raw: str, expected: int | None
) -> None:
    assert parse_turkish_number(raw) == expected


def _cand(url: str, domain: str, text: str) -> EventCandidate:
    return EventCandidate(
        date="2026-10-23",
        date_text="23 Ekim 2026",
        type="court_decision",
        title="İstinaf mahkemesi ilk derece kararını kaldırdı",
        description="Habere göre istinaf mahkemesi davaları reddetti.",
        court="İstanbul Bölge Adliye Mahkemesi 14. Hukuk Dairesi",
        evidence=EventEvidence(url=url, source_name=domain, domain=domain),
        fingerprint=shingle_fingerprint(text),
    )


def test_merge_event_wire_copies_stay_unpublished() -> None:
    events = []
    merge_event(events, _cand("https://a.example/1", "a.example", WIRE_TEXT))
    event = merge_event(events, _cand("https://b.example/1", "b.example", WIRE_TEXT))
    assert len(events) == 1
    assert len(event.evidence) == 2
    assert not event.published  # same AA/İHA text on two sites

    event = merge_event(events, _cand("https://c.example/1", "c.example", OTHER_TEXT))
    assert event.published  # an independently written report confirms it


def test_independent_count_same_domain_counts_once() -> None:
    fp1, fp2 = shingle_fingerprint(WIRE_TEXT), shingle_fingerprint(OTHER_TEXT)
    assert independent_count(["a.example", "a.example"], [fp1, fp2]) == 1
    assert independent_count(["a.example", "b.example"], [fp1, fp2]) == 2


def test_merge_event_primary_source_publishes() -> None:
    events = []
    event = merge_event(
        events, _cand("https://ir.marti.tech/x", "ir.marti.tech", WIRE_TEXT)
    )
    assert event.published


def test_fact_checks_date_and_raw_text_are_validated() -> None:
    assert appears_in("23 Ekim 2026", WIRE_TEXT)
    assert not appears_in("24 Ekim 2026", WIRE_TEXT)
    assert valid_iso_date("2026-10-23", date(2026, 11, 2))
    assert not valid_iso_date("2027-01-01", date(2026, 11, 2))
    assert not valid_iso_date("23.10.2026", date(2026, 11, 2))


def _stat(
    value: int, domain: str, text: str, as_of: str, now: datetime
) -> StatCandidate:
    return StatCandidate(
        key="drivers",
        value=value,
        raw_text=str(value),
        as_of=as_of,
        url=f"https://{domain}/x",
        source_name=domain,
        domain=domain,
        fingerprint=shingle_fingerprint(text),
        seen_at=now,
    )


def _current_drivers() -> StatDoc:
    return StatDoc(
        _id="drivers",
        key="drivers",
        label="Kayıtlı sürücü",
        value=584_000,
        as_of="2026-09-02",
        scope="Türkiye",
        source_name="Martı",
        source_url="https://ir.marti.tech/x",
    )


def test_promote_stat_news_only_never_changes_figure(now: datetime) -> None:
    current = _current_drivers()
    press = [
        _stat(538_000, "a.example", WIRE_TEXT, "2026-11-01", now),
        _stat(538_000, "c.example", OTHER_TEXT, "2026-11-02", now),
    ]
    result = promote_stat(current, press)
    assert result is None, f"News citations must not change stats, got {result}"


def test_promote_stat_newer_primary_source_updates_figure(now: datetime) -> None:
    current = _current_drivers()
    candidates = [_stat(630_000, "ir.marti.tech", OTHER_TEXT, "2026-12-31", now)]
    promoted = promote_stat(current, candidates)
    assert promoted is not None, "A newer company figure should be promoted"
    assert promoted.value == 630_000, f"Expected 630000, got {promoted.value}"
    assert promoted.label == "Kayıtlı sürücü", f"Label changed: {promoted.label}"


def test_promote_stat_older_primary_source_is_ignored(now: datetime) -> None:
    current = _current_drivers()
    older = [_stat(500_000, "ir.marti.tech", OTHER_TEXT, "2026-01-01", now)]
    assert promote_stat(current, older) is None, "Older figures must not win"


def _press_drivers() -> StatDoc:
    return StatDoc(
        _id="drivers",
        key="drivers",
        label="Kayıtlı sürücü",
        value=538_000,
        as_of="2026-11-02",
        scope="Türkiye",
        source_name="Kocatepe Gazetesi",
        source_url="https://www.kocatepegazetesi.com.tr/x",
    )


@pytest.mark.parametrize(
    ("stat", "expected"),
    [(_current_drivers(), True), (_press_drivers(), False)],
)
def test_is_primary_stat_checks_source_domain(stat: StatDoc, expected: bool) -> None:
    assert is_primary_stat(stat) is expected, f"{stat.source_url} -> {expected}"


def test_promote_stat_press_figure_never_blocks_primary_source(now: datetime) -> None:
    current = _press_drivers()
    company = [_stat(584_000, "ir.marti.tech", OTHER_TEXT, "2026-09-02", now)]
    promoted = promote_stat(current, company)
    assert promoted is not None, (
        "A stored press figure must yield to the company figure"
    )
    assert promoted.value == 584_000, f"Expected 584000, got {promoted.value}"
