from __future__ import annotations

from tagnews.guards import (
    check,
    has_attribution,
    longest_shared_run,
    source_text_usable,
)

from conftest import SOURCE_TEXT, make_enrichment


def _codes(**overrides: object) -> set[str]:
    return {v.code for v in check(make_enrichment(**overrides), SOURCE_TEXT)}


def test_check_clean_enrichment_returns_no_violations() -> None:
    assert _codes() == set()


def test_check_allegation_without_attribution_is_flagged() -> None:
    summary = (
        "Martı TAG faturaları usulsüz biçimde e-scooter üzerinden kesiyor ve vergi "
        "ödemiyor. Bu durum taksicileri zor durumda bırakıyor ve denetim gerekiyor."
    )
    assert "attribution" in _codes(
        summary=summary, is_allegation=True, risk_level="high"
    )


def test_check_allegation_with_attribution_passes() -> None:
    summary = (
        "Taksici odası başkanı, Martı TAG'in faturaları e-scooter üzerinden kestiğini "
        "iddia etti ve inceleme çağrısı yaptı. Habere göre şirketin iddialara yanıtı "
        "yer almıyor."
    )
    assert _codes(summary=summary, is_allegation=True, risk_level="high") == set()


def test_check_private_person_name_is_flagged() -> None:
    summary = (
        "Habere göre sürücü Ahmet Yılmaz'a 100 bin TL ceza kesildi ve aracı trafikten "
        "men edildi. Yetkililer denetimlerin süreceğini açıkladı."
    )
    codes = _codes(summary=summary, private_persons=["Ahmet Yılmaz"])
    assert "private_person" in codes
    # Surname alone also counts.
    summary2 = summary.replace("Ahmet Yılmaz'a", "Yılmaz'a")
    assert "private_person" in _codes(
        summary=summary2, private_persons=["Ahmet Yılmaz"]
    )


def test_check_verbatim_copy_is_flagged() -> None:
    copied = (
        "Habere göre mahkeme ilk derece mahkemesinin kararını kaldırarak taksici esnaf "
        "odalarının açtığı asıl ve birleşen davaları reddetti. Karar açıklandı."
    )
    assert longest_shared_run(copied, SOURCE_TEXT) > 12
    assert "verbatim" in _codes(summary=copied)


def test_check_pii_and_length_are_flagged() -> None:
    assert "pii" in _codes(
        summary=(
            "Habere göre sürücüye ulaşmak için 0532 123 45 67 numarası paylaşıldı. "
            "Yetkililer konuyla ilgili açıklama yapmadı."
        )
    )
    assert "length" in _codes(summary="Habere göre karar çıktı.")
    assert "empty" in _codes(summary="")


def test_check_unattributed_statement_is_flagged() -> None:
    statements = [{"actor": "marti", "summary": "Karar sürücüler için olumlu."}]
    assert "statement_attribution" in _codes(actor_statements=statements)


def test_guard_helpers_edge_cases_behave() -> None:
    assert has_attribution("Oda başkanı İDDİA etti")
    assert not has_attribution("Karar çıktı.")
    assert not source_text_usable("kısa metin")
    assert not source_text_usable(None)
    assert source_text_usable(SOURCE_TEXT)
