import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { cacheLife, cacheTag } from 'next/cache';

import { decodeCursor, encodeCursor } from './cursor';
import { getDb } from './mongo';
import {
  ArticleView,
  type ArticleViewT,
  type CategoryT,
  EMPTY_SNAPSHOT,
  Market,
  type MarketT,
  type NewsPageT,
  Snapshot,
  type SnapshotT,
} from './schema';

export const NEWS_TAG = 'news';

/**
 * Demo data (fictional fixture) is only allowed outside Vercel production, and only when
 * explicitly requested. Production never renders fabricated articles.
 */
function demoEnabled(): boolean {
  return process.env.TAGNEWS_DEMO_DATA === '1' && process.env.VERCEL_ENV !== 'production';
}

async function readDemoSnapshot(): Promise<SnapshotT> {
  const file = path.join(process.cwd(), '..', 'shared', 'fixtures', 'snapshot.sample.json');
  return Snapshot.parse(JSON.parse(await readFile(file, 'utf-8')));
}

export async function getSnapshot(): Promise<SnapshotT> {
  'use cache';
  cacheTag(NEWS_TAG);
  cacheLife('news');

  if (demoEnabled()) return readDemoSnapshot();

  const db = getDb();
  if (!db) return EMPTY_SNAPSHOT;
  try {
    const doc = await db.collection<{ _id: string }>('snapshot').findOne({ _id: 'current' });
    if (!doc) return EMPTY_SNAPSHOT;
    const parsed = Snapshot.safeParse(doc);
    if (!parsed.success) {
      console.error('[data] snapshot failed validation', parsed.error.issues.slice(0, 5));
      return EMPTY_SNAPSHOT;
    }
    return parsed.data;
  } catch (err) {
    console.error('[data] snapshot read failed', err instanceof Error ? err.name : 'unknown');
    return EMPTY_SNAPSHOT;
  }
}

interface ArticleDoc {
  _id: string;
  url: string;
  title: string;
  source: { name: string; domain: string };
  published_at: Date;
  display: string;
  summary: string | null;
  category: string;
  actors: string[];
  is_allegation: boolean;
  risk_level: string;
  cluster_id: string;
  origin: string;
}

function toView(doc: ArticleDoc): ArticleViewT | undefined {
  const parsed = ArticleView.safeParse({
    id: doc._id,
    url: doc.url,
    title: doc.title,
    source: doc.source,
    published_at: doc.published_at.toISOString(),
    display: doc.display,
    summary: doc.summary,
    category: doc.category,
    actors: doc.actors,
    is_allegation: doc.is_allegation,
    risk_level: doc.risk_level,
    cluster_id: doc.cluster_id,
    origin: doc.origin,
  });
  return parsed.success ? parsed.data : undefined;
}

const isView = (v: ArticleViewT | undefined): v is ArticleViewT => v !== undefined;

/** Stored fields that never leave the database (see ArticleView in shared/CONTRACT.md). */
const VIEW_PROJECTION = {
  fetched_at: 0,
  model: 0,
  prompt_version: 0,
  actor_statements: 0,
  gn_guid: 0,
} as const;

export const MAX_PAGE = 24;

export async function getNewsPage(
  cursor: string | undefined,
  category: CategoryT | undefined,
  limit: number,
): Promise<NewsPageT> {
  'use cache';
  cacheTag(NEWS_TAG);
  cacheLife('news');

  const size = Math.min(Math.max(1, limit), MAX_PAGE);

  if (demoEnabled()) {
    const snap = await readDemoSnapshot();
    const items = snap.latest.filter((a) => !category || a.category === category).slice(0, size);
    return { items, next_cursor: null };
  }

  const db = getDb();
  if (!db) return { items: [], next_cursor: null };

  const filter: Record<string, unknown> = { display: { $ne: 'hidden' } };
  if (category) filter.category = category;
  const pos = cursor ? decodeCursor(cursor) : undefined;
  if (pos) {
    const at = new Date(pos.publishedAt);
    filter.$or = [{ published_at: { $lt: at } }, { published_at: at, _id: { $lt: pos.id } }];
  }

  try {
    const docs = await db
      .collection<ArticleDoc>('articles')
      .find(filter, { projection: VIEW_PROJECTION })
      .sort({ published_at: -1, _id: -1 })
      .limit(size + 1)
      .toArray();

    const views = docs.map(toView).filter(isView);
    const hasMore = views.length > size;
    const items = views.slice(0, size);
    const last = items.at(-1);
    return {
      items,
      next_cursor: hasMore && last ? encodeCursor(last.published_at, last.id) : null,
    };
  } catch (err) {
    console.error('[data] news page read failed', err instanceof Error ? err.name : 'unknown');
    return { items: [], next_cursor: null };
  }
}

