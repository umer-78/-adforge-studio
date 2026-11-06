import type { MetadataRoute } from 'next';
import { APP_PREFIXES, SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The studio needs a sign-in, share links are private, and the API is not for crawlers.
        disallow: ['/api/', '/auth/', '/s/', '/invite/', '/login', '/reset-password', ...APP_PREFIXES],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
