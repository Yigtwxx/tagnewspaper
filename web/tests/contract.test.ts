import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArticleView, NewsPage, Snapshot } from '@/lib/schema';

const fixtures = path.resolve(__dirname, '..', '..', 'shared', 'fixtures');
const load = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(fixtures, name), 'utf-8'));

describe('shared contract fixtures', () => {
  it('parses the snapshot document', () => {
    const snap = Snapshot.parse(load('snapshot.sample.json'));
    expect(snap.latest.length).toBeGreaterThan(0);
    expect(snap.daily_counts).toHaveLength(90);
    expect(snap.category_weekly).toHaveLength(16);
  });

  it('parses a news page response', () => {
    const page = NewsPage.parse(load('news_page.sample.json'));
    expect(page.next_cursor).toMatch(/\|[0-9a-f]{16}$/);
  });

  it('maps a stored article to the public view shape', () => {
    const doc = load('article.sample.json') as Record<string, unknown>;
    const { _id, fetched_at, model, prompt_version, actor_statements, ...rest } = doc;
    void fetched_at;
    void model;
    void prompt_version;
    void actor_statements;
    expect(() => ArticleView.parse({ id: _id, ...rest })).not.toThrow();
  });

  it('rejects unknown categories', () => {
    const snap = load('snapshot.sample.json') as { latest: Array<Record<string, unknown>> };
    const bad = { ...snap.latest[0], category: 'spor' };
    expect(ArticleView.safeParse(bad).success).toBe(false);
  });
});

describe('market contract fixture', () => {
  it('parses the MRT market document', async () => {
    const { Market } = await import('@/lib/schema');
    const market = Market.parse(load('market.sample.json'));
    expect(market.symbol).toBe('MRT');
    expect(market.prices.length).toBeGreaterThan(1);
  });
});
