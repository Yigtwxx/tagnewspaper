# Article pages (`/haber/[slug]`) design

Date: 2026-11-04. Status: approved (approach A).

## Goal

Give every summarised article (`display == "full"`) its own indexable page so search engines
have more than one URL to rank. Pages appear automatically when the pipeline writes a new
article. No manual step, no pipeline change, no new LLM calls.

Non-goals: pages for `headline_only` or `hidden` articles, Search Console, a custom domain,
per-story (cluster) URLs.

## Decisions

| Topic | Decision |
|---|---|
| Who gets a page | Only `display == "full"`. `headline_only` keeps linking straight to the publisher. |
| Home links | Every article link (feed box, lead, "Diğer başlıklar", ticker, timeline) goes to the internal page when `display == "full"`, otherwise to the publisher. |
| Social image | One generated 1200×630 image per article. |
| Data source | Web reads the `articles` collection directly (like `/api/news`). Pipeline unchanged. |

## URL and slug

- Path: `/haber/<slug>-<id>`. `id` is the 16-hex `articles._id` (stable: sha1 of the URL).
  `slug` comes from the title: `toLocaleLowerCase('tr-TR')`, then `ç→c ğ→g ı→i ö→o ş→s ü→u`
  (plus `â→a î→i û→u`), apostrophes dropped, every other run of non `[a-z0-9]` becomes `-`,
  trimmed, cut to 80 chars at a `-` boundary. Empty slug: the path is `/haber/<id>`.
- Cluster ids are not used in URLs because `recluster` can move articles between stories.
- Parsing takes the trailing `[0-9a-f]{16}`. No match: 404.
- Requested slug differs from the canonical one (hand-typed URL, future slug rule change): the
  same page renders and `rel=canonical` names the real path. No redirect: with partial
  prerendering the shell streams first, and a verified local test showed the cached redirect
  served as a 308 without a `Location` header.
- Unknown id, `headline_only`, `hidden`: 404. The first request streams it with `noindex`
  (status 200, Next's documented behaviour), later requests get the cached 404.

## Units

| Unit | Responsibility |
|---|---|
| `web/lib/slug.ts` (pure, client-safe) | `slugify(title)`, `articlePath(article)`, `parseArticleSlug(param)`, `articleHref(article)` → internal path for `full`, publisher URL otherwise, plus whether it is external. |
| `web/lib/data.ts` | `getArticle(id)`: `'use cache'`, tag `news`, profile `news`. Returns the `full` article and up to 12 other visible articles of the same `cluster_id` (oldest first), or `undefined`. `getArticleIndex()`: id, title, `published_at` of all `full` articles for the sitemap, newest first, capped at 5,000. Both read the fixture in demo mode. |
| `web/app/haber/[slug]/page.tsx` | Awaits `params` at the top. `generateStaticParams` returns the `full` articles of `snapshot.latest`, falling back to one placeholder param that resolves to 404, because Cache Components rejects an empty array (CI builds have no database). `generateMetadata`: title, description (summary cut to 160 chars), canonical, Open Graph `article` with `publishedTime`. |
| `web/app/haber/[slug]/opengraph-image.tsx` | Headline, source, date and logo on the site's black card, same fonts as `app/opengraph-image.tsx`. |
| `web/components/article/*` | Page body: kicker with category and İDDİA badge, `h1`, byline, generative cover, summary, actor labels, "Haberin tamamı: <yayıncı>" external link, "Bu hikâyeyi yazan diğer kaynaklar" list, link back home. `NewsArticle` JSON-LD with `isBasedOn` = publisher URL; the site is the publisher, no author is claimed. |
| `web/app/sitemap.ts` | Home, `/borsa`, plus every `full` article with `lastModified = published_at`. |
| Link sites | `NewsBox`, `LeadBox`, `LatestBox`, `Ticker`, `CaseTimeline` use `articleHref`. Internal links use `next/link` without `target="_blank"`. |

## Data flow and cost

Pipeline run (every 15 min, unchanged) → writes `articles` + `snapshot` → `POST /api/revalidate`
→ `revalidateTag('news', 'max')` → article pages, OG images and the sitemap are served stale
and refreshed on their next request.

- Claude/Anthropic: no new calls. Pages reuse the summary the pipeline already wrote.
- MongoDB: at most one cached read per *visited* article per pipeline run, plus one sitemap
  query per run when the sitemap is fetched. Unvisited pages cost nothing.

## Error handling

- Article not found: cached 404 (expires with the next revalidation).
- Database unreachable or invalid document: `getArticle` throws, so nothing is cached and the
  request gets a 5xx. Search engines retry a 5xx; they drop a 404.
- Sitemap: on a database error it still returns home and `/borsa`.

## Contract and rules

- `shared/CONTRACT.md`: new `/haber/[slug]` section (path rule, `full` only, 308/404).
- Root `CLAUDE.md`: the "one snapshot" rule applies to the home page; article pages read one
  article and its cluster.
- Content safety unchanged: no new AI text, `guards.py` and `promote.py` untouched. Demo
  fixtures stay off on Vercel production through the existing `demoEnabled()` check.

## Testing

- Vitest: Turkish slugify (`ı/İ/ş/ğ/ü/ö/ç`, apostrophes, length cap, empty title),
  parse round-trip for every fixture article, `articleHref` for `full` vs `headline_only`.
- Full check: `npm run lint && npm run typecheck && npm test && npm run build`.
- Local production build and curl: canonical path 200, wrong slug 200 with the canonical link,
  `headline_only` id and malformed slug `noindex` then 404, sitemap lists the `full` articles,
  OG image returns `image/png`.
