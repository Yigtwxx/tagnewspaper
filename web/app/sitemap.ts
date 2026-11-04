import type { MetadataRoute } from 'next';

import { getArticleIndex } from '@/lib/data';
import { siteUrl } from '@/lib/site';
import { articlePath } from '@/lib/slug';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const articles = await getArticleIndex();
  return [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/borsa`, changeFrequency: 'daily', priority: 0.6 },
    ...articles.map((a) => ({
      url: `${base}${articlePath(a)}`,
      lastModified: a.published_at,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
