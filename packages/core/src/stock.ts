import * as z from 'zod';
import type { LicenseKind } from './constants';
import { isRecord } from './utils';

/**
 * Free media from open libraries. Only licenses that allow commercial use and changes are offered,
 * so anything imported can go into a paid ad; the few that ask for a credit carry the credit line.
 */

export const STOCK_KINDS = ['photo', 'video', 'music', 'sound'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const STOCK_KIND_LABELS: Record<StockKind, string> = { photo: 'Photos', video: 'Videos', music: 'Music', sound: 'Sound effects' };

export const STOCK_PROVIDERS = ['pexels', 'pixabay', 'openverse'] as const;
export type StockProvider = (typeof STOCK_PROVIDERS)[number];

export interface StockProviderInfo {
  id: StockProvider;
  label: string;
  url: string;
  kinds: readonly StockKind[];
  /** Server setting that turns it on; null when it works without one. */
  keyEnv: string | null;
}

export const STOCK_PROVIDER_INFO: Record<StockProvider, StockProviderInfo> = {
  pexels: { id: 'pexels', label: 'Pexels', url: 'https://www.pexels.com', kinds: ['photo', 'video'], keyEnv: 'PEXELS_API_KEY' },
  pixabay: { id: 'pixabay', label: 'Pixabay', url: 'https://pixabay.com', kinds: ['photo', 'video'], keyEnv: 'PIXABAY_API_KEY' },
  openverse: { id: 'openverse', label: 'Openverse', url: 'https://openverse.org', kinds: ['photo', 'music', 'sound'], keyEnv: null },
};

/** Licenses we import. CC BY-SA, non-commercial and no-derivatives licenses are left out on purpose. */
export const STOCK_LICENSES = {
  cc0: { label: 'CC0', name: 'Public domain (CC0)', credit: false, kind: 'public_domain', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  pdm: { label: 'Public domain', name: 'Public Domain Mark', credit: false, kind: 'public_domain', url: 'https://creativecommons.org/publicdomain/mark/1.0/' },
  by: { label: 'CC BY', name: 'Creative Commons Attribution', credit: true, kind: 'royalty_free', url: 'https://creativecommons.org/licenses/by/4.0/' },
  pexels: { label: 'Pexels', name: 'Pexels License', credit: false, kind: 'royalty_free', url: 'https://www.pexels.com/license/' },
  pixabay: { label: 'Pixabay', name: 'Pixabay Content License', credit: false, kind: 'royalty_free', url: 'https://pixabay.com/service/license-summary/' },
} as const satisfies Record<string, { label: string; name: string; credit: boolean; kind: LicenseKind; url: string }>;
export type StockLicense = keyof typeof STOCK_LICENSES;

export const isStockLicense = (v: unknown): v is StockLicense => typeof v === 'string' && Object.hasOwn(STOCK_LICENSES, v);

/** What the license still asks of you, in one line for the import card. */
export function stockLicenseTerms(license: StockLicense): string {
  if (license === 'cc0' || license === 'pdm') return 'Free for any use, including ads. No credit needed.';
  if (license === 'by') return 'Free for any use, including ads, as long as you credit the creator.';
  return 'Free for ads with no credit needed. Do not resell it unchanged, or suggest that people or brands in it endorse you.';
}

export interface StockItem {
  provider: StockProvider;
  id: string;
  kind: StockKind;
  title: string;
  creator: string | null;
  creatorUrl: string | null;
  /** The item's page on the provider's site. */
  pageUrl: string;
  thumbUrl: string | null;
  /** A small video or audio file for previews. */
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
  license: StockLicense;
  licenseUrl: string;
  /** The credit line the license requires, or null when none is needed. */
  credit: string | null;
  /** Where Openverse found it (flickr, wikimedia, freesound…). */
  source: string | null;
}

/** An item with the file to import, resolved on the server only. */
export interface StockDownload extends StockItem {
  downloadUrl: string;
  /** Expected file extension, when the provider says. */
  ext: string | null;
}

export interface StockSearchResult {
  items: StockItem[];
  page: number;
  hasMore: boolean;
}

export const stockSearchSchema = z.object({
  kind: z.enum(STOCK_KINDS),
  q: z.string().trim().min(1, 'Type what you are looking for.').max(100),
  provider: z.enum(STOCK_PROVIDERS).optional(),
  page: z.coerce.number().int().min(1).max(20).default(1),
  orientation: z.enum(['portrait', 'landscape', 'square']).optional(),
  /** Also show media whose license asks for a credit. */
  credit: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(false),
});
export type StockSearch = z.infer<typeof stockSearchSchema>;

export const stockImportSchema = z.object({
  provider: z.enum(STOCK_PROVIDERS),
  kind: z.enum(STOCK_KINDS),
  id: z.string().trim().min(1).max(120).regex(/^[\w-]+$/, 'Unknown item.'),
  folderId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
});
export type StockImport = z.infer<typeof stockImportSchema>;

/** Kept in asset meta so the Library can show where a file came from. */
export interface StockMeta {
  provider: StockProvider;
  id: string;
  kind: StockKind;
  pageUrl: string;
  creator: string | null;
  creatorUrl: string | null;
  license: StockLicense;
  credit: string | null;
  source: string | null;
  downloadUrl: string;
}

/** A credit line in the usual "title, creator, source, license" order. */
export function creditLine(item: { title: string; creator: string | null; license: StockLicense; source?: string | null; provider: StockProvider }, version?: string | null): string {
  const lic = STOCK_LICENSES[item.license];
  const by = item.creator ? ` by ${item.creator}` : '';
  const via = item.source && item.source !== item.provider ? ` (${item.source})` : '';
  return `“${item.title}”${by}${via}, ${lic.name}${version ? ` ${version}` : ''}`;
}

/** Credit lines for files whose license asks for one, without repeats. */
export function creditsFor(licenses: readonly { attribution: string | null }[]): string[] {
  return [...new Set(licenses.map((l) => l.attribution?.trim()).filter((v): v is string => !!v))];
}

/** Credit lines a file carries in its meta. Renders, edits and clips keep the credits of what they were made from. */
export function carriedCredits(meta: unknown): string[] {
  const list = isRecord(meta) && Array.isArray(meta.credits) ? meta.credits : [];
  return mergeCredits(list.filter((c): c is string => typeof c === 'string'));
}

/** One list of credit lines from several, trimmed, without repeats, capped so meta stays small. */
export function mergeCredits(...lists: readonly (readonly string[] | null | undefined)[]): string[] {
  return creditsFor(lists.flatMap((l) => (l ?? []).map((attribution) => ({ attribution: attribution.slice(0, 2000) })))).slice(0, 100);
}

/** Credit lines not yet written in a caption, so a reminder only asks for what is missing. */
export function missingCredits(credits: readonly string[], text: string): string[] {
  const norm = (v: string) => v.toLowerCase().replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();
  const hay = norm(text);
  return credits.filter((c) => !hay.includes(norm(c)));
}

/** "Credits: …" text for a caption or description. */
export function creditsCaption(credits: readonly string[]): string {
  if (!credits.length) return '';
  return credits.length === 1 ? `Credit: ${credits[0]}` : `Credits:\n${credits.map((c) => `• ${c}`).join('\n')}`;
}

/* ------------------------------ Provider data ------------------------------ */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const extOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const m = /\.([a-z0-9]{2,4})$/i.exec(new URL(url).pathname);
    return m ? m[1]!.toLowerCase() : null;
  } catch {
    return null;
  }
};
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Pexels photo → item. https://www.pexels.com/api/documentation/#photos-overview */
export function pexelsPhoto(raw: unknown): StockDownload | null {
  const p = rec(raw);
  const src = rec(p.src);
  const id = p.id != null ? String(p.id) : null;
  const download = str(src.original) ?? str(src.large2x);
  const page = str(p.url);
  if (!id || !download || !page) return null;
  const title = str(p.alt) ?? 'Pexels photo';
  return {
    provider: 'pexels',
    id,
    kind: 'photo',
    title,
    creator: str(p.photographer),
    creatorUrl: str(p.photographer_url),
    pageUrl: page,
    thumbUrl: str(src.medium) ?? str(src.small) ?? str(src.tiny),
    previewUrl: null,
    width: num(p.width),
    height: num(p.height),
    durationS: null,
    license: 'pexels',
    licenseUrl: STOCK_LICENSES.pexels.url,
    credit: null,
    source: null,
    downloadUrl: download,
    ext: extOf(download),
  };
}

