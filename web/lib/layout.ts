import type { ArticleViewT } from './schema';

/** Box shapes on the ruled news grid: small, wide (two columns) or tall (two rows). */
export type BoxShape = 'small' | 'wide' | 'tall';

const WIDE_FROM = 330;
const TALL_FROM = 220;
const TALL_TITLE = 55;

/** Long stories get room, short ones stay compact, so no box is cropped or half empty. */
export function boxShape(article: ArticleViewT): BoxShape {
  const summary = article.display === 'full' ? (article.summary?.length ?? 0) : 0;
  if (summary >= WIDE_FROM) return 'wide';
  if (summary >= TALL_FROM && article.title.length >= TALL_TITLE) return 'tall';
  return 'small';
}

export const SHAPE_CLASS: Record<BoxShape, string> = {
  small: '',
  wide: 'sm:col-span-2',
  tall: 'lg:row-span-2',
};
