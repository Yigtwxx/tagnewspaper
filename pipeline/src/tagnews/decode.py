"""Resolve news.google.com redirect links to publisher URLs.

Only GUIDs that are not in the database yet are decoded (the caller filters them),
in small paced batches, with a hard per-run cap to avoid Google rate limits.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from googlenewsdecoder import GoogleDecoder

log = logging.getLogger(__name__)

BATCH_SIZE = 10
MAX_ATTEMPTS = 2

# Takes a list of Google News URLs, returns googlenewsdecoder-style result dicts.
BatchDecoder = Callable[[list[str]], list[dict[str, object]]]


@dataclass(frozen=True)
class DecodeOutcome:
    decoded: dict[str, str]  # google url -> publisher url
    failed: set[str]  # permanently undecodable (keep the Google URL)
    deferred: set[str]  # not attempted / rate limited (retry next run)


def default_batch_decoder(interval: int = 1, timeout: float = 15.0) -> BatchDecoder:
    def _decode(urls: list[str]) -> list[dict[str, object]]:
        with GoogleDecoder(timeout=timeout) as decoder:
            return decoder.decode_google_news_urls(urls, interval=interval)

    return _decode


def _is_rate_limited(message: str) -> bool:
    lowered = message.lower()
    return "429" in lowered or "too many" in lowered or "rate" in lowered


def decode_urls(
    urls: Sequence[str],
    batch_decoder: BatchDecoder,
    max_decodes: int,
) -> DecodeOutcome:
    decoded: dict[str, str] = {}
    failed: set[str] = set()
    pending = list(dict.fromkeys(urls))
    deferred = set(pending[max_decodes:])
    pending = pending[:max_decodes]

    for start in range(0, len(pending), BATCH_SIZE):
        batch = pending[start : start + BATCH_SIZE]
        results: list[dict[str, object]] | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                results = batch_decoder(batch)
                break
            except Exception as exc:  # network/library errors are not fatal
                log.warning(
                    "decode batch failed (attempt %d): %s", attempt, type(exc).__name__
                )
        if results is None or len(results) != len(batch):
            deferred.update(batch)
            continue
        rate_limited = False
        for url, result in zip(batch, results, strict=True):
            target = result.get("decoded_url")
            if result.get("success") and isinstance(target, str) and target:
                decoded[url] = target
                continue
            message = str(result.get("message", ""))
            if _is_rate_limited(message):
                rate_limited = True
                deferred.add(url)
            else:
                failed.add(url)
        if rate_limited:
            deferred.update(u for u in pending[start + BATCH_SIZE :])
            log.warning("google decode rate limited; deferring the rest of this run")
            break

    log.info(
        "decode: %d ok, %d failed, %d deferred",
        len(decoded),
        len(failed),
        len(deferred),
    )
    return DecodeOutcome(decoded=decoded, failed=failed, deferred=deferred)
