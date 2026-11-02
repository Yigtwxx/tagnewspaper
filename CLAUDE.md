# tagnewspaper

Independent Turkish news/case-tracking site for Martı TAG users. Monorepo:

- `pipeline/`: Python 3.12 + uv, package `tagnews`. The **only writer** to MongoDB.
- `web/`: Next.js 16 (App Router, `cacheComponents`), TS strict, Tailwind 4, GSAP/Lenis, d3. Read-only.
- `shared/CONTRACT.md` + `shared/fixtures/`: data contract; both test suites parse the fixtures.

## Rules

- Change the contract first (`shared/`), then Pydantic models and `web/lib/schema.ts`.
- Web reads one `snapshot` doc via `getSnapshot()` (`'use cache'`, tag `news`). Never fetch per section.
- `revalidateTag(tag, profile)` needs two args in Next 16; never `export const revalidate`.
- Read `web/node_modules/next/dist/docs/` before using a Next API you're unsure about.
- Content safety lives in `pipeline/src/tagnews/guards.py` and `promote.py`; do not weaken it.
- Demo fixtures (`TAGNEWS_DEMO_DATA=1`) must never render on Vercel production.
- UI copy Turkish, code/comments English. Turkish case: `toLocaleUpperCase('tr-TR')` / `tr_lower()`.
- Colors: ink `#000`, paper `#fff`, TAG `#01b251` (text on white: `#007a37`). Chart categories use
  the fixed validated order in `web/lib/labels.ts`.

## Commands

```bash
cd web && npm run lint && npm run typecheck && npm test && npm run build
cd pipeline && uv run ruff check && uv run ruff format --check && uv run pytest
```
