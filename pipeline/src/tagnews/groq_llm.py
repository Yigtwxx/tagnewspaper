"""Groq enrichment and story matching within the free plan's limits.

Free plan, openai/gpt-oss-120b: 30 requests and 8,000 tokens per minute, 1,000
requests and 200,000 tokens per day. Groq charges a request's prompt plus its
`max_completion_tokens` to the minute budget as soon as the request arrives, so each
call first reserves that much from a local copy of the budget (refilled continuously,
like Groq's), and the copy is lowered to Groq's own count from the `x-ratelimit-*`
headers after every answer. A `retry-after` longer than a minute means a daily limit:
Groq is then switched off for the rest of the run and callers fall back to the next
provider.
"""

from __future__ import annotations

import copy
import json
import logging
import math
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any

import httpx
from pydantic import BaseModel, ValidationError

from tagnews.llm import (
    ArticleInput,
    Enrichment,
    LlmResult,
    build_user_message,
    load_system_prompt,
)
from tagnews.stories import (
    MatchResult,
    StoryChoice,
    StoryRef,
    build_match_message,
    choose_story,
    first_sentence,
    load_match_prompt,
)

log = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
TPM_LIMIT = 8_000
RPM_LIMIT = 30
# Kept free under the minute ceiling, since the prompt size is an estimate.
TPM_MARGIN = 300
# Measured: Turkish article text is ~2.8 characters per token, the English prompt and
# the JSON schema ~4.5. One ratio of 3 over-counts the whole request a little.
CHARS_PER_TOKEN = 3.0
REQUEST_OVERHEAD_TOKENS = 64
# A longer wait is a daily limit, not a per-minute one.
MAX_RETRY_AFTER_S = 60.0
MAX_ATTEMPTS = 3
MAX_CONSECUTIVE_FAILURES = 3
# Waiting for Groq must leave room in the 10-minute GitHub Actions job.
RUN_BUDGET_S = 300.0

# Measured on real articles: 420-810 completion tokens (about half of it reasoning).
ENRICH_MAX_COMPLETION_TOKENS = 2_000
MATCH_MAX_COMPLETION_TOKENS = 500
# Keeps one enrichment request under the minute ceiling (prompt + completion).
MAX_TEXT_CHARS = 8_000


class GroqError(Exception):
    """One request failed; the next provider may answer instead."""


class GroqUnavailable(GroqError):
    """Groq is off for the rest of this run (daily limit, time budget, bad key...)."""


@dataclass(frozen=True)
class GroqReply:
    content: str
    finish_reason: str | None
    prompt_tokens: int
    completion_tokens: int


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """The model's JSON schema in the shape Groq's strict mode accepts: every property
    required and no additional properties, on every object."""
    schema = copy.deepcopy(model.model_json_schema())

    def walk(node: object) -> None:
        if isinstance(node, list):
            for value in node:
                walk(value)
            return
        if not isinstance(node, dict):
            return
        # Schema keywords only: a property may itself be called "title".
        node.pop("title", None)
        node.pop("default", None)
        if node.get("type") == "object" and "properties" in node:
            node["additionalProperties"] = False
            node["required"] = list(node["properties"])
        for key, value in node.items():
            if key in ("properties", "$defs") and isinstance(value, dict):
                for subschema in value.values():
                    walk(subschema)
            else:
                walk(value)

    walk(schema)
    return schema


def estimate_prompt_tokens(*parts: str) -> int:
    chars = sum(len(part) for part in parts)
    return math.ceil(chars / CHARS_PER_TOKEN) + REQUEST_OVERHEAD_TOKENS


