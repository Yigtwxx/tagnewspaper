"""Runtime configuration, read from environment variables (and an optional `.env`).

Secrets are kept out of `repr()` so that logging a `Settings` object never leaks them.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_MODEL = "claude-haiku-5-5"
DEFAULT_GOOGLE_NEWS_BASE_URL = "https://news.google.com/rss/search"
USER_AGENT_TOKEN = "tagnewspaper-bot"
USER_AGENT = f"{USER_AGENT_TOKEN}/0.1 (+https://github.com/Yigtwxx/tagnewspaper)"
# SEC fair-access policy: declare who you are. SEC asks for a contact e-mail too
# ("Company Name admin@example.com"); set SEC_USER_AGENT to include one.
DEFAULT_SEC_USER_AGENT = "tagnewspaper https://github.com/Yigtwxx/tagnewspaper"

# USD per million tokens (input, output) for prompts <= 100K tokens.
MODEL_PRICES_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
}

GOOGLE_NEWS_QUERIES: tuple[str, ...] = (
    '"Martı TAG"',
    '"Martı" taksi TAG',
    '"Martı TAG" dava',
)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _env_str(name: str) -> str | None:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return None
    return raw.strip()


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str | None = field(default=None, repr=False)
    anthropic_model: str = DEFAULT_MODEL
    mongodb_uri: str | None = field(default=None, repr=False)
    mongodb_db: str = "tagnewspaper"
    revalidate_url: str | None = None
    revalidate_secret: str | None = field(default=None, repr=False)
    fetch_fulltext: bool = True
    google_news_base_url: str = DEFAULT_GOOGLE_NEWS_BASE_URL
    google_news_queries: tuple[str, ...] = GOOGLE_NEWS_QUERIES
    max_items_per_run: int = 25
    max_decodes_per_run: int = 40
    log_level: str = "INFO"
    user_agent: str = USER_AGENT
    alphavantage_api_key: str | None = field(default=None, repr=False)
    sec_user_agent: str = DEFAULT_SEC_USER_AGENT


def load_settings(env_file: Path | None = None) -> Settings:
    """Load settings from the process environment, optionally seeded by a `.env` file.

    Existing environment variables win over `.env` values (CI secrets take precedence).
    """
    load_dotenv(dotenv_path=env_file, override=False)
    return Settings(
        anthropic_api_key=_env_str("ANTHROPIC_API_KEY"),
        anthropic_model=_env_str("ANTHROPIC_MODEL") or DEFAULT_MODEL,
        mongodb_uri=_env_str("MONGODB_URI"),
        mongodb_db=_env_str("MONGODB_DB") or "tagnewspaper",
        revalidate_url=_env_str("REVALIDATE_URL"),
        revalidate_secret=_env_str("REVALIDATE_SECRET"),
        fetch_fulltext=_env_bool("FETCH_FULLTEXT", True),
        google_news_base_url=_env_str("GOOGLE_NEWS_BASE_URL")
        or DEFAULT_GOOGLE_NEWS_BASE_URL,
        max_items_per_run=_env_int("MAX_ITEMS_PER_RUN", 25),
        max_decodes_per_run=_env_int("MAX_DECODES_PER_RUN", 40),
        log_level=(_env_str("LOG_LEVEL") or "INFO").upper(),
        alphavantage_api_key=_env_str("ALPHAVANTAGE_API_KEY"),
        sec_user_agent=_env_str("SEC_USER_AGENT") or DEFAULT_SEC_USER_AGENT,
    )


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # Third-party HTTP loggers can echo full request URLs/headers at DEBUG.
    for noisy in ("httpx", "httpcore", "httpx2", "anthropic", "pymongo"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def estimate_cost_usd(
    model: str, input_tokens: int, output_tokens: int
) -> float | None:
    prices = MODEL_PRICES_PER_MTOK.get(model)
    if prices is None:
        return None
    price_in, price_out = prices
    return round(input_tokens * price_in / 1e6 + output_tokens * price_out / 1e6, 6)
