/** The site's public origin: NEXT_PUBLIC_APP_URL, else the Vercel production domain, else local. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/+$/, '');

/** Public pages worth indexing; everything else is the signed-in studio, the API or private links. */
export const PUBLIC_PAGES = ['/', '/privacy', '/terms', '/data-deletion'] as const;

/** When the privacy policy, terms or data deletion page last changed in substance. */
export const LEGAL_UPDATED = new Date('2026-11-06T00:00:00Z');

/** Routes inside the signed-in studio. Everything else (landing, legal, shares, auth) is public. */
export const APP_PREFIXES = [
  '/dashboard',
  '/library',
  '/free-media',
  '/generate',
  '/prompts',
  '/scripts',
  '/voice',
  '/music',
  '/photo',
  '/motion',
  '/editor',
  '/templates',
  '/products',
  '/clone',
  '/variants',
  '/inspiration',
  '/ads',
  '/publish',
  '/agent',
  '/analytics',
  '/settings',
] as const;
