import * as z from 'zod';
import { isRecord } from './utils';

/** Link-in-bio pages: one public page of links per handle, with view and click counts. */

export const BIO_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
/** Addresses people could mistake for the site's own pages. */
const RESERVED = new Set(['admin', 'api', 'app', 'help', 'login', 'settings', 'support', 'www', 'adforge', 'official', 'security']);
export const MAX_BIO_LINKS = 50;
export const MAX_BIO_PAGES = 5;

export const bioSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(BIO_SLUG_RE, 'Use 3 to 40 lowercase letters, numbers or dashes, starting and ending with a letter or number.')
  .refine((s) => !RESERVED.has(s), 'That address is reserved. Pick another.');

/** Only plain web links: no javascript:, data: or other schemes. */
export const bioUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((s) => (/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`))
  .refine((s) => {
    try {
      const u = new URL(s);
      return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname && u.hostname.includes('.') && !u.username && !u.password;
    } catch {
      return false;
    }
  }, 'Enter a web address such as https://example.com.');

export const BIO_MODES = ['light', 'dark', 'brand'] as const;
export const BIO_BUTTONS = ['rounded', 'pill', 'square'] as const;

export const bioThemeSchema = z.object({
  mode: z.enum(BIO_MODES).default('light'),
  accent: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#7c3aed'),
  buttons: z.enum(BIO_BUTTONS).default('rounded'),
});
export type BioTheme = z.infer<typeof bioThemeSchema>;

export function parseBioTheme(v: unknown): BioTheme {
  const r = bioThemeSchema.safeParse(isRecord(v) ? v : {});
  return r.success ? r.data : bioThemeSchema.parse({});
}

export const bioLinkInputSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'Give the link a label.').max(80),
  url: bioUrlSchema,
  enabled: z.boolean().default(true),
});

export const bioPageSaveSchema = z.object({
  slug: bioSlugSchema,
  title: z.string().trim().max(80).default(''),
  bio: z.string().trim().max(300).default(''),
  avatarAssetId: z.string().uuid().nullish(),
  theme: bioThemeSchema.default({ mode: 'light', accent: '#7c3aed', buttons: 'rounded' }),
  published: z.boolean().default(false),
  links: z.array(bioLinkInputSchema).max(MAX_BIO_LINKS).default([]),
});
export type BioPageSave = z.infer<typeof bioPageSaveSchema>;

/** Text color that reads on the given background, by WCAG relative luminance. */
export function readableOn(hex: string): '#000000' | '#ffffff' {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contrast against white is (1.05)/(l+0.05); against black (l+0.05)/0.05. Pick the larger.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

/** Crawlers and link previewers; their visits are not counted. */
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|skypeuripreview|vkshare|headless|lighthouse|curl|wget|python-requests|axios|node-fetch|go-http-client/i;
export const isLikelyBot = (userAgent: string | null | undefined) => !userAgent || BOT_RE.test(userAgent);