export interface ArticlePageData {
  article: ArticleViewT;
  /** Other outlets' reports of the same story, oldest first. */
  related: ArticleViewT[];
}

export const MAX_RELATED = 12;

function relatedFrom(pool: ArticleViewT[], article: ArticleViewT): ArticleViewT[] {
  return pool
    .filter(
      (a) => a.cluster_id === article.cluster_id && a.id !== article.id && a.display !== 'hidden',
    )
    .sort((a, b) => a.published_at.localeCompare(b.published_at))
    .slice(0, MAX_RELATED);
}

/**
 * One summarised article for its own page, plus the rest of its story. `undefined` means there
 * is no such page (a cached 404). A failed read throws instead, so nothing is cached and search
 * engines see a retryable 5xx rather than a 404.
 */
export async function getArticle(id: string): Promise<ArticlePageData | undefined> {
  'use cache';
  cacheTag(NEWS_TAG);
  cacheLife('news');

  if (demoEnabled()) {
    const snap = await readDemoSnapshot();
    const article = snap.latest.find((a) => a.id === id && a.display === 'full');
    return article ? { article, related: relatedFrom(snap.latest, article) } : undefined;
  }

  const db = getDb();
  if (!db) return undefined;

  let docs: { article: ArticleDoc | null; related: ArticleDoc[] };
  try {
    const articles = db.collection<ArticleDoc>('articles');
    const article = await articles.findOne(
      { _id: id, display: 'full' },
      { projection: VIEW_PROJECTION },
    );
    const related = article
      ? await articles
          .find(
            { cluster_id: article.cluster_id, _id: { $ne: id }, display: { $ne: 'hidden' } },
            { projection: VIEW_PROJECTION },
          )
          .sort({ published_at: 1, _id: 1 })
          .limit(MAX_RELATED)
          .toArray()
      : [];
    docs = { article, related };
  } catch (err) {
    console.error('[data] article read failed', err instanceof Error ? err.name : 'unknown');
    throw new Error('article read failed');
  }

  if (!docs.article) return undefined;
  const article = toView(docs.article);
  if (!article) {
    console.error('[data] article failed validation');
    throw new Error('article failed validation');
  }
  return { article, related: docs.related.map(toView).filter(isView) };
}

export interface ArticleIndexEntry {
  id: string;
  title: string;
  published_at: string;
}

export const MAX_SITEMAP_ARTICLES = 5_000;

/** Every summarised article, newest first, for the sitemap. Empty on any failure. */
export async function getArticleIndex(): Promise<ArticleIndexEntry[]> {
  'use cache';
  cacheTag(NEWS_TAG);
  cacheLife('news');

  if (demoEnabled()) {
    const snap = await readDemoSnapshot();
    return snap.latest
      .filter((a) => a.display === 'full')
      .map(({ id, title, published_at }) => ({ id, title, published_at }));
  }

  const db = getDb();
  if (!db) return [];
  try {
    const docs = await db
      .collection<ArticleDoc>('articles')
      .find({ display: 'full' }, { projection: { _id: 1, title: 1, published_at: 1 } })
      .sort({ published_at: -1, _id: -1 })
      .limit(MAX_SITEMAP_ARTICLES)
      .toArray();
    return docs.map((d) => ({
      id: d._id,
      title: d.title,
      published_at: d.published_at.toISOString(),
    }));
  } catch (err) {
    console.error('[data] article index read failed', err instanceof Error ? err.name : 'unknown');
    return [];
  }
}

async function readDemoMarket(): Promise<MarketT | undefined> {
  const file = path.join(process.cwd(), '..', 'shared', 'fixtures', 'market.sample.json');
  try {
    return Market.parse(JSON.parse(await readFile(file, 'utf-8')));
  } catch {
    return undefined;
  }
}

/** The MRT market document written once a day by the pipeline; undefined until it exists. */
export async function getMarket(): Promise<MarketT | undefined> {
  'use cache';
  cacheTag(NEWS_TAG);
  cacheLife('news');

  if (demoEnabled()) return readDemoMarket();

  const db = getDb();
  if (!db) return undefined;
  try {
    const doc = await db.collection<{ _id: string }>('market').findOne({ _id: 'MRT' });
    if (!doc) return undefined;
    const parsed = Market.safeParse(doc);
    if (!parsed.success) {
      console.error('[data] market failed validation', parsed.error.issues.slice(0, 5));
      return undefined;
    }
    return parsed.data;
  } catch (err) {
    console.error('[data] market read failed', err instanceof Error ? err.name : 'unknown');
    return undefined;
  }
}
