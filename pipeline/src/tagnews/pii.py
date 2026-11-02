"""Regex scrubbing of personal data (KVKK): e-mail, TR phone, TC kimlik no, plates.

Applied to article text before it reaches the LLM and to every generated text after.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Mobile (5xx) and landline (2xx-4xx) numbers, optional +90/0 prefix, common separators.
_PHONE_RE = re.compile(
    r"(?<![\d.,])(?:\+90[\s.-]?|0)?\(?[2-5]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?![\d.,])"
)
_TCKN_RE = re.compile(r"(?<!\d)[1-9]\d{10}(?!\d)")
# City code 01-81, 1-3 letters, 2-4 digits (e.g. "34 ABC 123").
_PLATE_RE = re.compile(
    r"(?<![\w])(?:0[1-9]|[1-7]\d|8[01])\s?[A-ZÇĞİÖŞÜ]{1,3}\s?\d{2,4}(?![\w])"
)


@dataclass(frozen=True)
class ScrubResult:
    text: str
    replacements: int


def is_valid_tckn(number: str) -> bool:
    """Checksum test for an 11-digit Turkish national id number."""
    if len(number) != 11 or not number.isdigit() or number[0] == "0":
        return False
    digits = [int(ch) for ch in number]
    odd = sum(digits[0:9:2])
    even = sum(digits[1:8:2])
    if (odd * 7 - even) % 10 != digits[9]:
        return False
    return sum(digits[:10]) % 10 == digits[10]


def scrub(text: str) -> ScrubResult:
    count = 0

    def _sub(pattern: re.Pattern[str], token: str, value: str) -> str:
        nonlocal count
        value, n = pattern.subn(token, value)
        count += n
        return value

    def _tckn(match: re.Match[str]) -> str:
        nonlocal count
        if is_valid_tckn(match.group(0)):
            count += 1
            return "[TCKN]"
        return match.group(0)

    text = _sub(_EMAIL_RE, "[e-posta]", text)
    text = _TCKN_RE.sub(_tckn, text)
    text = _sub(_PHONE_RE, "[telefon]", text)
    text = _sub(_PLATE_RE, "[plaka]", text)
    return ScrubResult(text=text, replacements=count)


def contains_pii(text: str) -> bool:
    return scrub(text).replacements > 0