/** The best MP4 for an ad: the largest that is at most 1080 on its short side, else the smallest above it. */
export function pickVideoFile<T extends { width: number | null; height: number | null }>(files: T[]): T | null {
  const sized = files.filter((f) => f.width && f.height);
  if (!sized.length) return files[0] ?? null;
  const short = (f: T) => Math.min(f.width!, f.height!);
  const area = (f: T) => f.width! * f.height!;
  const fits = sized.filter((f) => short(f) <= 1080).sort((a, b) => area(b) - area(a));
  if (fits.length) return fits[0]!;
  return [...sized].sort((a, b) => area(a) - area(b))[0]!;
}

/** Pexels video → item. https://www.pexels.com/api/documentation/#videos-overview */
export function pexelsVideo(raw: unknown): StockDownload | null {
  const v = rec(raw);
  const id = v.id != null ? String(v.id) : null;
  const page = str(v.url);
  const files = arr(v.video_files)
    .map(rec)
    .filter((f) => str(f.link) && (str(f.file_type) ?? 'video/mp4') === 'video/mp4')
    .map((f) => ({ link: str(f.link)!, width: num(f.width), height: num(f.height), quality: str(f.quality) }));
  const best = pickVideoFile(files);
  const small = [...files].filter((f) => f.width && f.height).sort((a, b) => a.width! * a.height! - b.width! * b.height!)[0];
  if (!id || !page || !best) return null;
  const user = rec(v.user);
  // Pexels pages end in a slug of the title: /video/sunrise-over-the-sea-123/.
  const slug = /\/video\/([^/]+?)-\d+\/?$/.exec(page)?.[1];
  return {
    provider: 'pexels',
    id,
    kind: 'video',
    title: slug ? titleCase(slug.replace(/-/g, ' ')) : 'Pexels video',
    creator: str(user.name),
    creatorUrl: str(user.url),
    pageUrl: page,
    thumbUrl: str(v.image),
    previewUrl: small?.link ?? best.link,
    width: best.width ?? num(v.width),
    height: best.height ?? num(v.height),
    durationS: num(v.duration),
    license: 'pexels',
    licenseUrl: STOCK_LICENSES.pexels.url,
    credit: null,
    source: null,
    downloadUrl: best.link,
    ext: 'mp4',
  };
}

