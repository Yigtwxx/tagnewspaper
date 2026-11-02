"""Polite full-text extraction: robots.txt first, then httpx + trafilatura.

Extracted text is only ever held in memory as LLM input; it is never stored.
"""

from __future__ import annotations

import logging
import time
from typing import Protocol
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx
import trafilatura

from tagnews.config import USER_AGENT_TOKEN

log = logging.getLogger(__name__)

MAX_HTML_BYTES = 3_000_000
MAX_TEXT_CHARS = 20_000
PER_HOST_DELAY_S = 1.0


class Extractor(Protocol):
    def fetch_text(self, url: str) -> str | None: ...


class RobotsCache:
    """Per-host robots.txt verdicts for this run."""

    def __init__(self, client: httpx.Client) -> None:
        self._client = client
        self._parsers: dict[str, RobotFileParser | None] = {}

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        host = f"{parts.scheme}://{parts.netloc}"
        if host not in self._parsers:
            self._parsers[host] = self._load(host)
        parser = self._parsers[host]
        if parser is None:
            return False
        return parser.can_fetch(USER_AGENT_TOKEN, url)

    def _load(self, host: str) -> RobotFileParser | None:
        parser = RobotFileParser()
        try:
            response = self._client.get(
                f"{host}/robots.txt", timeout=10.0, follow_redirects=True
            )
        except httpx.HTTPError:
            return None  # unknown -> be conservative, do not fetch
        if 400 <= response.status_code < 500:
            parser.parse([])  # no robots.txt: everything allowed (RFC 9309)
            return parser
        if response.status_code != 200:
            return None
        parser.parse(response.text.splitlines())
        return parser


class TextExtractor:
    def __init__(self, client: httpx.Client, robots: RobotsCache | None = None) -> None:
        self._client = client
        self._robots = robots or RobotsCache(client)
        self._last_hit: dict[str, float] = {}

    def _pace(self, host: str) -> None:
        last = self._last_hit.get(host)
        if last is not None:
            wait = PER_HOST_DELAY_S - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
        self._last_hit[host] = time.monotonic()

    def fetch_text(self, url: str) -> str | None:
        if "news.google.com" in url:
            return None
        if not self._robots.allowed(url):
            log.info("robots.txt disallows %s", urlsplit(url).netloc)
            return None
        self._pace(urlsplit(url).netloc)
        try:
            response = self._client.get(url, timeout=20.0, follow_redirects=True)
        except httpx.HTTPError as exc:
            log.info(
                "fetch failed for %s: %s", urlsplit(url).netloc, type(exc).__name__
            )
            return None
        content_type = response.headers.get("content-type", "")
        if response.status_code != 200 or "html" not in content_type:
            return None
        if len(response.content) > MAX_HTML_BYTES:
            return None
        text = trafilatura.extract(
            response.text,
            url=url,
            include_comments=False,
            include_tables=False,
            favor_precision=True,
        )
        if not text:
            return None
        return text[:MAX_TEXT_CHARS]
