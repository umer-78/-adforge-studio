import 'server-only';
import {
  AppError,
  openverseItem,
  pexelsPhoto,
  pexelsVideo,
  pixabayPhoto,
  pixabayVideo,
  publicStockItem,
  STOCK_PROVIDER_INFO,
  STOCK_PROVIDERS,
  type StockDownload,
  type StockKind,
  type StockProvider,
  type StockSearch,
  type StockSearchResult,
} from '@adforge/core';
import { env, features } from '@adforge/core/server';

/**
 * Search and lookups against the free media libraries. Results are cached briefly per server
 * instance to stay inside the free rate limits (Pixabay asks for a day of caching).
 */

const PAGE_SIZE = 20;
const TIMEOUT_MS = 12_000;
const USER_AGENT = 'AdForgeStudio/1.0 (free media search)';

const cache = new Map<string, { at: number; ttl: number; value: unknown }>();
const MAX_CACHE = 400;

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  const value = await load();
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), ttl: ttlMs, value });
  return value;
}

export function enabledProviders(kind?: StockKind): StockProvider[] {
  const on = features().stock;
  return STOCK_PROVIDERS.filter((p) => on[p] && (!kind || STOCK_PROVIDER_INFO[p].kinds.includes(kind)));
}

async function getJson(provider: StockProvider, url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const label = STOCK_PROVIDER_INFO[provider].label;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  } catch {
    throw new AppError('provider_unavailable', `${label} did not answer. Try again in a moment.`, 502);
  }
  if (res.status === 404) throw new AppError('not_found', `${label} no longer has this item.`, 404);
  if (res.status === 429) throw new AppError('rate_limited', `${label} is getting too many searches right now. Try again in a minute.`, 429);
  if (res.status === 401 || res.status === 403) throw new AppError('provider_auth', `The ${label} key was refused. Check it in the server settings.`, 502);
  if (!res.ok) throw new AppError('provider_error', `${label} could not search right now (HTTP ${res.status}).`, 502);
  return res.json();
}

/* --------------------------------- Pexels --------------------------------- */

function pexelsHeaders() {
  return { authorization: env().PEXELS_API_KEY ?? '' };
}

async function pexelsSearch(s: StockSearch): Promise<StockSearchResult> {
  const video = s.kind === 'video';
  const params = new URLSearchParams({ query: s.q, page: String(s.page), per_page: String(PAGE_SIZE) });
  if (s.orientation) params.set('orientation', s.orientation);
  const url = `https://api.pexels.com/v1/${video ? 'videos/search' : 'search'}?${params}`;
  const data = (await getJson('pexels', url, pexelsHeaders())) as { photos?: unknown[]; videos?: unknown[]; total_results?: number; next_page?: string };
  const raw = (video ? data.videos : data.photos) ?? [];
  const items = raw.map((r) => (video ? pexelsVideo(r) : pexelsPhoto(r))).filter((i): i is StockDownload => !!i);
  return { items: items.map(publicStockItem), page: s.page, hasMore: !!data.next_page || (data.total_results ?? 0) > s.page * PAGE_SIZE };
}

async function pexelsGet(kind: StockKind, id: string): Promise<StockDownload | null> {
  const url = kind === 'video' ? `https://api.pexels.com/v1/videos/videos/${id}` : `https://api.pexels.com/v1/photos/${id}`;
  const raw = await getJson('pexels', url, pexelsHeaders());
  return kind === 'video' ? pexelsVideo(raw) : pexelsPhoto(raw);
}

/* --------------------------------- Pixabay -------------------------------- */

function pixabayUrl(kind: StockKind, params: Record<string, string>) {
  const p = new URLSearchParams({ key: env().PIXABAY_API_KEY ?? '', safesearch: 'true', ...params });
  if (kind === 'photo') p.set('image_type', 'photo');
  return `https://pixabay.com/api/${kind === 'video' ? 'videos/' : ''}?${p}`;
}

