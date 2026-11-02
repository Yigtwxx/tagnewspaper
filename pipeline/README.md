# tagnews — ingestion pipeline

Python 3.12 + [uv](https://docs.astral.sh/uv/). Collects Martı TAG news, writes neutral
Turkish summaries with Claude, and publishes everything the site shows to MongoDB as a
single `snapshot` document. The data contract with the web app is
[`shared/CONTRACT.md`](../shared/CONTRACT.md).

## Commands

```bash
cd pipeline
uv sync                                   # install (dev tools included)
cp .env.example .env                      # then fill in the values
uv run python -m tagnews init-db          # indexes + how to create the Atlas users
uv run python -m tagnews seed             # curated court timeline + figures (seed/)
uv run python -m tagnews run --dry-run    # fetch/decode/cluster only: no DB, no LLM
uv run python -m tagnews run              # one real cycle (what CI runs every 15 min)
uv run python -m tagnews market --dry-run # fetch EDGAR (+ prices) and print; no DB
uv run python -m tagnews market [--force] # refresh the `market` doc (once a day)
uv run python -m tagnews hide <id>        # hide one article (correction/removal request)

uv run ruff check && uv run ruff format --check && uv run pytest
```

## Environment

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `ANTHROPIC_MODEL` | default `claude-haiku-5-5` |
| `MONGODB_URI`, `MONGODB_DB` | Atlas `pipeline_rw` user, database `tagnewspaper` |
| `REVALIDATE_URL`, `REVALIDATE_SECRET` | tells Next.js to refresh after each run |
| `FETCH_FULLTEXT` | fetch article pages (robots.txt respected) |
| `GOOGLE_NEWS_BASE_URL` | override only to test the fallback |
| `MAX_ITEMS_PER_RUN`, `MAX_DECODES_PER_RUN` | per-run limits |
| `ALPHAVANTAGE_API_KEY` | optional; daily MRT prices (secret, never logged) |
| `SEC_USER_AGENT` | declared User-Agent for SEC EDGAR; include a contact e-mail |

GitHub Actions secrets: `ANTHROPIC_API_KEY`, `MONGODB_URI`, `REVALIDATE_URL`,
`REVALIDATE_SECRET`, optional `ALPHAVANTAGE_API_KEY` (optional repository variables
`ANTHROPIC_MODEL`, `SEC_USER_AGENT`).

## How a run works

1. **Sources** (`sources/chain.py`): Google News RSS first. On an HTTP error, 403/429, a
   non-feed response or zero results, the same run falls back to 18 publisher RSS feeds
   (keyword-filtered; "martı" alone is a seagull) and the GDELT DOC API. A source that
   fails 3 runs in a row is skipped for 24 h, then retried automatically.
2. **Decode** Google redirect links to publisher URLs, only for GUIDs not yet stored,
   capped and paced; rate limits defer the rest to the next run.
3. **Dedupe + cluster**: canonical URLs, Turkish-aware title similarity within 48 h.
4. **Full text**: only if robots.txt allows; kept in memory, never stored.
5. **PII scrub** (phone, plate, TC kimlik, e-mail) before and after the LLM.
6. **Claude** returns structured JSON: relevance, a 2–3 sentence summary in its own
   words, category, actors, attributed statements, allegation/risk flags, private
   persons, dated events, figures.
7. **Guards** (`guards.py`): no copied run of more than 12 words, allegations must use
   attribution language ("…'ya göre", "iddia etti"), no private person names, no PII,
   length limits. A failure gets one rewrite with feedback; if that fails too, or the
   source text is missing/short, or the model refuses, the item is shown
   **headline-only** (title + source + link). Risky stories are published softened,
   with an İDDİA badge, never stated as fact.
8. **Promote**: a timeline event needs two independently written sources (wire copies
   count once) or one primary source; a new figure needs two independent domains that
   agree within ±2 %.
9. **Snapshot → market → revalidate → run log** (`runs` keeps tokens and cost).
10. **Market** (`market.py`, at most once per Istanbul day): MRT filings from the SEC
    EDGAR submissions API (insider forms 3/4/5/144 skipped) and, with
    `ALPHAVANTAGE_API_KEY`, daily prices merged with the stored ones (newest 260 kept).
    A failing source keeps its previous data (3 failures in a row: rests 24 h, like
    the news sources; `market --force` overrides); a market error never fails the
    news run. It runs before revalidate, so one POST refreshes both pages.

Set `settings.publishing_paused = true` (`_id: "global"`) in Mongo to stop all runs.
