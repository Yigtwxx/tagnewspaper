"""Daily market job: the single `market` document read by the web `/borsa` page.

Martı Technologies trades on NYSE American as `MRT` (SEC CIK 1852767). Only official
or explicitly permitted APIs are used, never page scraping:

- SEC EDGAR submissions JSON (free; one request per refresh with a declared
  User-Agent, far below SEC's 10 requests/second fair-access limit).
- Alpha Vantage `TIME_SERIES_DAILY`, only when `ALPHAVANTAGE_API_KEY` is set. The
  free tier returns ~100 days, so new bars are merged with the stored ones.

A refresh runs at most once per Istanbul calendar day. A failing source never wipes
the other's stored data, and the API key never reaches a log line or error string.
"""

from __future__ import annotations

import logging
import math
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Protocol
from urllib.parse import quote

import httpx
from pydantic import ValidationError

from tagnews.config import DEFAULT_SEC_USER_AGENT
from tagnews.models import (
    MARKET_SYMBOL,
    MAX_FILINGS,
    MAX_PRICE_BARS,
    Filing,
    MarketDoc,
    PriceBar,
    SourceHealth,
)
from tagnews.snapshot import local_date
from tagnews.sources.base import SourceError, get_with_retry
from tagnews.sources.chain import FAILURES_BEFORE_SKIP, SKIP_DURATION, HealthStore
from tagnews.textnorm import collapse_ws

log = logging.getLogger(__name__)

# `source_health` ids, next to the news sources' ("google_news", ...).
EDGAR_HEALTH = "market_edgar"
ALPHA_VANTAGE_HEALTH = "market_alphavantage"

CIK = 1852767
EDGAR_SUBMISSIONS_URL = f"https://data.sec.gov/submissions/CIK{CIK:010d}.json"
EDGAR_ARCHIVE_BASE = f"https://www.sec.gov/Archives/edgar/data/{CIK}"
ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query"
PRICE_SOURCE: Literal["Alpha Vantage"] = "Alpha Vantage"
REQUEST_TIMEOUT_S = 15.0
MAX_TITLE_LEN = 200

# Forms shown on the page, with a Turkish label used when the filing's own
# description is not informative. Insider forms (3/4/5/144) are deliberately absent.
# Since Dec 2024 EDGAR files Schedules 13D/G as "SCHEDULE 13D" etc.; both spellings
# are tracked so ownership filings keep showing up.
FORM_LABELS: dict[str, str] = {
    "6-K": "Şirket bildirimi",
    "20-F": "Yıllık rapor",
    "20-F/A": "Yıllık rapor (düzeltme)",
    "F-1": "Kayıt beyanı",
    "F-3": "Kayıt beyanı (kısa form)",
    "F-4": "Birleşme kayıt beyanı",
    "424B3": "İzahname",
    "424B4": "İzahname",
    "424B5": "İzahname eki",
    "SC 13D": "Büyük pay sahipliği bildirimi",
    "SC 13G": "Büyük pay sahipliği bildirimi",
    "SC 13D/A": "Büyük pay sahipliği bildirimi (güncelleme)",
    "SC 13G/A": "Büyük pay sahipliği bildirimi (güncelleme)",
    "SCHEDULE 13D": "Büyük pay sahipliği bildirimi",
    "SCHEDULE 13G": "Büyük pay sahipliği bildirimi",
    "SCHEDULE 13D/A": "Büyük pay sahipliği bildirimi (güncelleme)",
    "SCHEDULE 13G/A": "Büyük pay sahipliği bildirimi (güncelleme)",
}
TRACKED_FORMS: frozenset[str] = frozenset(FORM_LABELS)