class MinuteBudget:
    """Local copy of the per-minute limits: token and request buckets that refill
    continuously, as Groq's do."""

    def __init__(self, tpm: int, rpm: int, clock: Callable[[], float]) -> None:
        self.tpm, self.rpm = tpm, rpm
        self._clock = clock
        self._tokens = float(tpm)
        self._requests = float(rpm)
        self._blocked_until = 0.0
        self._at = clock()

    def _refill(self) -> float:
        now = self._clock()
        elapsed = max(0.0, now - self._at)
        self._at = now
        self._tokens = min(self.tpm, self._tokens + elapsed * self.tpm / 60)
        self._requests = min(self.rpm, self._requests + elapsed * self.rpm / 60)
        return now

    def wait_time(self, tokens: int) -> float:
        """Seconds until a request reserving `tokens` may be sent."""
        now = self._refill()
        token_wait = max(0.0, tokens - self._tokens) * 60 / self.tpm
        request_wait = max(0.0, 1 - self._requests) * 60 / self.rpm
        return max(token_wait, request_wait, self._blocked_until - now)

    def take(self, tokens: int) -> None:
        self._refill()
        self._tokens -= tokens
        self._requests -= 1

    def sync(self, remaining_tokens: int | None) -> None:
        """Adopt Groq's count of the tokens left when it is lower than ours."""
        self._refill()
        if remaining_tokens is not None:
            self._tokens = min(self._tokens, float(remaining_tokens))

    def block(self, seconds: float) -> None:
        now = self._refill()
        self._blocked_until = max(self._blocked_until, now + seconds)


def _header_number(response: httpx.Response, name: str) -> float | None:
    raw = response.headers.get(name)
    if raw is None:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


class GroqClient:
    """Chat completions with strict JSON output, paced to the free plan's limits.

    One client is shared by the summarizer and the matcher: Groq counts both against
    the same per-model budget.
    """

    def __init__(
        self,
        api_key: str,
        *,
        http: httpx.Client | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        run_budget_s: float = RUN_BUDGET_S,
        tpm: int = TPM_LIMIT,
        rpm: int = RPM_LIMIT,
    ) -> None:
        self._http = http or httpx.Client(base_url=GROQ_BASE_URL, timeout=60.0)
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._clock, self._sleep = clock, sleep
        self._budget = MinuteBudget(tpm, rpm, clock)
        self._run_budget_s = run_budget_s
        # Starts with the first call: collecting and decoding come before any LLM work.
        self._deadline: float | None = None
        self._failures = 0
        self.unavailable: str | None = None  # why Groq is off for this run

    def close(self) -> None:
        self._http.close()

    def _switch_off(self, reason: str) -> GroqUnavailable:
        if self.unavailable is None:
            log.warning("groq off for the rest of this run: %s", reason)
            self.unavailable = reason
        return GroqUnavailable(reason)

    def _wait_for(self, tokens: int) -> None:
        if self._deadline is None:
            self._deadline = self._clock() + self._run_budget_s
        wait = self._budget.wait_time(tokens)
        if self._clock() + wait > self._deadline:
            raise self._switch_off("run time budget used up")
        if wait > 0:
            log.info("groq: waiting %.1fs for the per-minute limit", wait)
            self._sleep(wait)

    def _failed(self, reason: str, attempt: int) -> None:
        log.warning("groq request failed: %s (attempt %d)", reason, attempt + 1)
        if attempt < MAX_ATTEMPTS - 1:
            self._sleep(min(2.0**attempt, 8.0))

    def complete_json(
        self,
        *,
        model: str,
        system: str,
        user: str,
        schema_name: str,
        schema: dict[str, Any],
        max_completion_tokens: int,
    ) -> GroqReply:
        if self.unavailable is not None:
            raise GroqUnavailable(self.unavailable)
        reserve = (
            estimate_prompt_tokens(system, user, json.dumps(schema))
            + max_completion_tokens
        )
        if reserve > self._budget.tpm - TPM_MARGIN:
            raise GroqError("request_too_large")
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_completion_tokens": max_completion_tokens,
            "reasoning_effort": "low",
            "include_reasoning": False,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        }
        for attempt in range(MAX_ATTEMPTS):
            self._wait_for(reserve)
            self._budget.take(reserve)
            try:
                response = self._http.post(
                    "/chat/completions", json=body, headers=self._headers
                )
            except httpx.TransportError as exc:
                self._failed(type(exc).__name__, attempt)
                continue
            remaining = _header_number(response, "x-ratelimit-remaining-tokens")
            self._budget.sync(None if remaining is None else int(remaining))
            status = response.status_code
            if status == 429:
                retry_after = _header_number(response, "retry-after") or 10.0
                if retry_after > MAX_RETRY_AFTER_S:
                    raise self._switch_off(f"rate limited for {retry_after:.0f}s")
                log.info("groq: 429, retrying after %.1fs", retry_after)
                self._budget.block(retry_after)
                continue
            if status >= 500:
                self._failed(f"http_{status}", attempt)
                continue
            if status in (401, 403):
                raise self._switch_off(f"http_{status}")
            if status != 200:
                raise GroqError(f"http_{status}")
            reply = self._parse(response)
            self._failures = 0
            if _header_number(response, "x-ratelimit-remaining-requests") == 0:
                self._switch_off("daily request limit reached")
            return reply
        self._failures += 1
        if self._failures >= MAX_CONSECUTIVE_FAILURES:
            raise self._switch_off("repeated failures")
        raise GroqError("retries_exhausted")

    @staticmethod
    def _parse(response: httpx.Response) -> GroqReply:
        try:
            data = response.json()
            choice = data["choices"][0]
            usage = data.get("usage") or {}
            return GroqReply(
                content=choice["message"].get("content") or "",
                finish_reason=choice.get("finish_reason"),
                prompt_tokens=int(usage.get("prompt_tokens", 0)),
                completion_tokens=int(usage.get("completion_tokens", 0)),
            )
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise GroqError("malformed_response") from exc


