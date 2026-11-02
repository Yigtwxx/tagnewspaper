"""Deterministic checks on generated text. They decide what the site may show.

The user chose "soften and publish": risky stories are published with attribution
language and an İDDİA badge, not hidden. When a summary cannot be made to pass these
checks, the story degrades to `headline_only` (title + source + link, no AI text).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from tagnews.llm import Enrichment
from tagnews.pii import contains_pii, scrub
from tagnews.textnorm import normalize_for_match, tr_lower, words

MIN_SOURCE_CHARS = 600
MAX_VERBATIM_WORDS = 12
SUMMARY_MIN_CHARS = 80
SUMMARY_MAX_CHARS = 600
STATEMENT_MAX_CHARS = 260
MAX_SENTENCES = 4

# Any of these (after Turkish lowercasing) counts as attribution language.
ATTRIBUTION_MARKERS: tuple[str, ...] = (
    "iddia",
    "göre",
    "öne sür",
    "ileri sür",
    "aktar",
    "belirt",
    "açıkla",
    "savun",
    "ifade et",
    "dile getir",
    "bildir",
)

_SENTENCE_END_RE = re.compile(r"[.!?…]+(?:\s|$)")


@dataclass(frozen=True)
class Violation:
    code: str
    message: str  # English, fed back to the model on regeneration


def has_attribution(text: str) -> bool:
    lowered = tr_lower(text)
    return any(marker in lowered for marker in ATTRIBUTION_MARKERS)


def sentence_count(text: str) -> int:
    return len(_SENTENCE_END_RE.findall(text.strip())) or (1 if text.strip() else 0)


def longest_shared_run(candidate: str, source: str) -> int:
    """Length (in words) of the longest word sequence that appears in both texts."""
    cand = words(candidate)
    src = words(source)
    if not cand or not src:
        return 0
    positions: dict[str, list[int]] = {}
    for idx, token in enumerate(src):
        positions.setdefault(token, []).append(idx)
    best = 0
    for i in range(len(cand)):
        for j in positions.get(cand[i], ()):
            length = 0
            while (
                i + length < len(cand)
                and j + length < len(src)
                and cand[i + length] == src[j + length]
            ):
                length += 1
            best = max(best, length)
    return best


def _mentions(text: str, person: str) -> bool:
    norm_text = f" {normalize_for_match(text)} "
    norm_person = normalize_for_match(person)
    if not norm_person:
        return False
    if f" {norm_person} " in norm_text:
        return True
    # A surname alone also identifies the person.
    parts = norm_person.split()
    return len(parts) > 1 and len(parts[-1]) >= 3 and f" {parts[-1]} " in norm_text


def check(enrichment: Enrichment, source_text: str) -> list[Violation]:
    """Check a full-text enrichment. An empty list means it may be published."""
    violations: list[Violation] = []
    summary = enrichment.summary.strip()
    statements = [s.summary for s in enrichment.actor_statements]
    generated = [summary, *statements]

    if not summary:
        violations.append(Violation("empty", "The summary is empty."))
        return violations

    if not SUMMARY_MIN_CHARS <= len(summary) <= SUMMARY_MAX_CHARS:
        violations.append(
            Violation(
                "length",
                f"The summary must be 200-450 characters (it has {len(summary)}).",
            )
        )
    if sentence_count(summary) > MAX_SENTENCES:
        violations.append(Violation("sentences", "Use two or three sentences."))
    for statement in statements:
        if len(statement) > STATEMENT_MAX_CHARS:
            violations.append(
                Violation("statement_length", "Keep each actor statement short.")
            )
            break

    for text in generated:
        if longest_shared_run(text, source_text) > MAX_VERBATIM_WORDS:
            violations.append(
                Violation(
                    "verbatim",
                    "Some wording is copied from the article. Rewrite everything in "
                    "your own words; do not reuse phrases from the source.",
                )
            )
            break

    if (enrichment.is_allegation or enrichment.risk_level != "low") and not (
        has_attribution(summary)
    ):
        violations.append(
            Violation(
                "attribution",
                "The story contains contested claims or accusations. Attribute "
                "them explicitly ('... iddia etti', '... göre', '... öne sürdü').",
            )
        )
    for statement in statements:
        if not has_attribution(statement):
            violations.append(
                Violation(
                    "statement_attribution",
                    "Each actor statement must be attributed ('... açıkladı', "
                    "'... öne sürdü').",
                )
            )
            break

    for person in enrichment.private_persons:
        if any(_mentions(text, person) for text in generated):
            violations.append(
                Violation(
                    "private_person",
                    "Do not name private individuals; describe them generically "
                    "(for example 'bir sürücü', 'bir yolcu').",
                )
            )
            break

    if any(contains_pii(text) for text in generated):
        violations.append(
            Violation(
                "pii",
                "Remove phone numbers, plates, e-mail addresses and ID numbers.",
            )
        )
    return violations


def source_text_usable(text: str | None) -> bool:
    return text is not None and len(text.strip()) >= MIN_SOURCE_CHARS


def final_scrub(text: str) -> str:
    """Belt and braces: scrub PII from anything that will be stored."""
    return scrub(text).text