async function pixabaySearch(s: StockSearch): Promise<StockSearchResult> {
  const params: Record<string, string> = { q: s.q.slice(0, 100), page: String(s.page), per_page: String(PAGE_SIZE) };
  // Pixabay has no square filter, and no orientation filter for videos.
  if (s.kind === 'photo' && (s.orientation === 'landscape' || s.orientation === 'portrait')) params.orientation = s.orientation === 'landscape' ? 'horizontal' : 'vertical';
  const data = (await getJson('pixabay', pixabayUrl(s.kind, params))) as { hits?: unknown[]; totalHits?: number };
  const items = (data.hits ?? []).map((h) => (s.kind === 'video' ? pixabayVideo(h) : pixabayPhoto(h))).filter((i): i is StockDownload => !!i);
  return { items: items.map(publicStockItem), page: s.page, hasMore: (data.totalHits ?? 0) > s.page * PAGE_SIZE };
}

async function pixabayGet(kind: StockKind, id: string): Promise<StockDownload | null> {
  if (!/^\d+$/.test(id)) return null;
  const data = (await getJson('pixabay', pixabayUrl(kind, { id }))) as { hits?: unknown[] };
  const hit = data.hits?.[0];
  return hit ? (kind === 'video' ? pixabayVideo(hit) : pixabayPhoto(hit)) : null;
}

/* -------------------------------- Openverse -------------------------------- */

let token: { value: string; until: number } | null = null;

/** App credentials raise the anonymous rate limit; without them requests go out anonymously. */
async function openverseHeaders(): Promise<Record<string, string>> {
  const { OPENVERSE_CLIENT_ID: id, OPENVERSE_CLIENT_SECRET: secret } = env();
  if (!id || !secret) return {};
  if (token && Date.now() < token.until) return { authorization: `Bearer ${token.value}` };
  try {
    const res = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
      body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return {};
    token = { value: data.access_token, until: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 120) * 1000 };
    return { authorization: `Bearer ${token.value}` };
  } catch {
    return {};
  }
}

const ovPath = (kind: StockKind) => (kind === 'photo' ? 'images' : 'audio');

async function openverseSearch(s: StockSearch): Promise<StockSearchResult> {
  const params = new URLSearchParams({ q: s.q, page: String(s.page), page_size: String(PAGE_SIZE), license: s.credit ? 'cc0,pdm,by' : 'cc0,pdm', mature: 'false' });
  if (s.kind === 'music') params.set('category', 'music');
  if (s.kind === 'sound') params.set('category', 'sound_effect');
  if (s.kind === 'photo' && s.orientation) params.set('aspect_ratio', s.orientation === 'portrait' ? 'tall' : s.orientation === 'landscape' ? 'wide' : 'square');
  const data = (await getJson('openverse', `https://api.openverse.org/v1/${ovPath(s.kind)}/?${params}`, await openverseHeaders())) as { results?: unknown[]; page_count?: number };
  const items = (data.results ?? []).map((r) => openverseItem(r, s.kind)).filter((i): i is StockDownload => !!i);
  return { items: items.map(publicStockItem), page: s.page, hasMore: (data.page_count ?? 0) > s.page };
}

async function openverseGet(kind: StockKind, id: string): Promise<StockDownload | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const raw = await getJson('openverse', `https://api.openverse.org/v1/${ovPath(kind)}/${id}/`, await openverseHeaders());
  return openverseItem(raw, kind);
}

/* --------------------------------- Public --------------------------------- */

export async function searchStock(s: StockSearch, provider: StockProvider): Promise<StockSearchResult> {
  const key = JSON.stringify(['search', provider, s.kind, s.q.toLowerCase(), s.page, s.orientation ?? '', provider === 'openverse' && s.credit]);
  const ttl = provider === 'pixabay' ? 24 * 3600_000 : 10 * 60_000;
  return cached(key, ttl, () => (provider === 'pexels' ? pexelsSearch(s) : provider === 'pixabay' ? pixabaySearch(s) : openverseSearch(s)));
}

/** The item fresh from the provider, with its download address. Never trusts details from the browser. */
export async function getStockItem(provider: StockProvider, kind: StockKind, id: string): Promise<StockDownload | null> {
  if (!STOCK_PROVIDER_INFO[provider].kinds.includes(kind)) return null;
  return provider === 'pexels' ? pexelsGet(kind, id) : provider === 'pixabay' ? pixabayGet(kind, id) : openverseGet(kind, id);
}