class GroqSummarizer:
    def __init__(self, client: GroqClient, model: str) -> None:
        self.model = model
        self._client = client
        self._system = load_system_prompt()
        self._schema = strict_schema(Enrichment)

    def enrich(
        self, article: ArticleInput, feedback: list[str] | None = None
    ) -> LlmResult:
        model = self.model
        if article.text and len(article.text) > MAX_TEXT_CHARS:
            # Guards and fact checks still run against the full text.
            article = replace(article, text=article.text[:MAX_TEXT_CHARS])
        try:
            reply = self._client.complete_json(
                model=model,
                system=self._system,
                user=build_user_message(article, feedback),
                schema_name="enrichment",
                schema=self._schema,
                max_completion_tokens=ENRICH_MAX_COMPLETION_TOKENS,
            )
        except GroqUnavailable:
            return LlmResult("error", None, 0, 0, "groq_unavailable", model)
        except GroqError as exc:
            return LlmResult("error", None, 0, 0, str(exc), model)
        tokens_in, tokens_out = reply.prompt_tokens, reply.completion_tokens
        if reply.finish_reason != "stop":
            detail = f"finish_{reply.finish_reason}"
            return LlmResult("error", None, tokens_in, tokens_out, detail, model)
        try:
            enrichment = Enrichment.model_validate_json(reply.content)
        except ValidationError:
            log.warning("groq enrichment failed validation")
            return LlmResult(
                "error", None, tokens_in, tokens_out, "invalid_output", model
            )
        return LlmResult("ok", enrichment, tokens_in, tokens_out, model=model)


class GroqStoryMatcher:
    def __init__(self, client: GroqClient, model: str) -> None:
        self.model = model
        self._client = client
        self._system = load_match_prompt()
        self._schema = strict_schema(StoryChoice)

    def match(
        self,
        headline: str,
        summary: str | None,
        published_at: datetime,
        stories: Sequence[StoryRef],
    ) -> MatchResult:
        if not stories:
            return MatchResult(None, model=self.model)
        message, labels = build_match_message(
            headline, first_sentence(summary), published_at, stories
        )
        try:
            reply = self._client.complete_json(
                model=self.model,
                system=self._system,
                user=message,
                schema_name="story_choice",
                schema=self._schema,
                max_completion_tokens=MATCH_MAX_COMPLETION_TOKENS,
            )
            if reply.finish_reason != "stop":
                raise GroqError(f"finish_{reply.finish_reason}")
            choice = StoryChoice.model_validate_json(reply.content)
        except (GroqError, ValidationError) as exc:
            # Never log a ValidationError itself: it quotes the model's raw output.
            reason = "invalid_output" if isinstance(exc, ValidationError) else exc
            log.warning("groq story match failed: %s", reason)
            return MatchResult(None, model=self.model, ok=False)
        cluster_id = choose_story(choice.story, labels, headline, summary, stories)
        return MatchResult(
            cluster_id, reply.prompt_tokens, reply.completion_tokens, model=self.model
        )
