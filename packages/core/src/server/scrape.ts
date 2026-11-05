import { parse, type HTMLElement } from 'node-html-parser';
import { AppError, isRecord, uniq } from '../utils';
import { safeFetch } from './net';

export interface ScrapedPage {
  url: string;
  canonicalUrl: string | null;
  siteName: string | null;
  title: string | null;
  description: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  /** Absolute image URLs, most likely product shots first. */
  images: string[];
  logos: string[];
  /** #rrggbb candidates, most prominent first. */
  colors: string[];
  themeColor: string | null;
  /** Visible page text for the LLM, capped. */
  text: string;
  source: 'shopify' | 'jsonld' | 'opengraph' | 'html';
}

const TEXT_LIMIT = 12_000;

function abs(src: string | undefined | null, base: string): string | null {
  if (!src) return null;
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('javascript:')) return null;
  try {
    const url = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Largest candidate from a srcset attribute. */
function bestFromSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [url, size] = part.trim().split(/\s+/);
    if (!url) continue;
    const w = size?.endsWith('w') ? Number(size.slice(0, -1)) : size?.endsWith('x') ? Number(size.slice(0, -1)) * 1000 : 1;
    if (!best || w > best.w) best = { url, w: Number.isFinite(w) ? w : 1 };
  }
  return best?.url ?? null;
}

function parseJsonLoose(raw: string): unknown {
  const cleaned = raw
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '')
    .replace(/^\s*\/\/<!\[CDATA\[/, '')
    .replace(/\/\/\]\]>\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Some sites leave raw newlines inside strings.
    try {
      return JSON.parse(cleaned.replace(/[\n\r\t]+/g, ' '));
    } catch {
      return null;
    }
  }
}

function flattenLd(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((n) => flattenLd(n, out));
  else if (isRecord(node)) {
    out.push(node);
    if (node['@graph']) flattenLd(node['@graph'], out);
    if (node.mainEntity) flattenLd(node.mainEntity, out);
    if (node.hasVariant) flattenLd(node.hasVariant, out);
  }
  return out;
}

const hasType = (node: Record<string, unknown>, type: string) => {
  const t = node['@type'];
  return Array.isArray(t) ? t.includes(type) : t === type;
};

const str = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (isRecord(v) && typeof v.name === 'string') return v.name.trim() || null;
  if (isRecord(v) && typeof v['@value'] === 'string') return (v['@value'] as string).trim() || null;
  return null;
};

function ldImages(v: unknown, base: string): string[] {
  if (!v) return [];
  if (typeof v === 'string') return [abs(v, base)].filter((x): x is string => !!x);
  if (Array.isArray(v)) return v.flatMap((i) => ldImages(i, base));
  if (isRecord(v)) return ldImages(v.contentUrl ?? v.url ?? v.thumbnailUrl, base);
  return [];
}

function ldOffer(v: unknown): { price: number | null; currency: string | null } {
  const offers = Array.isArray(v) ? v : v ? [v] : [];
  for (const o of offers) {
    if (!isRecord(o)) continue;
    const spec = Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification;
    const raw = o.price ?? o.lowPrice ?? (isRecord(spec) ? spec.price : undefined);
    const price = raw == null ? NaN : Number(String(raw).replace(/[^\d.]/g, ''));
    const currency = str(o.priceCurrency) ?? (isRecord(spec) ? str(spec.priceCurrency) : null);
    if (Number.isFinite(price)) return { price, currency };
    if (o.offers) return ldOffer(o.offers);
  }
  return { price: null, currency: null };
}

function meta(root: HTMLElement, ...keys: string[]): string | null {
  for (const key of keys) {
    const el = root.querySelector(`meta[property="${key}"]`) ?? root.querySelector(`meta[name="${key}"]`) ?? root.querySelector(`meta[itemprop="${key}"]`);
    const content = el?.getAttribute('content')?.trim();
    if (content) return content;
  }
  return null;
}

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

function normalizeHex(hex: string): string {
  const h = hex.replace('#', '').toLowerCase();
  return `#${h.length === 3 ? h.split('').map((c) => c + c).join('') : h}`;
}

function saturationAndLightness(hex: string): { s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}

