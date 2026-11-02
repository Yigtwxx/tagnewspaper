# Data contract (pipeline ⇄ web)

The Python pipeline is the **only writer**. The Next.js app is a **read-only** consumer
(`web_ro` Mongo user). Both sides validate the JSON fixtures in `shared/fixtures/` in their
test suites (Pydantic in `pipeline/tests`, zod in `web/tests`). Change a field here first,
then update both models.

Database: `tagnewspaper` (MongoDB Atlas). All `_id` values are **strings** (no ObjectId).
Datetimes are stored as BSON `Date` (UTC) in collections and as ISO-8601 UTC strings
(`2026-11-01T19:28:00Z`) inside the `snapshot` document. Calendar dates are `YYYY-MM-DD`
in the `Europe/Istanbul` timezone.

## Enums

| Name | Values |
|---|---|
| `Category` | `dava`, `regulasyon`, `taksici_odasi`, `sirket`, `surucu_yolcu`, `saha`, `ekonomi`, `diger` |
| `Actor` | `marti`, `taksici_odasi`, `ibb_ukome`, `bakanlik`, `mahkeme`, `surucu`, `yolcu`, `diger` |
| `Display` | `full` (AI summary shown), `headline_only` (title + source + link only), `hidden` |
| `RiskLevel` | `low`, `medium`, `high` |
| `Origin` | `google_news`, `publisher_rss`, `gdelt` |
| `EventType` | `court_decision`, `filing`, `regulation`, `statement`, `other` |
| `StatKey` | `registered_riders`, `drivers`, `drivers_istanbul` |

## `articles` collection

| Field | Type | Notes |
|---|---|---|
| `_id` | string | first 16 hex chars of `sha1(canonical_url)` |
| `url` | string | canonical publisher URL (unique index); Google URL if undecodable |
| `title` | string | publisher suffix (" - T24") stripped |
| `source` | `{name, domain}` | domain from RSS `<source url>` |
| `published_at` | Date | UTC |
| `fetched_at` | Date | UTC |
| `display` | Display | web never shows `hidden` |
| `summary` | string \| null | 2–3 Turkish sentences; null unless `display == "full"` |
| `category` | Category | |
| `actors` | Actor[] | |
| `actor_statements` | `{actor, summary}`[] | attributed paraphrases, may be empty |
| `is_allegation` | bool | web shows an `İDDİA` badge |
| `risk_level` | RiskLevel | |
| `cluster_id` | string | same story across outlets |
| `origin` | Origin | |
| `model` | string \| null | LLM model id |
| `prompt_version` | string \| null | |

Indexes: `url` unique, `(display, published_at desc, _id desc)`, `cluster_id`, `gn_guid` sparse.
Full article text is **never** stored.

## `events`, `stats`, `runs`, `source_health`, `settings`

- `events`: `_id`, `date` (YYYY-MM-DD), `type`, `title`, `description`, `court` (string|null),
  `evidence` `[{url, source_name, domain}]`, `published` (bool), `is_seed` (bool).
- `stats`: `_id` = `key`, `label`, `value` (int), `as_of` (YYYY-MM-DD), `scope`, `source_name`, `source_url`.
- `runs`: `_id`, `started_at`, `finished_at`, `ok`, `origin_used`, `counts{fetched,new,summarized,headline_only,hidden,irrelevant}`, `errors[]`, `tokens{input,output}`, `cost_usd`.
- `source_health`: `_id` = source name, `consecutive_failures`, `skip_until` (Date|null), `last_error`.
- `settings`: `_id: "global"`, `publishing_paused` (bool).

## `snapshot` collection — single document `_id: "current"`

Everything the home page renders, precomputed by the pipeline. See
`fixtures/snapshot.sample.json` for a full example.

| Field | Type |
|---|---|
| `generated_at`, `last_run_at` | ISO string |
| `lead` | `{article: ArticleView, sources: [{name, domain, url}]}` \| null |
| `latest` | ArticleView[] (≤ 24, newest first, `display != hidden`) |
| `events` | Event[] (published only, date ascending) |
| `stats` | Stat[] |
| `daily_counts` | `[{date, count}]` — last 90 days, zero-filled |
| `source_counts` | `[{name, domain, count}]` — last 90 days, top 30 |
| `category_weekly` | `[{week_start, counts: {<Category>: int}}]` — last 16 ISO weeks, all categories present |
| `actor_statements` | `[{actor, summary, date, article_id, source_name, url}]` — ≤ 3 per actor, newest first |
| `totals` | `{articles_90d, sources_90d}` |
| `category_daily` | `[{date, counts: {<Category>: int}}]` — last 60 days, zero-filled, all categories present (may be empty in older documents) |
| `top_terms` | `[{term, count}]` — up to 12 title words of the last 30 days, ≥ 2 articles each, stopwords removed (may be empty) |

`ArticleView` = article without `fetched_at`, `model`, `prompt_version`, `actor_statements`,
with `_id` renamed to `id` and `published_at` as ISO string.

## `market` collection — single document `_id: "MRT"`

Martı Technologies on NYSE American (`MRT`, SEC CIK 1852767), read by the `/borsa` page.
Refreshed by the pipeline at most once per Istanbul calendar day. Like `snapshot`,
datetimes inside are ISO strings. See `fixtures/market.sample.json`.

| Field | Type | Notes |
|---|---|---|
| `_id`, `symbol` | `"MRT"` | |
| `exchange` | string | `"NYSE American"` |
| `currency` | string | `"USD"` |
| `updated_at` | ISO string | last refresh in which at least one source succeeded |
| `price_source` | `"Alpha Vantage"` \| null | null when `prices` is empty |
| `prices` | `[{date, open, high, low, close, volume}]` | daily bars, date ascending, unique, ≤ 260, may be empty |
| `filings` | `[{form, filed, title, url}]` | SEC EDGAR, newest first, ≤ 15 |

- `prices[].date` is the **US trading day** and `filings[].filed` the **SEC filing date**
  (both `YYYY-MM-DD`, US Eastern), not Istanbul dates. Prices are floats > 0, `volume` an
  int ≥ 0.
- `filings[].form` is the EDGAR form type (`6-K`, `20-F`, `SC 13G`, `SCHEDULE 13G/A`, …);
  `title` is the filing's own description when it is informative, otherwise a Turkish label
  (`"6-K: Dönemsel rapor"`); `url` always starts with `https://www.sec.gov/Archives/`.
- One source failing never empties the other's data: the previous `prices` or `filings`
  are kept, so either list can be older than `updated_at`.

## `/api/news` (web, read-only)

`GET /api/news?cursor=<published_at ISO>|<id>&category=<Category>&limit=<1..24>`
→ `{items: ArticleView[], next_cursor: string | null}` sorted `published_at desc, _id desc`.

## `/api/revalidate` (web)

`POST` with header `x-revalidate-secret: <REVALIDATE_SECRET>` → `revalidateTag("news", "max")`.