const pixabayTitle = (tags: string | null, fallback: string) => (tags ? titleCase(tags.split(',').slice(0, 3).map((t) => t.trim()).filter(Boolean).join(', ')) : fallback);

/** Pixabay image hit → item. https://pixabay.com/api/docs/#api_search_images */
export function pixabayPhoto(raw: unknown): StockDownload | null {
  const h = rec(raw);
  const id = h.id != null ? String(h.id) : null;
  const download = str(h.largeImageURL) ?? str(h.webformatURL);
  const page = str(h.pageURL);
  if (!id || !download || !page) return null;
  const user = str(h.user);
  return {
    provider: 'pixabay',
    id,
    kind: 'photo',
    title: pixabayTitle(str(h.tags), 'Pixabay photo'),
    creator: user,
    creatorUrl: user && h.user_id != null ? `https://pixabay.com/users/${encodeURIComponent(user)}-${String(h.user_id)}/` : null,
    pageUrl: page,
    thumbUrl: str(h.webformatURL) ?? str(h.previewURL),
    previewUrl: null,
    width: num(h.imageWidth),
    height: num(h.imageHeight),
    durationS: null,
    license: 'pixabay',
    licenseUrl: STOCK_LICENSES.pixabay.url,
    credit: null,
    source: null,
    downloadUrl: download,
    ext: extOf(download),
  };
}

