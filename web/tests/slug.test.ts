import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { Snapshot } from '@/lib/schema';
import { ARTICLE_BASE, articleHref, articlePath, parseArticleSlug, slugify } from '@/lib/slug';

describe('slugify', () => {
  it('folds Turkish letters with Turkish casing', () => {
    expect(slugify('İstinaf Işığında ŞOK: Göç, Ürün, Çağrı')).toBe(
      'istinaf-isiginda-sok-goc-urun-cagri',
    );
  });

  it('drops apostrophes instead of splitting the word', () => {
    expect(slugify("Martı TAG davası 24 Haziran'a ertelendi")).toBe(
      'marti-tag-davasi-24-hazirana-ertelendi',
    );
    expect(slugify('Dalcı’dan çağrı')).toBe('dalcidan-cagri');
  });

  it('strips other diacritics and punctuation', () => {
    expect(slugify('  Kâr “rekor” — %12 artış!  ')).toBe('kar-rekor-12-artis');
  });

  it('caps the length at a word boundary', () => {
    const slug = slugify('kelime '.repeat(30));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.split('-').every((w) => w === 'kelime')).toBe(true);
  });

  it('returns an empty slug when nothing is left', () => {
    expect(slugify('“…”')).toBe('');
  });
});

describe('article paths', () => {
  const article = {
    id: '3f9a1c2b7d4e5f60',
    title: "Martı TAG davası 24 Haziran'a ertelendi",
    url: 'https://example.com/haber',
    display: 'full' as const,
  };

  it('builds /haber/<slug>-<id>', () => {
    expect(articlePath(article)).toBe(
      '/haber/marti-tag-davasi-24-hazirana-ertelendi-3f9a1c2b7d4e5f60',
    );
  });

  it('falls back to the bare id', () => {
    expect(articlePath({ ...article, title: '…' })).toBe('/haber/3f9a1c2b7d4e5f60');
  });

  it('parses the trailing id', () => {
    expect(parseArticleSlug('marti-tag-3f9a1c2b7d4e5f60')).toBe('3f9a1c2b7d4e5f60');
    expect(parseArticleSlug('3f9a1c2b7d4e5f60')).toBe('3f9a1c2b7d4e5f60');
  });

  it('rejects malformed slugs', () => {
    for (const bad of [
      '',
      'yok',
      'marti-tag',
      'x3f9a1c2b7d4e5f60',
      'marti-3F9A1C2B7D4E5F60',
      'marti-3f9a1c2b7d4e5f6',
    ]) {
      expect(parseArticleSlug(bad)).toBeUndefined();
    }
  });

  it('links summarised articles internally and the rest to the publisher', () => {
    expect(articleHref(article)).toEqual({ href: articlePath(article), external: false });
    expect(articleHref({ ...article, display: 'headline_only' })).toEqual({
      href: article.url,
      external: true,
    });
  });

  it('round-trips every fixture article', () => {
    const file = path.resolve(__dirname, '..', '..', 'shared', 'fixtures', 'snapshot.sample.json');
    const snap = Snapshot.parse(JSON.parse(readFileSync(file, 'utf-8')));
    for (const a of snap.latest) {
      const slug = articlePath(a).slice(ARTICLE_BASE.length);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(parseArticleSlug(slug)).toBe(a.id);
    }
  });
});
