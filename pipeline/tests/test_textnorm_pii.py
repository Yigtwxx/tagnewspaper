from __future__ import annotations

import pytest

from tagnews.pii import contains_pii, is_valid_tckn, scrub
from tagnews.textnorm import (
    canonicalize_url,
    domain_of,
    jaccard,
    normalize_for_match,
    shingle_fingerprint,
    strip_source_suffix,
    tr_lower,
)


def test_tr_lower_dotted_and_dotless_i_maps_turkish() -> None:
    assert tr_lower("İSTANBUL") == "istanbul"
    assert tr_lower("ISPARTA") == "ısparta"
    assert tr_lower("MARTI TAG") == "martı tag"
    # Python's own lower() gets this wrong ("i̇stanbul" with a combining dot).
    assert "İSTANBUL".lower() != "istanbul"


def test_normalize_for_match_punctuation_is_stripped() -> None:
    assert normalize_for_match("Martı TAG'ın  kararı!") == "martı tag ın kararı"


def test_strip_source_suffix_matching_suffix_is_removed() -> None:
    assert strip_source_suffix("Karar çıktı - T24", "T24") == "Karar çıktı"
    assert strip_source_suffix("Karar çıktı - Diğer", "T24") == "Karar çıktı - Diğer"


def test_canonicalize_url_tracking_params_are_dropped() -> None:
    url = "HTTPS://WWW.Example.com/haber/1/?utm_source=x&b=2&a=1&fbclid=y#top"
    assert canonicalize_url(url) == "https://www.example.com/haber/1?a=1&b=2"
    assert domain_of("https://www.example.com.tr/a") == "example.com.tr"


def test_fingerprint_copy_vs_independent_text_differs() -> None:
    base = "mahkeme martı tag hakkında açılan davada ilk derece kararını kaldırdı " * 3
    copy = base + " ek bir cümle daha"
    other = (
        "taksici odası başkanı bugün yaptığı açıklamada uygulamaya tepki gösterdi " * 3
    )
    assert jaccard(shingle_fingerprint(base), shingle_fingerprint(copy)) > 0.6
    assert jaccard(shingle_fingerprint(base), shingle_fingerprint(other)) == 0.0


@pytest.mark.parametrize(
    ("text", "token"),
    [
        ("Bilgi için ornek@site.com adresine yazın", "[e-posta]"),
        ("Telefon: 0532 123 45 67", "[telefon]"),
        ("Telefon: +90 (212) 555-12-34", "[telefon]"),
        ("Araç 34 ABC 123 plakalı", "[plaka]"),
        ("TC: 10000000146", "[TCKN]"),
    ],
)
def test_scrub_personal_data_is_replaced(text: str, token: str) -> None:
    result = scrub(text)
    assert token in result.text
    assert result.replacements >= 1


def test_scrub_non_pii_numbers_are_kept() -> None:
    text = "Martı 4.900.000 yolcuya ve 584.000 sürücüye ulaştı; 2026 hedefi 630 bin."
    assert scrub(text).text == text
    assert not contains_pii("12345678901")  # fails the TCKN checksum


def test_is_valid_tckn_bad_checksum_is_rejected() -> None:
    assert is_valid_tckn("10000000146")
    assert not is_valid_tckn("10000000147")