/** Brand color candidates from theme meta tags and CSS, skipping greys unless nothing else exists. */
function colorCandidates(root: HTMLElement, themeColor: string | null): string[] {
  const counts = new Map<string, number>();
  const bump = (hex: string, weight: number) => counts.set(hex, (counts.get(hex) ?? 0) + weight);
  if (themeColor && /^#[0-9a-f]{3,6}$/i.test(themeColor)) bump(normalizeHex(themeColor), 50);
  const tile = meta(root, 'msapplication-TileColor');
  if (tile && /^#[0-9a-f]{3,6}$/i.test(tile)) bump(normalizeHex(tile), 25);
  const css = [
    ...root.querySelectorAll('style').map((s) => s.text),
    ...root.querySelectorAll('[style]').map((el) => el.getAttribute('style') ?? ''),
  ].join('\n');
  // Custom properties named like brand/primary/accent carry the strongest signal.
  for (const m of css.matchAll(/--[\w-]*(?:primary|brand|accent|button|highlight|theme|main)[\w-]*\s*:\s*(#[0-9a-f]{3,6})\b/gi)) bump(normalizeHex(m[1]!), 8);
  for (const m of css.matchAll(HEX)) bump(normalizeHex(m[0]), 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const colorful = ranked.filter((hex) => {
    const { s, l } = saturationAndLightness(hex);
    return s > 0.18 && l > 0.08 && l < 0.92;
  });
  const neutrals = ranked.filter((hex) => !colorful.includes(hex));
  return [...colorful.slice(0, 8), ...neutrals.slice(0, 2)];
}

const SKIP_IMAGE = /(sprite|icon|logo|favicon|avatar|badge|payment|visa|mastercard|paypal|klarna|flag|star|rating|spinner|loader|placeholder|pixel|tracking|1x1|blank\.gif|\.svg(\?|$))/i;

function pageImages(root: HTMLElement, base: string): string[] {
  const scored: { url: string; score: number }[] = [];
  root.querySelectorAll('img, source').forEach((el, i) => {
    const raw =
      bestFromSrcset(el.getAttribute('srcset') ?? el.getAttribute('data-srcset')) ??
      el.getAttribute('data-src') ??
      el.getAttribute('data-zoom-image') ??
      el.getAttribute('data-large_image') ??
      el.getAttribute('src');
    const url = abs(raw, base);
    if (!url || SKIP_IMAGE.test(url)) return;
    const width = Number(el.getAttribute('width') ?? 0);
    const height = Number(el.getAttribute('height') ?? 0);
    if ((width && width < 200) || (height && height < 200)) return;
    const context = `${el.getAttribute('alt') ?? ''} ${el.getAttribute('class') ?? ''} ${el.parentNode?.getAttribute?.('class') ?? ''}`.toLowerCase();
    let score = 100 - i;
    if (/product|gallery|media|zoom|main|hero|featured/.test(context) || /product|media|files/.test(url)) score += 100;
    if (width >= 600 || height >= 600) score += 40;
    scored.push({ url, score });
  });
  return uniq(scored.sort((a, b) => b.score - a.score).map((s) => s.url));
}

function logoCandidates(root: HTMLElement, base: string, ld: Record<string, unknown>[]): string[] {
  const out: string[] = [];
  for (const node of ld) if (hasType(node, 'Organization') || hasType(node, 'Brand')) out.push(...ldImages(node.logo, base));
  root.querySelectorAll('img').forEach((img) => {
    const hint = `${img.getAttribute('alt') ?? ''} ${img.getAttribute('class') ?? ''} ${img.getAttribute('id') ?? ''} ${img.getAttribute('src') ?? ''}`.toLowerCase();
    if (hint.includes('logo')) {
      const url = abs(bestFromSrcset(img.getAttribute('srcset')) ?? img.getAttribute('src'), base);
      if (url) out.push(url);
    }
  });
  const icons = root
    .querySelectorAll('link[rel]')
    .filter((l) => /icon/i.test(l.getAttribute('rel') ?? ''))
    .map((l) => ({ url: abs(l.getAttribute('href'), base), size: Number((l.getAttribute('sizes') ?? '').split('x')[0]) || (/apple-touch/i.test(l.getAttribute('rel') ?? '') ? 180 : 32) }))
    .sort((a, b) => b.size - a.size);
  for (const icon of icons) if (icon.url) out.push(icon.url);
  return uniq(out).slice(0, 6);
}

function visibleText(root: HTMLElement): string {
  const clone = parse(root.toString());
  clone.querySelectorAll('script, style, noscript, svg, template, iframe, canvas, nav, footer, form, [aria-hidden="true"]').forEach((el) => el.remove());
  const main = clone.querySelector('main') ?? clone.querySelector('[role="main"]') ?? clone.querySelector('body') ?? clone;
  return main.structuredText
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1)
    .join('\n')
    .slice(0, TEXT_LIMIT);
}

/** Extracts product facts from HTML. Pure, so it can be tested without the network. */
export function extractPage(html: string, pageUrl: string): ScrapedPage {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const canonical = abs(root.querySelector('link[rel="canonical"]')?.getAttribute('href'), pageUrl);
  const base = abs(root.querySelector('base')?.getAttribute('href'), pageUrl) ?? pageUrl;

  const ld = root
    .querySelectorAll('script[type="application/ld+json"]')
    .flatMap((s) => flattenLd(parseJsonLoose(s.rawText)));
  const product = ld.find((n) => hasType(n, 'Product')) ?? ld.find((n) => hasType(n, 'ProductGroup')) ?? null;

  const themeColor = meta(root, 'theme-color');
  const ogImages = [meta(root, 'og:image:secure_url'), meta(root, 'og:image'), meta(root, 'twitter:image'), meta(root, 'twitter:image:src')]
    .map((u) => abs(u, base))
    .filter((u): u is string => !!u);

  const offer = product ? ldOffer(product.offers) : { price: null, currency: null };
  const metaPrice = Number(meta(root, 'product:price:amount', 'og:price:amount', 'price') ?? NaN);
  const price = offer.price ?? (Number.isFinite(metaPrice) ? metaPrice : null);
  const currency = offer.currency ?? meta(root, 'product:price:currency', 'og:price:currency', 'priceCurrency');

  const images = uniq([...(product ? ldImages(product.image, base) : []), ...ogImages, ...pageImages(root, base)]).slice(0, 40);
  const titleTag = root.querySelector('title')?.text.trim() || null;

  return {
    url: pageUrl,
    canonicalUrl: canonical,
    siteName: meta(root, 'og:site_name', 'application-name', 'apple-mobile-web-app-title'),
    title: (product ? str(product.name) : null) ?? meta(root, 'og:title', 'twitter:title') ?? titleTag,
    description: (product ? str(product.description) : null) ?? meta(root, 'og:description', 'description', 'twitter:description'),
    brand: (product ? str(product.brand) ?? str(product.manufacturer) : null) ?? meta(root, 'product:brand', 'og:brand'),
    price,
    currency: currency ? currency.toUpperCase().slice(0, 3) : null,
    images,
    logos: logoCandidates(root, base, ld),
    colors: colorCandidates(root, themeColor),
    themeColor,
    text: visibleText(root),
    source: product ? 'jsonld' : ogImages.length || meta(root, 'og:title') ? 'opengraph' : 'html',
  };
}

interface ShopifyProductJs {
  title?: string;
  description?: string;
  vendor?: string;
  price?: number;
  images?: string[];
  featured_image?: string;
  media?: { src?: string; media_type?: string }[];
}

/** Shopify stores expose clean product JSON at /products/<handle>.js. */
async function shopifyProduct(url: URL): Promise<ShopifyProductJs | null> {
  const handle = url.pathname.match(/\/products\/([^/?#.]+)/)?.[1];
  if (!handle) return null;
  try {
    const res = await safeFetch(new URL(`/products/${handle}.js`, url.origin), { headers: { accept: 'application/json' }, timeoutMs: 10_000, maxBytes: 2 * 1024 ** 2 });
    if (!res.ok || !res.contentType.includes('json')) return null;
    return res.json<ShopifyProductJs>();
  } catch {
    return null;
  }
}

/** Fetches a product page and merges every structured source it offers. */
export async function scrapeProductPage(input: string): Promise<ScrapedPage> {
  const res = await safeFetch(input, { headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' }, timeoutMs: 20_000, maxBytes: 6 * 1024 ** 2 });
  if (!res.ok) throw new AppError('fetch_failed', `The page returned ${res.status}. Check the link is public.`, 422);
  if (!/html|xml/.test(res.contentType) && res.contentType) throw new AppError('not_html', 'That link is not a web page.', 422);
  const page = extractPage(res.text(), res.url);

  const shopify = /cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(res.text()) ? await shopifyProduct(new URL(res.url)) : null;
  if (shopify) {
    const shopImages = [
      ...(shopify.media ?? []).filter((m) => (m.media_type ?? 'image') === 'image').map((m) => m.src),
      ...(shopify.images ?? []),
      shopify.featured_image,
    ]
      .map((u) => abs(u, res.url))
      .filter((u): u is string => !!u);
    page.images = uniq([...shopImages, ...page.images]).slice(0, 40);
    page.title = shopify.title ?? page.title;
    page.brand = shopify.vendor ?? page.brand;
    if (shopify.description) page.description = parse(shopify.description).text.replace(/\s+/g, ' ').trim().slice(0, 4000) || page.description;
    if (typeof shopify.price === 'number' && page.price == null) page.price = shopify.price / 100;
    page.source = 'shopify';
  }
  return page;
}
