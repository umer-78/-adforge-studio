import { clamp, seededRandom } from '@adforge/core';

export { clamp, seededRandom };

/** Smooth noise in [-1, 1] for camera shake and wobble, deterministic per seed. */
export function smoothNoise(seed: number, t: number): number {
  const a = seededRandom(seed) * Math.PI * 2;
  const b = seededRandom(seed + 1.7) * Math.PI * 2;
  const c = seededRandom(seed + 3.1) * Math.PI * 2;
  return Math.sin(t + a) * 0.5 + Math.sin(t * 2.31 + b) * 0.3 + Math.sin(t * 4.67 + c) * 0.2;
}

export const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
export const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback);
export const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Progress 0..1 of `frame` through [start, start + length). */
export function progress(frame: number, start: number, length: number): number {
  if (length <= 0) return frame >= start ? 1 : 0;
  return clamp((frame - start) / length, 0, 1);
}

/** Stable short id for DOM references (SVG filters, masks) from arbitrary strings. */
export function domId(...parts: string[]): string {
  return `af-${parts.join('-').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function hexToRgba(color: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m?.[1]) return color;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp(alpha, 0, 1)})`;
}

/** Parses #rgb, #rrggbb, rgb() and rgba() into 0..1 channels. */
export function parseColor(color: string): [number, number, number, number] {
  const c = color.trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (hex?.[1]) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = Number.parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? Number.parseInt(h.slice(6), 16) / 255 : 1;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (rgb?.[1]) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map((p) => Number.parseFloat(p));
    return [(parts[0] ?? 0) / 255, (parts[1] ?? 0) / 255, (parts[2] ?? 0) / 255, parts[3] ?? 1];
  }
  return [0, 0, 0, 1];
}
