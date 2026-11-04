# Article pages (`/haber/[slug]`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One indexable page per summarised article, created automatically from the `articles` collection.

**Architecture:** A pure slug module builds and parses `/haber/<slug>-<id>`. Two cached readers in
`lib/data.ts` return one article plus its cluster and the sitemap index. A dynamic route with
`generateStaticParams` renders the page, a per-article OG image and JSON-LD; home links switch to
the internal page for `display == "full"`.

**Tech Stack:** Next.js 16.4 (App Router, `cacheComponents`, `partialPrefetching`), TypeScript strict,
zod 4, MongoDB driver 7, vitest, Tailwind 4.

Spec: `docs/superpowers/specs/2026-11-04-haber-pages-design.md`.

## Global Constraints

- UI copy Turkish, code/comments English; Turkish case via `toLocaleLowerCase('tr-TR')`.
- Pipeline untouched; `guards.py` / `promote.py` untouched; no new LLM calls.
- Every reader uses `'use cache'` + `cacheTag(NEWS_TAG)` + `cacheLife('news')`.
- `revalidateTag` needs two args; never `export const revalidate`.
- Demo fixtures only through the existing `demoEnabled()`.
- Never log raw errors or credentials: log `err.name` only.
- No commits: the user commits.
- Done = `npm run lint && npm run typecheck && npm test && npm run build` clean, plus the curl checks in Task 6.

---

### Task 1: Slug module and `clip`

**Files:**
- Create: `web/lib/slug.ts`
- Modify: `web/lib/format.ts` (append `clip`)
- Test: `web/tests/slug.test.ts`, `web/tests/lib.test.ts`

**Interfaces — Produces:**
- `slugify(title: string): string`
- `articlePath(a: Pick<ArticleViewT, 'id' | 'title'>): string` → `/haber/<slug>-<id>` or `/haber/<id>`
- `parseArticleSlug(param: string): string | undefined` → 16-hex id
- `articleHref(a: Pick<ArticleViewT, 'id' | 'title' | 'url' | 'display'>): { href: string; external: boolean }`
- `ARTICLE_BASE = '/haber/'`
- `clip(text: string, max: number): string`

- [ ] Write `tests/slug.test.ts` (Turkish folding, apostrophes, diacritics, 80-char cap at a `-`, empty
      title, path fallback, parse accept/reject, `articleHref` full vs headline_only, fixture round-trip)
      and a `clip` case in `tests/lib.test.ts`.
- [ ] `npm test` → FAIL (module missing).
- [ ] Implement `lib/slug.ts` and `clip`.
- [ ] `npm test` → PASS.

### Task 2: Data readers

**Files:** Modify `web/lib/data.ts`.

**Interfaces — Produces:**
- `interface ArticlePageData { article: ArticleViewT; related: ArticleViewT[] }`
- `getArticle(id: string): Promise<ArticlePageData | undefined>` — `full` only; related = same
  `cluster_id`, not hidden, not itself, `published_at asc`, ≤ `MAX_RELATED` (12). No DB configured →
  `undefined`; read error or invalid doc → throws (not cached).
- `interface ArticleIndexEntry { id: string; title: string; published_at: string }`
- `getArticleIndex(): Promise<ArticleIndexEntry[]>` — `full`, newest first, ≤ 5,000; error → `[]`.
- Shared `VIEW_PROJECTION` reused by `getNewsPage`.

- [ ] Implement; `npm run typecheck` clean.

### Task 3: Shared link component and home link sites

**Files:**
- Create: `web/components/feed/ArticleLink.tsx`
- Modify: `web/components/feed/NewsBox.tsx` (`StoryLink`, `LeadBox` headline, `LatestBox`),
  `web/components/hero/Ticker.tsx`, `web/components/sections/CaseTimeline.tsx` (news list)

**Interfaces — Produces:** `ArticleLink({ article, className?, tabIndex?, children })` → `next/link`
(`prefetch={false}`) for internal, `<a target="_blank" rel="noopener noreferrer">` for external.

- [ ] Replace the five `href={a.url}` article links; keep publisher-only links (lead source list,
      evidence, stats) unchanged.
- [ ] `npm run lint && npm run typecheck` clean.

### Task 4: Route, body, metadata, JSON-LD, OG image

**Files:**
- Create: `web/app/haber/[slug]/page.tsx`, `web/app/haber/[slug]/opengraph-image.tsx`,
  `web/components/article/ArticleBody.tsx`

- [ ] `page.tsx`: `generateStaticParams` from `snapshot.latest` (`full`), fallback `[{ slug: 'yok' }]`;
      `await params` at the top; parse → `notFound()`; `getArticle` → `notFound()`; slug mismatch →
      `permanentRedirect(canonical)`; `generateMetadata` (title, `clip(summary, 160)`, canonical, OG
      `article` + `publishedTime`, twitter `summary_large_image`).
- [ ] `ArticleBody`: back link, `Kicker`, `h1`, `Byline`, `GenerativeCover`, summary, İDDİA note, actor
      labels (without `diger`), publisher button, source note, related list via `ArticleLink`, JSON-LD
      (`<` escaped).
- [ ] `opengraph-image.tsx`: same fonts as `app/opengraph-image.tsx`; logo, category, headline (size by
      length), source and date; unknown → `notFound()`.
- [ ] `npm run lint && npm run typecheck` clean.

### Task 5: Sitemap, contract, rules

**Files:** Modify `web/app/sitemap.ts`, `shared/CONTRACT.md`, `CLAUDE.md`.

- [ ] Sitemap adds every `getArticleIndex()` entry with `lastModified`.
- [ ] CONTRACT: `/haber/<slug>-<id>` section. CLAUDE.md: one-snapshot rule scoped to the home page.

### Task 6: Verification

- [ ] `npm run lint && npm run typecheck && npm test && npm run build` (and `npm run format:check`).
- [ ] `TAGNEWS_DEMO_DATA=1 npm run build && npm start`, then curl: canonical 200, wrong slug 308 to
      canonical, `headline_only` id (`0000000000000005`) 404, malformed 404, sitemap lists `full`
      fixture articles, `/haber/<slug>/opengraph-image` → `image/png`, home HTML links `/haber/…`.