_ACCESSION_RE = re.compile(r"^\d{10}-\d{2}-\d{6}$")
_WORD_RE = re.compile(r"[A-Za-z]{3,}")
# Words that never make a description informative on their own.
_FILLER_WORDS = frozenset({"FORM", "SCHEDULE", "AMENDMENT", "AMENDED", "THE", "AND"})
# Descriptions that only restate the form type (after dropping filler words and
# words shorter than 3 letters, so "Report of Foreign Private Issuer" matches).
_GENERIC_DESCRIPTIONS = frozenset(
    {
        "PRIMARY DOCUMENT",
        "MAIN DOCUMENT",
        "COVER PAGE",
        "ANNUAL REPORT",
        "CURRENT REPORT",
        "REPORT FOREIGN PRIVATE ISSUER",
        "REGISTRATION STATEMENT",
        "PROSPECTUS SUPPLEMENT",
        "FINAL PROSPECTUS",
        "PRELIMINARY PROSPECTUS",
    }
)
_AV_SOFT_ERROR_KEYS = ("Error Message", "Note", "Information")
_AV_SERIES_KEY = "Time Series (Daily)"


class MarketStore(HealthStore, Protocol):
    def load_market(self) -> MarketDoc | None: ...

    def save_market(self, doc: MarketDoc) -> None: ...


@dataclass
class MarketRefresh:
    """What one `refresh_market` call did."""

    status: Literal["skipped", "written", "failed"]
    doc: MarketDoc | None
    errors: list[str] = field(default_factory=list)

    @property
    def written(self) -> bool:
        return self.status == "written"


# --- SEC EDGAR -------------------------------------------------------------------


def is_meaningful_description(description: str) -> bool:
    """True when an EDGAR `primaryDocDescription` says more than the form type.

    "6-K", "FORM 20-F", "SC 13G/A", "PRIMARY DOCUMENT" are not; "Unaudited interim
    financial statements" is. Form codes contain no 3+ letter word, so they drop out.
    """
    words = [w.upper() for w in _WORD_RE.findall(description)]
    content = [w for w in words if w not in _FILLER_WORDS]
    if len(content) < 2:
        return False
    return " ".join(content) not in _GENERIC_DESCRIPTIONS


def filing_title(form: str, description: str) -> str:
    text = collapse_ws(description)
    if is_meaningful_description(text):
        return text[:MAX_TITLE_LEN]
    return f"{form}: {FORM_LABELS.get(form, 'SEC başvurusu')}"


def filing_url(accession: str, primary_document: str) -> str:
    """Archive URL of the primary document, or the filing index when there is none."""
    folder = accession.replace("-", "")
    doc = primary_document.strip()
    if not doc or ".." in doc or doc.startswith("/") or ":" in doc:
        return f"{EDGAR_ARCHIVE_BASE}/{folder}/{accession}-index.htm"
    return f"{EDGAR_ARCHIVE_BASE}/{folder}/{quote(doc, safe='/')}"


def _column(recent: dict[str, object], name: str) -> list[object]:
    values = recent.get(name)
    return values if isinstance(values, list) else []


def _cell(column: list[object], index: int) -> str:
    value = column[index] if index < len(column) else None
    return value if isinstance(value, str) else ""


def parse_edgar(payload: object, limit: int = MAX_FILINGS) -> list[Filing]:
    """Tracked filings from a submissions payload, newest first.

    `filings.recent` is a dict of parallel arrays (one entry per filing).
    """
    filings_obj = payload.get("filings") if isinstance(payload, dict) else None
    recent = filings_obj.get("recent") if isinstance(filings_obj, dict) else None
    if not isinstance(recent, dict):
        raise SourceError("EDGAR payload has no filings.recent")

    accessions = _column(recent, "accessionNumber")
    forms = _column(recent, "form")
    dates = _column(recent, "filingDate")
    accepted = _column(recent, "acceptanceDateTime")
    documents = _column(recent, "primaryDocument")
    descriptions = _column(recent, "primaryDocDescription")

    rows: list[tuple[str, str, Filing]] = []
    for i in range(len(accessions)):
        form = _cell(forms, i).strip().upper()
        accession = _cell(accessions, i).strip()
        if form not in TRACKED_FORMS or not _ACCESSION_RE.match(accession):
            continue
        try:
            filing = Filing(
                form=form,
                filed=_cell(dates, i),
                title=filing_title(form, _cell(descriptions, i)),
                url=filing_url(accession, _cell(documents, i)),
            )
        except ValidationError:
            log.info("edgar: skipping malformed row %s", accession)
            continue
        rows.append((filing.filed, _cell(accepted, i), filing))

    if not rows:
        raise SourceError("EDGAR returned no filings of the tracked forms")
    # EDGAR already lists newest first; sort anyway so the contract holds.
    rows.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [filing for _, _, filing in rows[:limit]]


