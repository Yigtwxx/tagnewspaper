"""Match a new article to a story already on the page.

Title similarity misses the same story told in different words ("Dalcı'dan vergi
incelemesi çağrısı" vs "Taksicilerden Bakan Şimşek'e çağrı") and confuses different
stories told in similar words (protests in two cities). A small Claude call compares
the new article with the stories of the last 48 hours and names the one it belongs to,
if any. Matching is best effort: on any failure the title-based cluster stands.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from importlib import resources
from typing import Protocol

import anthropic
from anthropic.types import ParsedMessage
from pydantic import BaseModel
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from tagnews.models import ArticleDoc
from tagnews.snapshot import local_date
from tagnews.textnorm import words

log = logging.getLogger(__name__)

MATCH_PROMPT = "match_story_v1"
MATCH_MAX_TOKENS = 300
MAX_STORIES = 40
STORY_WINDOW = timedelta(hours=48)
SUMMARY_CHARS = 180
_RETRYABLE = (
    anthropic.RateLimitError,
    anthropic.InternalServerError,
    anthropic.APIConnectionError,
)


@dataclass(frozen=True)
class StoryRef:
    cluster_id: str
    published_at: datetime
    headline: str
    summary: str | None


@dataclass(frozen=True)
class MatchResult:
    cluster_id: str | None
    input_tokens: int = 0
    output_tokens: int = 0


class StoryMatcher(Protocol):
    model: str

    def match(
        self,
        headline: str,
        summary: str | None,
        published_at: datetime,
        stories: Sequence[StoryRef],
    ) -> MatchResult:
        """Return the cluster of the matching story, or None. Must not raise."""
        ...


class StoryChoice(BaseModel):
    story: str | None


PROVINCES: tuple[str, ...] = (
    "adana",
    "adıyaman",
    "afyonkarahisar",
    "ağrı",
    "aksaray",
    "amasya",
    "ankara",
    "antalya",
    "ardahan",
    "artvin",
    "aydın",
    "balıkesir",
    "bartın",
    "batman",
    "bayburt",
    "bilecik",
    "bingöl",
    "bitlis",
    "bolu",
    "burdur",
    "bursa",
    "çanakkale",
    "çankırı",
    "çorum",
    "denizli",
    "diyarbakır",
    "düzce",
    "edirne",
    "elazığ",
    "erzincan",
    "erzurum",
    "eskişehir",
    "gaziantep",
    "giresun",
    "gümüşhane",
    "hakkari",
    "hatay",
    "ığdır",
    "ısparta",
    "istanbul",
    "izmir",
    "kahramanmaraş",
    "karabük",
    "karaman",
    "kars",
    "kastamonu",
    "kayseri",
    "kilis",
    "kırıkkale",
    "kırklareli",
    "kırşehir",
    "kocaeli",
    "konya",
    "kütahya",
    "malatya",
    "manisa",
    "mardin",
    "mersin",
    "muğla",
    "muş",
    "nevşehir",
    "niğde",
    "ordu",
    "osmaniye",
    "rize",
    "sakarya",
    "samsun",
    "şanlıurfa",
    "siirt",
    "sinop",
    "sivas",
    "şırnak",
    "tekirdağ",
    "tokat",
    "trabzon",
    "tunceli",
    "uşak",
    "van",
    "yalova",
    "yozgat",
    "zonguldak",
)
_ALIASES = {
    "afyon": "afyonkarahisar",
    "antep": "gaziantep",
    "maraş": "kahramanmaraş",
    "urfa": "şanlıurfa",
    "izmit": "kocaeli",
}
_NAMES = {name: name for name in PROVINCES} | _ALIASES
# Short names, and names that start common words ("tokatladı", "aydınlık"), only count
# as whole words; the rest also match with a suffix ("Ispartalılar", "Bursalı").
_WHOLE_WORD_ONLY = {n for n in _NAMES if len(n) <= 4} | {"tokat", "aydın", "batman"}
_MAX_SUFFIX = 6


def provinces_in(text: str) -> set[str]:
    found: set[str] = set()
    for token in words(text):
        for name, province in _NAMES.items():
            if token == name or (
                name not in _WHOLE_WORD_ONLY
                and token.startswith(name)
                and len(token) - len(name) <= _MAX_SUFFIX
            ):
                found.add(province)
    return found


def same_place(new_text: str, story_text: str) -> bool:
    """False when both texts name provinces but none in common (two cities)."""
    new, story = provinces_in(new_text), provinces_in(story_text)
    return not new or not story or bool(new & story)


def _first_sentence(text: str | None) -> str | None:
    if not text:
        return None
    end = text.find(". ")
    sentence = text if end == -1 else text[: end + 1]
    return sentence[:SUMMARY_CHARS].strip()


def recent_stories(articles: Sequence[ArticleDoc], now: datetime) -> list[StoryRef]:
    """One entry per story of the 48 hours around `now`, most recently active first.

    The summarized copy speaks for its story, since it says the most about it.
    """
    best: dict[str, ArticleDoc] = {}
    latest: dict[str, datetime] = {}
    for article in articles:
        age = now - article.published_at
        if article.display == "hidden" or not article.relevant:
            continue
        if age > STORY_WINDOW or age < -STORY_WINDOW:
            continue
        cid = article.cluster_id
        latest[cid] = max(latest.get(cid, article.published_at), article.published_at)
        current = best.get(cid)
        rank = (article.display == "full", article.published_at)
        if current is None or rank > (current.display == "full", current.published_at):
            best[article.cluster_id] = article
    stories = [
        StoryRef(
            cluster_id=a.cluster_id,
            published_at=a.published_at,
            headline=a.title,
            summary=_first_sentence(a.summary),
        )
        for a in best.values()
    ]
    stories.sort(key=lambda s: latest[s.cluster_id], reverse=True)
    return stories[:MAX_STORIES]


def _fence(text: str) -> str:
    # News text must not be able to close our blocks.
    return text.replace("</", "< /")


def build_match_message(
    headline: str,
    summary: str | None,
    published_at: datetime,
    stories: Sequence[StoryRef],
) -> tuple[str, dict[str, str]]:
    labels: dict[str, str] = {}
    lines = [
        "<new_article>",
        f"date: {local_date(published_at).isoformat()}",
        f"headline: {_fence(headline)}",
    ]
    if summary:
        lines.append(f"summary: {_fence(summary)}")
    lines += ["</new_article>", "<recent_stories>"]
    for i, story in enumerate(stories, start=1):
        label = f"S{i}"
        labels[label] = story.cluster_id
        text = _fence(story.headline)
        if story.summary:
            text += f" — {_fence(story.summary)}"
        lines.append(f"{label} | {local_date(story.published_at).isoformat()} | {text}")
    lines.append("</recent_stories>")
    return "\n".join(lines), labels


def resolve_label(label: str | None, labels: dict[str, str]) -> str | None:
    if not label:
        return None
    return labels.get(label.strip().upper())


class AnthropicStoryMatcher:
    def __init__(self, api_key: str, model: str) -> None:
        self.model = model
        self._client = anthropic.Anthropic(api_key=api_key, max_retries=0, timeout=60.0)
        self._system = (
            resources.files("tagnews.prompts")
            .joinpath(f"{MATCH_PROMPT}.md")
            .read_text(encoding="utf-8")
        )

    @retry(
        retry=retry_if_exception_type(_RETRYABLE),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=4, max=30),
        reraise=True,
    )
    def _parse(self, user_message: str) -> ParsedMessage[StoryChoice]:
        return self._client.messages.parse(
            model=self.model,
            max_tokens=MATCH_MAX_TOKENS,
            system=self._system,
            messages=[{"role": "user", "content": user_message}],
            output_format=StoryChoice,
            output_config={"effort": "low"},
        )

    def match(
        self,
        headline: str,
        summary: str | None,
        published_at: datetime,
        stories: Sequence[StoryRef],
    ) -> MatchResult:
        if not stories:
            return MatchResult(None)
        message, labels = build_match_message(
            headline, _first_sentence(summary), published_at, stories
        )
        try:
            response = self._parse(message)
        except Exception as exc:  # best effort: the title-based cluster stands
            log.warning("story match failed: %s", type(exc).__name__)
            return MatchResult(None)
        usage = response.usage
        choice = response.parsed_output
        cluster_id = resolve_label(choice.story if choice else None, labels)
        if choice and choice.story and cluster_id is None:
            log.info("story match returned an unknown label")
        story = next((s for s in stories if s.cluster_id == cluster_id), None)
        if story is not None and not same_place(
            f"{headline} {summary or ''}", f"{story.headline} {story.summary or ''}"
        ):
            log.info("story match rejected: the two reports name different provinces")
            cluster_id = None
        return MatchResult(cluster_id, usage.input_tokens, usage.output_tokens)
