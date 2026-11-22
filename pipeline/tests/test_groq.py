from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime

import httpx
import pytest

from tagnews.groq_llm import (
    ENRICH_MAX_COMPLETION_TOKENS,
    MAX_TEXT_CHARS,
    GroqClient,
    GroqError,
    GroqStoryMatcher,
    GroqSummarizer,
    GroqUnavailable,
    MinuteBudget,
    strict_schema,
)
from tagnews.llm import ArticleInput, Enrichment, FallbackSummarizer, LlmResult
from tagnews.stories import FallbackStoryMatcher, MatchResult, StoryRef

from conftest import FakeSummarizer, make_enrichment

MODEL = "openai/gpt-oss-120b"


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0
        self.slept: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def _reply(
    content: str,
    finish_reason: str = "stop",
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    body = {
        "choices": [{"message": {"content": content}, "finish_reason": finish_reason}],
        "usage": {"prompt_tokens": 2300, "completion_tokens": 600},
    }
    return httpx.Response(200, json=body, headers=headers or {})


def _client(
    responses: list[httpx.Response],
    clock: FakeClock,
    run_budget_s: float = 300.0,
) -> tuple[GroqClient, list[httpx.Request]]:
    sent: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return responses.pop(0)

    http = httpx.Client(
        base_url="https://api.groq.test/openai/v1",
        transport=httpx.MockTransport(handler),
    )
    client = GroqClient(
        "gsk_test", http=http, clock=clock, sleep=clock.sleep, run_budget_s=run_budget_s
    )
    return client, sent


def _ask(client: GroqClient, max_completion_tokens: int = 100) -> str:
    return client.complete_json(
        model=MODEL,
        system="system",
        user="user",
        schema_name="x",
        schema={"type": "object"},
        max_completion_tokens=max_completion_tokens,
    ).content


def _article(text: str | None) -> ArticleInput:
    return ArticleInput(
        title="Martı TAG kararı",
        source_name="Kaynak",
        url="https://example.com/haber",
        published_at=datetime(2026, 11, 22, 9, tzinfo=UTC),
        text=text,
    )


# --- schema --------------------------------------------------------------------


def test_strict_schema_closes_every_object_and_requires_every_property() -> None:
    schema = strict_schema(Enrichment)
    objects: list[dict[str, object]] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" and "properties" in node:
                objects.append(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(schema)
    assert len(objects) >= 4  # Enrichment + statement, event, stat claim
    for obj in objects:
        assert obj["additionalProperties"] is False
        assert set(obj["required"]) == set(obj["properties"])  # type: ignore[arg-type]


# --- minute budget -------------------------------------------------------------


def test_minute_budget_refills_tokens_continuously() -> None:
    clock = FakeClock()
    budget = MinuteBudget(8000, 30, clock)
    assert budget.wait_time(8000) == 0
    budget.take(7000)
    # 1,000 left; 2,000 needed -> 1,000 tokens at 8,000/min = 7.5 s.
    assert budget.wait_time(2000) == pytest.approx(7.5)
    clock.now += 7.5
    assert budget.wait_time(2000) == pytest.approx(0)


def test_minute_budget_limits_requests_per_minute() -> None:
    clock = FakeClock()
    budget = MinuteBudget(8000, 30, clock)
    for _ in range(30):
        budget.take(1)
    assert budget.wait_time(1) == pytest.approx(2.0)  # one request every 2 s


def test_minute_budget_adopts_a_lower_remote_count() -> None:
    clock = FakeClock()
    budget = MinuteBudget(8000, 30, clock)
    budget.sync(800)
    assert budget.wait_time(1600) == pytest.approx(6.0)
    budget.sync(7900)  # never raised above the local count
    assert budget.wait_time(1600) == pytest.approx(6.0)


# --- client ----------------------------------------------------------------------


def test_client_waits_for_the_minute_budget_between_calls() -> None:
    clock = FakeClock()
    client, sent = _client([_reply("{}"), _reply("{}")], clock)
    _ask(client, max_completion_tokens=5000)
    _ask(client, max_completion_tokens=5000)
    assert len(sent) == 2
    assert clock.slept and clock.slept[0] > 10  # second call waited for tokens
    body = json.loads(sent[0].content)
    assert body["max_completion_tokens"] == 5000
    assert body["response_format"]["json_schema"]["strict"] is True
    assert sent[0].headers["Authorization"] == "Bearer gsk_test"


def test_client_retries_after_a_short_429() -> None:
    clock = FakeClock()
    limited = httpx.Response(429, headers={"retry-after": "4"})
    client, sent = _client([limited, _reply('{"ok": 1}')], clock)
    assert _ask(client) == '{"ok": 1}'
    assert len(sent) == 2
    assert sum(clock.slept) >= 4


def test_client_switches_off_on_a_daily_limit() -> None:
    clock = FakeClock()
    limited = httpx.Response(429, headers={"retry-after": "3600"})
    client, sent = _client([limited], clock)
    with pytest.raises(GroqUnavailable):
        _ask(client)
    with pytest.raises(GroqUnavailable):
        _ask(client)  # no second request
    assert len(sent) == 1
    assert client.unavailable is not None


def test_client_switches_off_when_the_run_budget_is_used_up() -> None:
    clock = FakeClock()
    client, sent = _client([_reply("{}")], clock, run_budget_s=5.0)
    _ask(client, max_completion_tokens=7000)
    with pytest.raises(GroqUnavailable):
        _ask(client, max_completion_tokens=7000)  # would need to wait ~50 s
    assert len(sent) == 1


def test_client_rejects_requests_larger_than_the_minute_limit() -> None:
    clock = FakeClock()
    client, sent = _client([], clock)
    with pytest.raises(GroqError) as err:
        _ask(client, max_completion_tokens=8000)
    assert not isinstance(err.value, GroqUnavailable)
    assert sent == []


def test_client_switches_off_on_a_bad_key() -> None:
    clock = FakeClock()
    client, _ = _client([httpx.Response(401)], clock)
    with pytest.raises(GroqUnavailable):
        _ask(client)


def test_client_switches_off_after_the_last_daily_request() -> None:
    clock = FakeClock()
    last = _reply("{}", headers={"x-ratelimit-remaining-requests": "0"})
    client, _ = _client([last], clock)
    assert _ask(client) == "{}"
    with pytest.raises(GroqUnavailable):
        _ask(client)


# --- summarizer ------------------------------------------------------------------


def test_groq_summarizer_returns_the_enrichment_with_its_model() -> None:
    clock = FakeClock()
    enrichment = make_enrichment()
    client, sent = _client([_reply(enrichment.model_dump_json())], clock)
    result = GroqSummarizer(client, MODEL).enrich(_article("Metin. " * 100))
    assert result.status == "ok"
    assert result.enrichment == enrichment
    assert result.model == MODEL
    assert (result.input_tokens, result.output_tokens) == (2300, 600)
    body = json.loads(sent[0].content)
    assert body["max_completion_tokens"] == ENRICH_MAX_COMPLETION_TOKENS


def test_groq_summarizer_caps_the_article_text() -> None:
    clock = FakeClock()
    client, sent = _client([_reply(make_enrichment().model_dump_json())], clock)
    GroqSummarizer(client, MODEL).enrich(_article("a" * (MAX_TEXT_CHARS * 2)))
    user = json.loads(sent[0].content)["messages"][1]["content"]
    assert "a" * MAX_TEXT_CHARS in user
    assert "a" * (MAX_TEXT_CHARS + 1) not in user


def test_groq_summarizer_reports_a_truncated_answer_as_an_error() -> None:
    clock = FakeClock()
    client, _ = _client([_reply('{"relevant": tr', finish_reason="length")], clock)
    result = GroqSummarizer(client, MODEL).enrich(_article("Metin. " * 100))
    assert result.status == "error"
    assert result.detail == "finish_length"


def test_groq_summarizer_reports_unavailable_as_an_error() -> None:
    clock = FakeClock()
    limited = httpx.Response(429, headers={"retry-after": "7200"})
    client, _ = _client([limited], clock)
    result = GroqSummarizer(client, MODEL).enrich(_article("Metin. " * 100))
    assert (result.status, result.detail) == ("error", "groq_unavailable")


# --- story matcher ---------------------------------------------------------------


def _stories() -> list[StoryRef]:
    when = datetime(2026, 11, 22, 8, tzinfo=UTC)
    return [StoryRef("c1", when, "Taksicilerden eylem", None)]


def test_groq_matcher_resolves_the_label() -> None:
    clock = FakeClock()
    client, _ = _client([_reply('{"story": "S1"}')], clock)
    result = GroqStoryMatcher(client, MODEL).match(
        "Taksiciler eylem yaptı",
        None,
        datetime(2026, 11, 22, 9, tzinfo=UTC),
        _stories(),
    )
    assert (result.cluster_id, result.ok, result.model) == ("c1", True, MODEL)


def test_groq_matcher_failure_is_not_ok() -> None:
    clock = FakeClock()
    client, _ = _client([httpx.Response(400)], clock)
    result = GroqStoryMatcher(client, MODEL).match(
        "Taksiciler eylem yaptı",
        None,
        datetime(2026, 11, 22, 9, tzinfo=UTC),
        _stories(),
    )
    assert (result.cluster_id, result.ok) == (None, False)


# --- fallback ------------------------------------------------------------------


def test_fallback_summarizer_asks_the_next_one_only_after_an_error() -> None:
    groq = FakeSummarizer([LlmResult("error", None, 0, 0, "groq_unavailable")])
    groq.model = MODEL
    claude = FakeSummarizer([LlmResult("ok", make_enrichment(), 10, 5)])
    result = FallbackSummarizer([groq, claude]).enrich(_article("Metin."))
    assert result.status == "ok"
    assert len(groq.calls) == len(claude.calls) == 1


def test_fallback_summarizer_keeps_the_first_answer() -> None:
    groq = FakeSummarizer([LlmResult("ok", make_enrichment(), 10, 5, model=MODEL)])
    claude = FakeSummarizer([])
    result = FallbackSummarizer([groq, claude]).enrich(_article("Metin."))
    assert result.model == MODEL
    assert claude.calls == []


def test_fallback_summarizer_does_not_pass_a_refusal_on() -> None:
    first = FakeSummarizer([LlmResult("refused", None, 5, 0, "cyber")])
    second = FakeSummarizer([])
    result = FallbackSummarizer([first, second]).enrich(_article("Metin."))
    assert result.status == "refused"
    assert second.calls == []


class _Matcher:
    def __init__(self, result: MatchResult) -> None:
        self.model = result.model or "m"
        self.result = result
        self.calls = 0

    def match(
        self,
        headline: str,
        summary: str | None,
        published_at: datetime,
        stories: Sequence[StoryRef],
    ) -> MatchResult:
        self.calls += 1
        return self.result


@pytest.mark.parametrize(
    ("first", "second_calls"),
    [
        (MatchResult(None, model=MODEL, ok=False), 1),  # failed -> ask Claude
        (MatchResult(None, model=MODEL), 0),  # "no story" is an answer
        (MatchResult("c1", model=MODEL), 0),
    ],
)
def test_fallback_matcher_asks_the_next_one_only_after_a_failure(
    first: MatchResult, second_calls: int
) -> None:
    primary = _Matcher(first)
    secondary = _Matcher(MatchResult("c2", model="claude-haiku-5-5"))
    FallbackStoryMatcher([primary, secondary]).match(
        "h", None, datetime(2026, 11, 22, tzinfo=UTC), _stories()
    )
    assert secondary.calls == second_calls


def test_fallback_summarizer_rejects_an_empty_chain() -> None:
    with pytest.raises(ValueError):
        FallbackSummarizer([])
