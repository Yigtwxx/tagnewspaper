"""Market job: SEC EDGAR filings + Alpha Vantage prices -> one `market` document."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import pytest
import respx
from pydantic import ValidationError

from tagnews import cli
from tagnews.config import Settings
from tagnews.market import (
    ALPHA_VANTAGE_URL,
    EDGAR_HEALTH,
    EDGAR_SUBMISSIONS_URL,
    MarketRefresh,
    filing_title,
    filing_url,
    is_meaningful_description,
    merge_prices,
    parse_alpha_vantage,
    parse_edgar,
    refresh_market,
)
from tagnews.models import MAX_FILINGS, MAX_PRICE_BARS, MarketDoc, SourceHealth
from tagnews.sources.base import SourceError
from tagnews.store import MemoryStore

from conftest import (
    EDGAR_SAMPLE,
    alpha_vantage_payload,
    load_json,
    make_bar,
    make_filing,
    make_market_doc,
    weekdays,
)

API_KEY = "av-test-key-5f3a9c"
SEC_UA = "tagnewspaper ops@example.test"
YESTERDAY = datetime(2026, 11, 1, 9, 0, tzinfo=UTC)
ARCHIVE = "https://www.sec.gov/Archives/edgar/data/1852767"
OCTOBER = weekdays(date(2026, 10, 1), 10)


def _refresh(
    store: MemoryStore, now: datetime, force: bool = False, key: str | None = API_KEY
) -> MarketRefresh:
    with httpx.Client() as client:
        return refresh_market(
            store,
            client,
            now,
            force=force,
            alphavantage_api_key=key,
            sec_user_agent=SEC_UA,
        )


def _mock_edgar(status: int = 200) -> respx.Route:
    if status != 200:
        return respx.get(EDGAR_SUBMISSIONS_URL).mock(
            return_value=httpx.Response(status)
        )
    return respx.get(EDGAR_SUBMISSIONS_URL).mock(
        return_value=httpx.Response(200, json=load_json(EDGAR_SAMPLE))
    )


def _mock_alpha_vantage(payload: dict[str, Any] | None = None) -> respx.Route:
    body = alpha_vantage_payload(OCTOBER) if payload is None else payload
    return respx.get(url__startswith=ALPHA_VANTAGE_URL).mock(
        return_value=httpx.Response(200, json=body)
    )


def _edgar_payload(rows: list[tuple[str, str, str]]) -> dict[str, Any]:
    """Minimal submissions payload from (form, filingDate, accessionNumber) rows."""
    return {
        "filings": {
            "recent": {
                "accessionNumber": [r[2] for r in rows],
                "filingDate": [r[1] for r in rows],
                "acceptanceDateTime": ["" for _ in rows],
                "form": [r[0] for r in rows],
                "primaryDocument": ["doc.htm" for _ in rows],
                "primaryDocDescription": ["" for _ in rows],
            }
        }
    }


# --- EDGAR parsing ---------------------------------------------------------------


def test_parse_edgar_sample_keeps_tracked_forms_newest_first() -> None:
    filings = parse_edgar(load_json(EDGAR_SAMPLE))
    assert [f.form for f in filings] == [
        "6-K",
        "SCHEDULE 13G/A",
        "6-K",
        "424B3",
        "20-F",
        "SC 13G",
        "F-3",
        "6-K",
    ]
    filed = [f.filed for f in filings]
    assert filed == sorted(filed, reverse=True)
    assert filings[0].url == f"{ARCHIVE}/000110465926110987/tm2629876d1_6k.htm"


def test_parse_edgar_insider_and_untracked_forms_are_skipped() -> None:
    forms = {f.form for f in parse_edgar(load_json(EDGAR_SAMPLE))}
    assert forms.isdisjoint({"3", "4", "4/A", "5", "144", "S-8", "CORRESP"})
    # The 424B4 row has a malformed accession number, so it is dropped too.
    assert "424B4" not in forms


def test_parse_edgar_more_than_limit_caps_newest_first() -> None:
    rows = [
        ("6-K", f"2026-10-{day:02d}", f"0001104659-26-{day:06d}")
        for day in range(1, 21)
    ]
    filings = parse_edgar(_edgar_payload(rows))
    assert len(filings) == MAX_FILINGS
    assert filings[0].filed == "2026-10-20"
    assert filings[-1].filed == "2026-10-06"


@pytest.mark.parametrize("payload", [[], {}, {"filings": {}}, {"filings": []}])
def test_parse_edgar_missing_recent_raises_source_error(payload: object) -> None:
    with pytest.raises(SourceError, match=r"filings\.recent"):
        parse_edgar(payload)


def test_parse_edgar_only_insider_forms_raises_source_error() -> None:
    payload = _edgar_payload(
        [("4", "2026-10-01", "0001104659-26-000001"), ("144", "2026-09-01", "x")]
    )
    with pytest.raises(SourceError, match="no filings"):
        parse_edgar(payload)


def test_filing_url_accession_without_dashes_builds_archive_url() -> None:
    assert (
        filing_url("0001193125-26-405060", "xslSCHEDULE_13G_X01/primary_doc.xml")
        == f"{ARCHIVE}/000119312526405060/xslSCHEDULE_13G_X01/primary_doc.xml"
    )


@pytest.mark.parametrize("document", ["", "  ", "../../etc/passwd", "https://x.test/a"])
def test_filing_url_missing_or_odd_document_links_filing_index(document: str) -> None:
    assert (
        filing_url("0001104659-25-121212", document)
        == f"{ARCHIVE}/000110465925121212/0001104659-25-121212-index.htm"
    )


@pytest.mark.parametrize(
    ("form", "description", "expected"),
    [
        ("6-K", "6-K", "6-K: Şirket bildirimi"),
        ("6-K", "PRIMARY DOCUMENT", "6-K: Şirket bildirimi"),
        ("6-K", "Report of Foreign Private Issuer", "6-K: Şirket bildirimi"),
        ("20-F", "FORM 20-F", "20-F: Yıllık rapor"),
        ("20-F/A", "Amendment No. 1", "20-F/A: Yıllık rapor (düzeltme)"),
        ("F-3", "", "F-3: Kayıt beyanı (kısa form)"),
        ("424B4", "PROSPECTUS", "424B4: İzahname"),
        (
            "SC 13G/A",
            "SC 13G/A",
            "SC 13G/A: Büyük pay sahipliği bildirimi (güncelleme)",
        ),
    ],
)
def test_filing_title_generic_description_uses_turkish_label(
    form: str, description: str, expected: str
) -> None:
    assert not is_meaningful_description(description)
    assert filing_title(form, description) == expected


def test_filing_title_meaningful_description_is_kept() -> None:
    description = "  Unaudited interim   condensed financial statements "
    assert (
        filing_title("6-K", description)
        == "Unaudited interim condensed financial statements"
    )


# --- Alpha Vantage parsing ------------------------------------------------------


def test_parse_alpha_vantage_daily_series_returns_ascending_bars() -> None:
    bars = parse_alpha_vantage(alpha_vantage_payload(OCTOBER, close=1.25))
    assert [b.date for b in bars] == OCTOBER
    first = bars[0]
    assert (first.open, first.close, first.volume) == (1.25, 1.25, 250_000)
    assert first.high > first.low


@pytest.mark.parametrize("key", ["Note", "Information", "Error Message"])
def test_parse_alpha_vantage_soft_error_raises_source_error(key: str) -> None:
    notice = "Thank you for using Alpha Vantage! Our standard API rate limit is ..."
    with pytest.raises(SourceError, match=key) as info:
        parse_alpha_vantage({key: notice})
    assert notice not in str(info.value)


def test_parse_alpha_vantage_malformed_rows_are_skipped() -> None:
    payload = alpha_vantage_payload(OCTOBER[:2])
    series = payload["Time Series (Daily)"]
    good = series[OCTOBER[0]]
    series["2026-10-05"] = {**good, "4. close": "n/a"}
    series["2026-10-06"] = {**good, "2. high": "0.5", "3. low": "1.0"}
    series["2026-10-07"] = {k: v for k, v in good.items() if k != "5. volume"}
    series["2026/10/08"] = good
    series["2026-10-09"] = {**good, "1. open": "-1"}
    bars = parse_alpha_vantage(payload)
    assert [b.date for b in bars] == OCTOBER[:2]


def test_parse_alpha_vantage_other_symbol_raises_source_error() -> None:
    payload = alpha_vantage_payload(OCTOBER)
    payload["Meta Data"]["2. Symbol"] = "IBM"
    with pytest.raises(SourceError, match="symbol"):
        parse_alpha_vantage(payload)


@pytest.mark.parametrize("payload", [[], {}, {"Time Series (Daily)": {}}])
def test_parse_alpha_vantage_no_series_raises_source_error(payload: object) -> None:
    with pytest.raises(SourceError):
        parse_alpha_vantage(payload)


# --- Merge ------------------------------------------------------------------------


def test_merge_prices_overlap_dedupes_and_fresh_wins() -> None:
    old = [make_bar(d, close=1.0) for d in weekdays(date(2026, 9, 28), 5)]
    fresh = [make_bar(d, close=2.0) for d in weekdays(date(2026, 10, 1), 5)]
    merged = merge_prices(old, fresh)
    dates = [b.date for b in merged]
    assert dates == sorted(set(dates))
    assert len(merged) == 8  # 5 old + 5 fresh, 2 shared days
    by_date = {b.date: b.close for b in merged}
    assert by_date["2026-10-01"] == 2.0  # a corrected bar replaces the stored one
    assert by_date["2026-09-28"] == 1.0


def test_merge_prices_over_cap_keeps_newest() -> None:
    days = weekdays(date(2025, 6, 2), MAX_PRICE_BARS + 40)
    old = [make_bar(d) for d in days[:-100]]
    fresh = [make_bar(d) for d in days[-100:]]
    merged = merge_prices(old, fresh)
    assert len(merged) == MAX_PRICE_BARS
    assert merged[-1].date == days[-1]
    assert merged[0].date == days[40]


# --- Model invariants ---------------------------------------------------------------


def test_market_doc_unordered_lists_are_rejected() -> None:
    with pytest.raises(ValidationError, match="ascending"):
        make_market_doc(
            YESTERDAY, prices=[make_bar("2026-10-02"), make_bar("2026-10-01")]
        )
    with pytest.raises(ValidationError, match="newest first"):
        make_market_doc(
            YESTERDAY, filings=[make_filing("2026-09-01"), make_filing("2026-10-01")]
        )


def test_market_doc_price_source_without_prices_is_rejected() -> None:
    with pytest.raises(ValidationError, match="price_source"):
        MarketDoc(
            updated_at=YESTERDAY,
            price_source="Alpha Vantage",
            prices=[],
            filings=[],
        )


# --- refresh_market -----------------------------------------------------------------


@respx.mock
@pytest.mark.parametrize(
    "updated_at",
    [
        datetime(2026, 11, 2, 6, 0, tzinfo=UTC),
        # 01:00 in Istanbul on Nov 2, although still Nov 1 in UTC.
        datetime(2026, 11, 1, 22, 0, tzinfo=UTC),
    ],
)
def test_refresh_market_same_istanbul_day_skips_without_requests(
    now: datetime, updated_at: datetime
) -> None:
    store = MemoryStore()
    store.market = make_market_doc(updated_at)
    result = _refresh(store, now)
    assert result.status == "skipped"
    assert respx.calls.call_count == 0, "no source may be called twice a day"
    assert store.market.updated_at == updated_at


@respx.mock
def test_refresh_market_after_istanbul_midnight_refreshes() -> None:
    _mock_edgar()
    _mock_alpha_vantage()
    store = MemoryStore()
    # 23:59 and 00:01 in Istanbul (UTC+3): same UTC date, different local days.
    store.market = make_market_doc(datetime(2026, 11, 1, 20, 59, tzinfo=UTC))
    now = datetime(2026, 11, 1, 21, 1, tzinfo=UTC)
    assert _refresh(store, now).status == "written"
    assert store.market is not None and store.market.updated_at == now


@respx.mock
def test_refresh_market_force_ignores_daily_guard(now: datetime) -> None:
    edgar = _mock_edgar()
    _mock_alpha_vantage()
    store = MemoryStore()
    store.market = make_market_doc(now)
    assert _refresh(store, now, force=True).status == "written"
    assert edgar.call_count == 1


@respx.mock
def test_refresh_market_first_run_writes_both_sources(now: datetime) -> None:
    edgar, alpha = _mock_edgar(), _mock_alpha_vantage()
    store = MemoryStore()
    result = _refresh(store, now)

    assert result.status == "written" and not result.errors
    doc = store.market
    assert doc is not None
    assert doc.id == doc.symbol == "MRT"
    assert doc.updated_at == now
    assert doc.price_source == "Alpha Vantage"
    assert [b.date for b in doc.prices] == OCTOBER
    assert len(doc.filings) == 8
    assert edgar.calls[0].request.headers["User-Agent"] == SEC_UA
    params = alpha.calls[0].request.url.params
    assert params["function"] == "TIME_SERIES_DAILY"
    assert params["symbol"] == "MRT" and params["outputsize"] == "compact"
    assert params["apikey"] == API_KEY


@respx.mock
def test_refresh_market_edgar_fails_prices_updated_filings_kept(now: datetime) -> None:
    _mock_edgar(status=403)
    _mock_alpha_vantage()
    store = MemoryStore()
    old_prices = [make_bar(d) for d in weekdays(date(2026, 9, 1), 5)]
    old_filings = [make_filing("2026-09-01")]
    store.market = make_market_doc(YESTERDAY, prices=old_prices, filings=old_filings)

    result = _refresh(store, now)

    assert result.status == "written"
    assert result.errors == ["edgar: HTTP 403"]
    doc = store.market
    assert doc is not None and doc.updated_at == now
    assert doc.filings == old_filings
    assert [b.date for b in doc.prices] == [b.date for b in old_prices] + OCTOBER


@respx.mock
def test_refresh_market_alpha_vantage_soft_error_keeps_old_prices(
    now: datetime,
) -> None:
    _mock_edgar()
    _mock_alpha_vantage({"Note": "API call frequency exceeded"})
    store = MemoryStore()
    old_prices = [make_bar(d) for d in weekdays(date(2026, 9, 1), 5)]
    store.market = make_market_doc(YESTERDAY, prices=old_prices)

    result = _refresh(store, now)

    assert result.status == "written"
    assert result.errors == ["alphavantage: Alpha Vantage soft error (Note)"]
    doc = store.market
    assert doc is not None
    assert doc.prices == old_prices and doc.price_source == "Alpha Vantage"
    assert len(doc.filings) == 8


@respx.mock
def test_refresh_market_every_source_fails_writes_nothing(now: datetime) -> None:
    _mock_edgar(status=404)
    _mock_alpha_vantage({"Information": "premium endpoint"})
    store = MemoryStore()
    before = make_market_doc(YESTERDAY)
    store.market = before

    result = _refresh(store, now)

    assert result.status == "failed"
    assert len(result.errors) == 2
    assert store.market == before, "unchanged, so the next run tries again"


@respx.mock
def test_refresh_market_without_api_key_keeps_stored_prices(now: datetime) -> None:
    _mock_edgar()  # Alpha Vantage is not mocked: calling it would record an error
    store = MemoryStore()
    old_prices = [make_bar(d) for d in weekdays(date(2026, 9, 1), 5)]
    store.market = make_market_doc(YESTERDAY, prices=old_prices)

    result = _refresh(store, now, key=None)

    assert result.status == "written" and not result.errors
    assert respx.calls.call_count == 1, "only EDGAR is called without a key"
    assert store.market is not None and store.market.prices == old_prices


@respx.mock
def test_refresh_market_no_key_no_prices_has_null_price_source(now: datetime) -> None:
    _mock_edgar()
    store = MemoryStore()
    _refresh(store, now, key=None)
    assert store.market is not None
    assert store.market.prices == [] and store.market.price_source is None


@respx.mock
@pytest.mark.usefixtures("no_retry_wait")
def test_refresh_market_api_key_never_logged(
    now: datetime, caplog: pytest.LogCaptureFixture
) -> None:
    def leaky(request: httpx.Request) -> httpx.Response:
        # Worst case: a transport error whose message carries the full URL.
        raise httpx.ConnectError(f"cannot reach {request.url}", request=request)

    _mock_edgar(status=403)
    alpha = respx.get(url__startswith=ALPHA_VANTAGE_URL).mock(side_effect=leaky)
    caplog.set_level(logging.DEBUG)

    result = _refresh(MemoryStore(), now)

    assert alpha.call_count == 3, "transport errors are retried"
    assert result.status == "failed"
    assert "alphavantage: request failed: ConnectError" in result.errors
    assert API_KEY not in caplog.text, "the API key leaked into a log record"
    assert all(API_KEY not in error for error in result.errors)


# --- CLI ------------------------------------------------------------------------------


def test_cli_market_flags_parse() -> None:
    args = cli.build_parser().parse_args(["market", "--force"])
    assert args.command == "market" and args.force and not args.dry_run


@respx.mock
def test_cli_market_dry_run_prints_filings_without_db(
    capsys: pytest.CaptureFixture[str],
) -> None:
    _mock_edgar()
    settings = Settings(sec_user_agent=SEC_UA, mongodb_uri=None)
    assert cli.cmd_market(settings, force=False, dry_run=True) == 0
    out = capsys.readouterr().out
    assert "market: written" in out
    assert f"{ARCHIVE}/000110465926110987/tm2629876d1_6k.htm" in out


# --- Source health (3 failures in a row -> rest 24 h) --------------------------------


@respx.mock
def test_refresh_market_three_edgar_failures_rest_edgar_for_24h(now: datetime) -> None:
    edgar = _mock_edgar(status=403)
    store = MemoryStore()
    for _ in range(3):
        assert _refresh(store, now, key=None).status == "failed"
    health = store.get_health(EDGAR_HEALTH)
    assert health.consecutive_failures == 3
    assert health.skip_until is not None and health.skip_until > now

    result = _refresh(store, now, key=None)

    assert edgar.call_count == 3, "a resting source is not called"
    assert result.errors[0].startswith("edgar: skipped until")


@respx.mock
def test_refresh_market_force_calls_resting_source(now: datetime) -> None:
    edgar = _mock_edgar()
    store = MemoryStore()
    store.save_health(
        SourceHealth(
            id=EDGAR_HEALTH, consecutive_failures=3, skip_until=now + timedelta(hours=5)
        )
    )
    assert _refresh(store, now, force=True, key=None).status == "written"
    assert edgar.call_count == 1
    assert store.get_health(EDGAR_HEALTH) == SourceHealth(id=EDGAR_HEALTH)


@respx.mock
def test_refresh_market_success_resets_failure_count(now: datetime) -> None:
    _mock_edgar()
    store = MemoryStore()
    store.save_health(SourceHealth(id=EDGAR_HEALTH, consecutive_failures=2))
    assert _refresh(store, now, key=None).status == "written"
    assert store.get_health(EDGAR_HEALTH).consecutive_failures == 0
