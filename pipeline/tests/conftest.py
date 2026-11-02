from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from tagnews.llm import ArticleInput, Enrichment, LlmResult

TESTS_DIR = Path(__file__).resolve().parent
FIXTURES = TESTS_DIR / "fixtures"
SHARED_FIXTURES = TESTS_DIR.parents[1] / "shared" / "fixtures"
NOW = datetime(2026, 11, 2, 9, 0, tzinfo=UTC)

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