def fetch_edgar(client: httpx.Client, user_agent: str) -> list[Filing]:
    if "@" not in user_agent:
        log.warning(
            "SEC_USER_AGENT has no contact e-mail; SEC may answer 403 "
            "(fair-access policy wants 'Name contact@example.com')"
        )
    response = get_with_retry(
        client,
        EDGAR_SUBMISSIONS_URL,
        timeout=REQUEST_TIMEOUT_S,
        headers={"User-Agent": user_agent, "Accept": "application/json"},
    )
    if response.status_code != 200:
        raise SourceError(f"HTTP {response.status_code}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise SourceError("invalid JSON") from exc
    return parse_edgar(payload)


# --- Alpha Vantage ---------------------------------------------------------------


def _bar(day: object, row: object) -> PriceBar | None:
    if not isinstance(row, dict):
        return None
    try:
        values = [
            float(row[key]) for key in ("1. open", "2. high", "3. low", "4. close")
        ]
        volume = float(row["5. volume"])
        if not all(math.isfinite(v) for v in [*values, volume]):
            return None
        open_, high, low, close = values
        if high < low:
            return None
        return PriceBar(
            date=day,
            open=open_,
            high=high,
            low=low,
            close=close,
            volume=int(volume),
        )
    except (KeyError, TypeError, ValueError, ValidationError):
        return None


def parse_alpha_vantage(payload: object, symbol: str = MARKET_SYMBOL) -> list[PriceBar]:
    """Daily bars, date ascending. Soft errors (HTTP 200 + a notice) raise."""
    if not isinstance(payload, dict):
        raise SourceError("unexpected Alpha Vantage payload")
    for key in _AV_SOFT_ERROR_KEYS:
        if key in payload:
            # The notice text is not echoed: keep error strings short and key-free.
            raise SourceError(f"Alpha Vantage soft error ({key})")
    meta = payload.get("Meta Data")
    if isinstance(meta, dict):
        got = meta.get("2. Symbol")
        if isinstance(got, str) and got.strip().upper() != symbol:
            raise SourceError(f"Alpha Vantage returned symbol {got.strip()[:12]!r}")
    series = payload.get(_AV_SERIES_KEY)
    if not isinstance(series, dict) or not series:
        raise SourceError("Alpha Vantage payload has no daily series")

    bars = [bar for day, row in series.items() if (bar := _bar(day, row)) is not None]
    if not bars:
        raise SourceError("Alpha Vantage series had no valid rows")
    if len(bars) < len(series):
        log.info("alphavantage: skipped %d malformed rows", len(series) - len(bars))
    return sorted(bars, key=lambda bar: bar.date)


def fetch_alpha_vantage(client: httpx.Client, api_key: str) -> list[PriceBar]:
    params = {
        "function": "TIME_SERIES_DAILY",
        "symbol": MARKET_SYMBOL,
        "outputsize": "compact",
        "apikey": api_key,
    }
    response = get_with_retry(
        client, ALPHA_VANTAGE_URL, timeout=REQUEST_TIMEOUT_S, params=params
    )
    if response.status_code != 200:
        raise SourceError(f"HTTP {response.status_code}")
    try:
        payload = response.json()
    except ValueError:
        raise SourceError("invalid JSON") from None
    return parse_alpha_vantage(payload)


def merge_prices(
    existing: Sequence[PriceBar],
    fresh: Sequence[PriceBar],
    cap: int = MAX_PRICE_BARS,
) -> list[PriceBar]:
    """Union keyed by date (fresh rows win), ascending, newest `cap` kept."""
    by_date = {bar.date: bar for bar in existing}
    by_date.update((bar.date, bar) for bar in fresh)
    return [by_date[day] for day in sorted(by_date)][-cap:]


# --- Orchestration ---------------------------------------------------------------


def _error_text(exc: Exception) -> str:
    # SourceError messages are ours and key-free; anything else is reduced to its
    # type so a chained httpx error can never surface a request URL.
    return str(exc) if isinstance(exc, SourceError) else type(exc).__name__


def refreshed_today(doc: MarketDoc | None, now: datetime) -> bool:
    return doc is not None and local_date(doc.updated_at) == local_date(now)


def _guarded[T](
    store: HealthStore,
    name: str,
    now: datetime,
    fetch: Callable[[], T],
    respect_skip: bool,
) -> T:
    """Run one source with the same health rule as the news chain.

    Every source failing leaves the document untouched, so each 15-minute run would
    try again; after 3 failures in a row the source rests for 24 h instead (e.g. SEC
    rejecting an undeclared User-Agent should not be hit ~96 times a day).
    """
    health = store.get_health(name)
    if respect_skip and health.skip_until is not None and health.skip_until > now:
        raise SourceError(f"skipped until {health.skip_until.isoformat()}")
    try:
        result = fetch()
    except Exception as exc:
        failures = health.consecutive_failures + 1
        rest = failures >= FAILURES_BEFORE_SKIP
        store.save_health(
            SourceHealth(
                id=name,
                consecutive_failures=failures,
                skip_until=now + SKIP_DURATION if rest else None,
                last_error=_error_text(exc)[:200],
            )
        )
        raise
    if health.consecutive_failures or health.skip_until is not None:
        store.save_health(SourceHealth(id=name))
    return result


def refresh_market(
    store: MarketStore,
    http: httpx.Client,
    now: datetime,
    force: bool = False,
    *,
    alphavantage_api_key: str | None = None,
    sec_user_agent: str = DEFAULT_SEC_USER_AGENT,
) -> MarketRefresh:
    """Refresh the `market` document, at most once per Istanbul day unless `force`.

    Each source is isolated: what succeeds is merged onto the stored document, what
    fails keeps its previous data. Nothing is written when every source fails, so the
    next run tries again (until a source has failed 3 times in a row; see `_guarded`).
    `force` ignores both the daily guard and the 24 h rest.
    """
    existing = store.load_market()
    if not force and refreshed_today(existing, now):
        log.info("market: already refreshed today; skipping")
        return MarketRefresh(status="skipped", doc=existing)

    filings = list(existing.filings) if existing else []
    prices = list(existing.prices) if existing else []
    errors: list[str] = []
    succeeded: list[str] = []

    try:
        filings = _guarded(
            store,
            EDGAR_HEALTH,
            now,
            lambda: fetch_edgar(http, sec_user_agent),
            respect_skip=not force,
        )
        succeeded.append("edgar")
    except Exception as exc:  # one source must not take the other down
        errors.append(f"edgar: {_error_text(exc)}")
        log.warning("market: EDGAR failed (%s); keeping stored filings", errors[-1])

    if alphavantage_api_key:
        key = alphavantage_api_key
        try:
            fresh = _guarded(
                store,
                ALPHA_VANTAGE_HEALTH,
                now,
                lambda: fetch_alpha_vantage(http, key),
                respect_skip=not force,
            )
            prices = merge_prices(prices, fresh)
            succeeded.append("alphavantage")
        except Exception as exc:
            errors.append(f"alphavantage: {_error_text(exc)}")
            log.warning(
                "market: Alpha Vantage failed (%s); keeping stored prices", errors[-1]
            )
    else:
        log.info("market: ALPHAVANTAGE_API_KEY not set; keeping stored prices")

    if not succeeded:
        log.warning("market: every source failed; document left unchanged")
        return MarketRefresh(status="failed", doc=existing, errors=errors)

    doc = MarketDoc(
        updated_at=now,
        price_source=PRICE_SOURCE if prices else None,
        prices=prices,
        filings=filings,
    )
    store.save_market(doc)
    log.info(
        "market: saved %d filings, %d price bars (ok: %s)",
        len(doc.filings),
        len(doc.prices),
        ",".join(succeeded),
    )
    return MarketRefresh(status="written", doc=doc, errors=errors)
