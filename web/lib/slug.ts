import type { ArticleViewT } from './schema';

/**
 * Article page URLs: `/haber/<slug>-<id>`. The id (`articles._id`, 16 hex) is what identifies the
 * page; the slug is only for people and search engines, so a stale or hand-typed slug redirects.
 * Cluster ids are deliberately not used: `recluster` can move an article to another story.
 * Pure and client-safe: the feed renders these links in client components too.
 */

export const ARTICLE_BASE = '/haber/';

const MAX_SLUG = 80;
const TURKISH_FOLD: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};
const ID_AT_END = /(?:^|-)([0-9a-f]{16})$/;

export function slugify(title: string): string {
  const slug = title
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (ch) => TURKISH_FOLD[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= MAX_SLUG) return slug;
  const head = slug.slice(0, MAX_SLUG + 1);
  const cut = head.lastIndexOf('-');
  return (cut > 0 ? head.slice(0, cut) : slug.slice(0, MAX_SLUG)).replace(/-+$/, '');
}

export function articlePath(article: Pick<ArticleViewT, 'id' | 'title'>): string {
  const slug = slugify(article.title);
  return `${ARTICLE_BASE}${slug ? `${slug}-${article.id}` : article.id}`;
}

/** The article id at the end of a `[slug]` route param, or undefined when it has none. */
export function parseArticleSlug(param: string): string | undefined {
  return ID_AT_END.exec(param)?.[1];
}

export interface ArticleHref {
  href: string;
  external: boolean;
}

/** Summarised articles have their own page; everything else links straight to the publisher. */
export function articleHref(
  article: Pick<ArticleViewT, 'id' | 'title' | 'url' | 'display'>,
): ArticleHref {
  return article.display === 'full'
    ? { href: articlePath(article), external: false }
    : { href: article.url, external: true };
}
