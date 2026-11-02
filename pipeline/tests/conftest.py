from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from tagnews.llm import ArticleInput, Enrichment, LlmResult
from tagnews.models import Filing, MarketDoc, PriceBar
from tagnews.sources import base
from tagnews.stories import MatchResult, StoryRef

TESTS_DIR = Path(__file__).resolve().parent
FIXTURES = TESTS_DIR / "fixtures"
SHARED_FIXTURES = TESTS_DIR.parents[1] / "shared" / "fixtures"
NOW = datetime(2026, 11, 2, 9, 0, tzinfo=UTC)
# Trimmed EDGAR submissions payload in the real shape; accession numbers are fictional.
EDGAR_SAMPLE = FIXTURES / "edgar_submissions_sample.json"

SOURCE_TEXT = (
    "İstanbul Bölge Adliye Mahkemesi 14. Hukuk Dairesi 23 Ekim 2026 tarihinde Martı "
    "TAG hakkında açılan haksız rekabet davasında şirket lehine karar verdi. Mahkeme "
    "ilk derece mahkemesinin kararını kaldırarak taksici esnaf odalarının açtığı asıl "
    "ve birleşen davaları reddetti. Kararda yasa koyucu veya yetkili idari makamlar "
    "tarafından yasaklanmayan bir ticari faaliyetin mahkeme kararıyla genel olarak "
    "engellenemeyeceği belirtildi. Taksici odası başkanı karara tepki göstererek "
    "uygulamanın denetlenmesi gerektiğini savundu. Şirket ise TAG'in 4,9 milyon "
    "yolcuya ulaştığını açıkladı. Davanın tarafları kararın ardından farklı "
    "açıklamalar yaptı ve sürecin nasıl ilerleyeceği merak konusu oldu. "
) * 2


def make_enrichment(**overrides: object) -> Enrichment:
    data: dict[str, object] = {
        "relevant": True,
        "summary": (
            "Habere göre istinaf mahkemesi, ilk derece mahkemesinin Martı TAG "
            "hakkındaki kararını kaldırdı ve davaları reddetti. Kararda, yasa "
            "koyucunun yasaklamadığı bir faaliyetin mahkemece durdurulamayacağı "
            "vurgulandı."
        ),
        "category": "dava",
        "actors": ["mahkeme", "marti"],
        "actor_statements": [
            {
                "actor": "taksici_odasi",
                "summary": "Oda başkanı, uygulamanın denetlenmesi gerektiğini savundu.",
            }
        ],
        "is_allegation": False,
        "risk_level": "low",
        "private_persons": [],
        "events": [
            {
                "date": "2026-10-23",
                "date_text": "23 Ekim 2026",
                "type": "court_decision",
                "title": "İstinaf mahkemesi ilk derece kararını kaldırdı",
                "description": "Habere göre istinaf mahkemesi davaları reddetti.",
                "court": "İstanbul Bölge Adliye Mahkemesi 14. Hukuk Dairesi",
            }
        ],
        "stat_claims": [
            {"key": "registered_riders", "raw_text": "4,9 milyon", "as_of": None}
        ],
    }
    data.update(overrides)
    return Enrichment.model_validate(data)


class FakeSummarizer:
    """Returns queued results in order; records the feedback it was given."""

    model = "claude-haiku-5-5"

    def __init__(self, results: list[LlmResult]) -> None:
        self._results = list(results)
        self.calls: list[tuple[ArticleInput, list[str] | None]] = []

    def enrich(
        self, article: ArticleInput, feedback: list[str] | None = None
    ) -> LlmResult:
        self.calls.append((article, feedback))
        if not self._results:
            return LlmResult("ok", make_enrichment(), 100, 50)
        return self._results.pop(0)


class FakeExtractor:
    def __init__(self, text: str | None) -> None:
        self.text = text
        self.urls: list[str] = []

    def fetch_text(self, url: str) -> str | None:
        self.urls.append(url)
        return self.text


@pytest.fixture
def now() -> datetime:
    return NOW


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def weekdays(start: date, count: int) -> list[str]:
    """`count` consecutive Mon-Fri dates from `start` (inclusive), as ISO strings."""
    days: list[str] = []
    day = start
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day.isoformat())
        day += timedelta(days=1)
    return days


def make_bar(day: str, close: float = 1.5, volume: int = 100_000) -> PriceBar:
    return PriceBar(
        date=day,
        open=close,
        high=close * 1.02,
        low=close * 0.98,
        close=close,
        volume=volume,
    )


def make_filing(filed: str = "2026-10-01", form: str = "6-K") -> Filing:
    return Filing(
        form=form,
        filed=filed,
        title=f"{form}: Dönemsel rapor",
        url="https://www.sec.gov/Archives/edgar/data/1852767/000110465926000001/a.htm",
    )


def make_market_doc(
    updated_at: datetime,
    prices: list[PriceBar] | None = None,
    filings: list[Filing] | None = None,
) -> MarketDoc:
    bars = (
        [make_bar(d) for d in weekdays(date(2026, 9, 1), 5)]
        if prices is None
        else prices
    )
    return MarketDoc(
        updated_at=updated_at,
        price_source="Alpha Vantage" if bars else None,
        prices=bars,
        filings=[make_filing()] if filings is None else filings,
    )


def alpha_vantage_payload(days: list[str], close: float = 2.0) -> dict[str, Any]:
    """A `TIME_SERIES_DAILY` response as Alpha Vantage sends it (newest first)."""
    series = {
        day: {
            "1. open": f"{close:.4f}",
            "2. high": f"{close * 1.03:.4f}",
            "3. low": f"{close * 0.97:.4f}",
            "4. close": f"{close:.4f}",
            "5. volume": "250000",
        }
        for day in sorted(days, reverse=True)
    }
    return {
        "Meta Data": {
            "1. Information": "Daily Prices (open, high, low, close) and Volumes",
            "2. Symbol": "MRT",
            "3. Last Refreshed": max(days),
            "4. Output Size": "Compact",
            "5. Time Zone": "US/Eastern",
        },
        "Time Series (Daily)": series,
    }


@pytest.fixture
def no_retry_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    """Skip tenacity's backoff sleeps in `get_with_retry` (retries still happen)."""
    monkeypatch.setattr(base._get.retry, "sleep", lambda _seconds: None)


class FakeMatcher:
    """Puts every article in one fixed story; records the stories it was offered."""

    model = "claude-haiku-5-5"

    def __init__(self, cluster_id: str | None) -> None:
        self.cluster_id = cluster_id
        self.offered: list[list[str]] = []

    def match(
        self,
        headline: str,
        summary: str | None,
        published_at: datetime,
        stories: Sequence[StoryRef],
    ) -> MatchResult:
        self.offered.append([s.cluster_id for s in stories])
        return MatchResult(self.cluster_id, 20, 2)
