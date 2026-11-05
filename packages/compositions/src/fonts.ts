import { useEffect, useRef, useState } from 'react';
import { useDelayRender } from 'remotion';
import {
  CAPTION_STYLES_BY_ID,
  googleFontsHref,
  parseMotionProps,
  textStyleSchema,
  type TimelineData,
} from '@adforge/core';

export interface FontRequest {
  family: string;
  weights: number[];
}

const DISPLAY = 'Unbounded';
const BODY = 'Geist';

/** Fonts each motion template draws with. */
export function motionFonts(templateId: string, props: Record<string, unknown>): FontRequest[] {
  const p = parseMotionProps(templateId, props);
  if (templateId === 'kinetic-title') return [{ family: typeof p.font === 'string' && p.font ? p.font : DISPLAY, weights: [800, 900] }];
  return [
    { family: DISPLAY, weights: [700, 800] },
    { family: BODY, weights: [500, 600, 700] },
  ];
}

export function mergeFonts(requests: readonly FontRequest[]): FontRequest[] {
  const map = new Map<string, Set<number>>();
  for (const r of requests) {
    const set = map.get(r.family) ?? new Set<number>();
    for (const w of r.weights) set.add(w);
    map.set(r.family, set);
  }
  return [...map.entries()].map(([family, weights]) => ({ family, weights: [...weights].sort((a, b) => a - b) }));
}

/** Every font family and weight a timeline needs, so rendering can wait for them. */
export function timelineFonts(tl: TimelineData): FontRequest[] {
  const out: FontRequest[] = [{ family: BODY, weights: [600] }];
  for (const track of tl.tracks)
    for (const clip of track.clips) {
      if (clip.type === 'text') out.push({ family: clip.style.fontFamily, weights: [clip.style.fontWeight] });
      else if (clip.type === 'captions') {
        const def = CAPTION_STYLES_BY_ID[clip.styleId] ?? CAPTION_STYLES_BY_ID.pop!;
        const style = textStyleSchema.parse({ ...def.style, ...captionStyleOverrides(clip.overrides) });
        out.push({ family: style.fontFamily, weights: [style.fontWeight] });
      } else if (clip.type === 'motion') out.push(...motionFonts(clip.templateId, clip.props));
    }
  return mergeFonts(out);
}

const STYLE_KEYS = new Set(Object.keys(textStyleSchema.shape));

/** Caption overrides hold text style keys plus caption-only keys (activeColor, activeWord, animation). */
export function captionStyleOverrides(overrides: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(overrides).filter(([k, v]) => STYLE_KEYS.has(k) && v !== null));
}

const stylesheets = new Map<string, Promise<void>>();

function ensureStylesheet(href: string): Promise<void> {
  const hit = stylesheets.get(href);
  if (hit) return hit;
  const promise = new Promise<void>((resolve) => {
    const existing = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].find((l) => l.href === href);
    if (existing?.sheet) return resolve();
    const link = existing ?? document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.crossOrigin = 'anonymous';
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    if (!existing) document.head.appendChild(link);
  });
  stylesheets.set(href, promise);
  return promise;
}

/** Loads Google Fonts for the requests. Unknown or unreachable fonts fall back to system fonts. */
export async function loadFonts(requests: readonly FontRequest[]): Promise<void> {
  if (typeof document === 'undefined' || !requests.length) return;
  const href = googleFontsHref(requests.map((r) => r.family));
  if (href) await ensureStylesheet(href);
  await Promise.all(
    requests.flatMap((r) => r.weights.map((w) => document.fonts.load(`${w} 64px "${r.family}"`).catch(() => [] as FontFace[]))),
  );
}

const FONT_WAIT_MS = 15_000;

/** Holds the first rendered frame until fonts are ready (or a timeout passes, so a font outage never fails a render). */
export function useFonts(requests: readonly FontRequest[]) {
  const key = requests.map((r) => `${r.family}:${r.weights.join(',')}`).join('|');
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => (key ? delayRender('Loading fonts', { timeoutInMilliseconds: FONT_WAIT_MS + 10_000 }) : null));
  const released = useRef(false);
  useEffect(() => {
    const finish = () => {
      if (released.current) return;
      released.current = true;
      if (handle !== null) continueRender(handle);
    };
    const timer = setTimeout(finish, FONT_WAIT_MS);
    loadFonts(key ? requests : []).finally(() => {
      clearTimeout(timer);
      finish();
    });
    return () => {
      clearTimeout(timer);
      finish();
    };
    // Requests are identified by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
