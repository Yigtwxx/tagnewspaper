"""Turkish-aware text normalization and URL helpers."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_TRACKING_PARAMS = {
    "fbclid",
    "gclid",
    "dclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "ref_src",
    "ocid",
    "cmpid",
    "igshid",
    "spm",
}
_WS_RE = re.compile(r"\s+")
_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)


def tr_lower(text: str) -> str:
    """Lowercase with Turkish rules: I -> ı, İ -> i (Python's lower() breaks both)."""
    return text.replace("I", "ı").replace("İ", "i").lower()


def tr_upper(text: str) -> str:
    return text.replace("i", "İ").replace("ı", "I").upper()


def collapse_ws(text: str) -> str:
    return _WS_RE.sub(" ", text).strip()


def normalize_for_match(text: str) -> str:
    """Lowercase (Turkish), strip punctuation and collapse whitespace."""
    text = unicodedata.normalize("NFC", text)
    return collapse_ws(_NON_WORD_RE.sub(" ", tr_lower(text)))


def words(text: str) -> list[str]:
    return normalize_for_match(text).split()


def strip_source_suffix(title: str, source_name: str | None) -> str:
    """Remove the trailing " - Publisher" that Google News appends to titles."""
    title = collapse_ws(title)
    if source_name:
        for sep in (" - ", " | ", " – "):
            suffix = f"{sep}{source_name}"
            if tr_lower(title).endswith(tr_lower(suffix)):
                return title[: -len(suffix)].rstrip()
    return title


def canonicalize_url(url: str) -> str:
    """Normalize a publisher URL so the same article maps to one key."""
    parts = urlsplit(url.strip())
    scheme = (parts.scheme or "https").lower()
    host = parts.netloc.lower()
    if host.endswith(":443") and scheme == "https":
        host = host[: -len(":443")]
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=False)
        if not key.lower().startswith("utm_") and key.lower() not in _TRACKING_PARAMS
    ]
    query.sort()
    path = parts.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
    return urlunsplit((scheme, host, path, urlencode(query), ""))


# Mobile and AMP mirrors of a site are the same publisher ("m.site.com" == "site.com").
_HOST_PREFIXES = ("www.", "m.", "amp.", "mobile.")


def normalize_host(host: str) -> str:
    host = host.lower().split(":")[0]
    for prefix in _HOST_PREFIXES:
        if host.startswith(prefix) and host.count(".") > 1:
            return host[len(prefix) :]
    return host


def domain_of(url: str) -> str:
    return normalize_host(urlsplit(url).netloc)


def article_id(canonical_url: str) -> str:
    return hashlib.sha1(canonical_url.encode("utf-8")).hexdigest()[:16]


def shingle_fingerprint(text: str, size: int = 8, limit: int = 400) -> list[int]:
    """Hashes of word n-grams; used to tell wire copies apart from independent texts."""
    tokens = words(text)
    if len(tokens) < size:
        return []
    hashes: set[int] = set()
    for start in range(len(tokens) - size + 1):
        gram = " ".join(tokens[start : start + size])
        digest = hashlib.blake2b(gram.encode("utf-8"), digest_size=4).digest()
        hashes.add(int.from_bytes(digest, "big"))
    return sorted(hashes)[:limit]


def jaccard(a: list[int], b: list[int]) -> float:
    if not a or not b:
        return 0.0
    set_a, set_b = set(a), set(b)
    return len(set_a & set_b) / len(set_a | set_b)
