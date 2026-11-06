import type { MetadataRoute } from 'next';
import { LEGAL_UPDATED, PUBLIC_PAGES, SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) =>
    path === '/' ? { url: SITE_URL, changeFrequency: 'weekly', priority: 1 } : { url: `${SITE_URL}${path}`, lastModified: LEGAL_UPDATED, changeFrequency: 'yearly', priority: 0.3 },
  );
}
