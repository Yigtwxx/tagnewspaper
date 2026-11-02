"""Claude enrichment: relevance, neutral Turkish summary, classification, extraction.

One structured-output call per article (Claude Haiku 5.5 by default). 429/5xx/connection
errors are retried with exponential backoff; refusals are reported, not raised.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from importlib import resources
from typing import Literal, Protocol

import anthropic
from anthropic.types import ParsedMessage
from pydantic import BaseModel
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from tagnews.models import Actor, Category, EventType, RiskLevel, StatKey

log = logging.getLogger(__name__)

PROMPT_VERSION = "summarize_v1"
MAX_TOKENS = 8000
_RETRYABLE = (
    anthropic.RateLimitError,
    anthropic.InternalServerError,
    anthropic.APIConnectionError,
)


class LlmActorStatement(BaseModel):
    actor: Actor
    summary: str


class LlmEvent(BaseModel):
    date: str
    date_text: str
    type: EventType
    title: str
    description: str
    court: str | None


class LlmStatClaim(BaseModel):
    key: StatKey
    raw_text: str
    as_of: str | None


class Enrichment(BaseModel):
    relevant: bool
    summary: str
    category: Category
    actors: list[Actor]
    actor_statements: list[LlmActorStatement]
    is_allegation: bool
    risk_level: RiskLevel
    private_persons: list[str]
    events: list[LlmEvent]
    stat_claims: list[LlmStatClaim]


@dataclass(frozen=True)
class ArticleInput:
    title: str
    source_name: str
    url: str
    published_at: datetime
    text: str | None  # None -> title_only mode


@dataclass(frozen=True)
class LlmResult:
    status: Literal["ok", "refused", "error"]
    enrichment: Enrichment | None
    input_tokens: int
    output_tokens: int
    detail: str | None = None


class Summarizer(Protocol):
    model: str

    def enrich(
        self, article: ArticleInput, feedback: list[str] | None = None
    ) -> LlmResult:
        """Return an enrichment, or a refused/error result. Must not raise."""
        ...


def load_system_prompt() -> str:
    return (
        resources.files("tagnews.prompts")
        .joinpath(f"{PROMPT_VERSION}.md")
        .read_text(encoding="utf-8")
    )


def _escape_block(text: str) -> str:
    # Keep the article from closing our delimiter early.
    return text.replace("</article>", "</ article>")


def build_user_message(article: ArticleInput, feedback: list[str] | None) -> str:
    mode = "full_text" if article.text else "title_only"
    lines = [
        f"mode: {mode}",
        f"source: {article.source_name}",
        f"published_at_utc: {article.published_at.isoformat()}",
        f"url: {article.url}",
        f"headline: {article.title}",
        "<article>",
        _escape_block(article.text or article.title),
        "</article>",
    ]
    if feedback:
        lines.append(
            "A previous attempt was rejected by automatic checks. Fix these problems "
            "in the new answer:"
        )
        lines.extend(f"- {problem}" for problem in feedback)
    return "\n".join(lines)


class AnthropicSummarizer:
    def __init__(self, api_key: str, model: str) -> None:
        self.model = model
        # Retries are handled by tenacity below (429 / 5xx / connection errors).
        self._client = anthropic.Anthropic(
            api_key=api_key, max_retries=0, timeout=120.0
        )
        self._system = load_system_prompt()

    @retry(
        retry=retry_if_exception_type(_RETRYABLE),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=4, max=30),
        reraise=True,
    )
    def _parse(self, user_message: str) -> ParsedMessage[Enrichment]:
        return self._client.messages.parse(
            model=self.model,
            max_tokens=MAX_TOKENS,
            system=self._system,
            messages=[{"role": "user", "content": user_message}],
            output_format=Enrichment,
            output_config={"effort": "low"},
        )

    def enrich(
        self, article: ArticleInput, feedback: list[str] | None = None
    ) -> LlmResult:
        try:
            response = self._parse(build_user_message(article, feedback))
        except anthropic.BadRequestError as exc:
            log.error("LLM request rejected (400): %s", type(exc).__name__)
            return LlmResult("error", None, 0, 0, "bad_request")
        except anthropic.RateLimitError:
            log.warning("LLM rate limited after retries")
            return LlmResult("error", None, 0, 0, "rate_limited")
        except anthropic.APIStatusError as exc:
            log.warning("LLM API error: HTTP %s", exc.status_code)
            return LlmResult("error", None, 0, 0, f"http_{exc.status_code}")
        except anthropic.APIConnectionError:
            log.warning("LLM connection error after retries")
            return LlmResult("error", None, 0, 0, "connection")
        except Exception as exc:  # e.g. a response that fails schema validation
            log.warning("LLM response unusable: %s", type(exc).__name__)
            return LlmResult("error", None, 0, 0, type(exc).__name__)

        usage = response.usage
        in_tok, out_tok = usage.input_tokens, usage.output_tokens
        if response.stop_reason == "refusal":
            category = getattr(response.stop_details, "category", None)
            log.info("LLM refused (category=%s)", category)
            return LlmResult("refused", None, in_tok, out_tok, str(category))
        if response.stop_reason == "max_tokens" or response.parsed_output is None:
            return LlmResult("error", None, in_tok, out_tok, "no_parsed_output")
        return LlmResult("ok", response.parsed_output, in_tok, out_tok)
