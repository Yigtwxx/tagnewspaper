"""Tell the Next.js app to refresh its cached snapshot. Never fatal."""

from __future__ import annotations

import logging

import httpx

log = logging.getLogger(__name__)


def trigger(client: httpx.Client, url: str | None, secret: str | None) -> bool:
    if not url or not secret:
        log.info("revalidate skipped (REVALIDATE_URL/SECRET not set)")
        return False
    try:
        response = client.post(
            url, headers={"x-revalidate-secret": secret}, timeout=15.0
        )
    except httpx.HTTPError as exc:
        log.warning("revalidate failed: %s", type(exc).__name__)
        return False
    if response.status_code >= 300:
        log.warning("revalidate returned HTTP %s", response.status_code)
        return False
    log.info("revalidate ok")
    return True
