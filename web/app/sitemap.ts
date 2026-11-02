import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl(), changeFrequency: 'hourly', priority: 1 },
    { url: `${siteUrl()}/borsa`, changeFrequency: 'daily', priority: 0.6 },
  ];
}