/** Pixabay video hit → item. https://pixabay.com/api/docs/#api_search_videos */
export function pixabayVideo(raw: unknown): StockDownload | null {
  const h = rec(raw);
  const id = h.id != null ? String(h.id) : null;
  const page = str(h.pageURL);
  const sizes = rec(h.videos);
  const files = (['large', 'medium', 'small', 'tiny'] as const)
    .map((k) => rec(sizes[k]))
    .filter((f) => str(f.url))
    .map((f) => ({ link: str(f.url)!, width: num(f.width), height: num(f.height), thumb: str(f.thumbnail) }));
  const best = pickVideoFile(files);
  if (!id || !page || !best) return null;
  const user = str(h.user);
  const tiny = files[files.length - 1];
  return {
    provider: 'pixabay',
    id,
    kind: 'video',
    title: pixabayTitle(str(h.tags), 'Pixabay video'),
    creator: user,
    creatorUrl: user && h.user_id != null ? `https://pixabay.com/users/${encodeURIComponent(user)}-${String(h.user_id)}/` : null,
    pageUrl: page,
    thumbUrl: files.find((f) => f.thumb)?.thumb ?? null,
    previewUrl: tiny?.link ?? best.link,
    width: best.width,
    height: best.height,
    durationS: num(h.duration),
    license: 'pixabay',
    licenseUrl: STOCK_LICENSES.pixabay.url,
    credit: null,
    source: null,
    downloadUrl: best.link,
    ext: 'mp4',
  };
}

const OPENVERSE_LICENSES: Record<string, StockLicense> = { cc0: 'cc0', pdm: 'pdm', by: 'by' };

/** Openverse image or audio result → item, or null when its license is not one we import. https://api.openverse.org/v1/ */
export function openverseItem(raw: unknown, kind: StockKind): StockDownload | null {
  const r = rec(raw);
  const id = str(r.id);
  const url = str(r.url);
  const license = OPENVERSE_LICENSES[str(r.license)?.toLowerCase() ?? ''];
  if (!id || !url || !license) return null;
  if (r.mature === true) return null;
  const title = str(r.title) ?? (kind === 'photo' ? 'Untitled image' : 'Untitled sound');
  const creator = str(r.creator);
  const source = str(r.source) ?? str(r.provider);
  const duration = num(r.duration);
  const item: StockDownload = {
    provider: 'openverse',
    id,
    kind,
    title,
    creator,
    creatorUrl: str(r.creator_url),
    pageUrl: str(r.foreign_landing_url) ?? `https://openverse.org/${kind === 'photo' ? 'image' : 'audio'}/${id}`,
    thumbUrl: str(r.thumbnail),
    previewUrl: kind === 'photo' ? null : url,
    width: num(r.width),
    height: num(r.height),
    // Openverse gives audio length in milliseconds.
    durationS: duration ? Math.round(duration / 100) / 10 : null,
    license,
    licenseUrl: str(r.license_url) ?? STOCK_LICENSES[license].url,
    credit: null,
    source,
    downloadUrl: url,
    ext: str(r.filetype)?.toLowerCase() ?? extOf(url),
  };
  if (STOCK_LICENSES[license].credit) item.credit = str(r.attribution) ?? creditLine(item, str(r.license_version));
  return item;
}

/** Drops the server-only fields before an item goes to the browser. */
export function publicStockItem(d: StockDownload): StockItem {
  const { downloadUrl: _url, ext: _ext, ...item } = d;
  return item;
}
