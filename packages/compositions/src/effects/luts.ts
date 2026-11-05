import type { LutPreset } from '@adforge/core';

type Rgb = [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = ([r, g, b]: Rgb) => r * 0.2126 + g * 0.7152 + b * 0.0722;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function saturate(c: Rgb, amount: number): Rgb {
  const l = luma(c);
  return [mix(l, c[0], amount), mix(l, c[1], amount), mix(l, c[2], amount)];
}

/** Filmic S-curve around mid grey. */
function contrast(c: Rgb, amount: number, pivot = 0.5): Rgb {
  const f = (v: number) => {
    const x = clamp01(v);
    const s = x < pivot ? pivot * (x / pivot) ** amount : 1 - (1 - pivot) * ((1 - x) / (1 - pivot)) ** amount;
    return s;
  };
  return [f(c[0]), f(c[1]), f(c[2])];
}

/** Lifts blacks and lowers whites for a faded print look. */
function fade(c: Rgb, black: number, white = 1): Rgb {
  return [mix(black, white, c[0]), mix(black, white, c[1]), mix(black, white, c[2])];
}

/** Tints shadows and highlights separately, weighted by luminance. */
function splitTone(c: Rgb, shadow: Rgb, highlight: Rgb, amount: number): Rgb {
  const l = luma(c);
  const ws = (1 - smooth(0.05, 0.55, l)) * amount;
  const wh = smooth(0.45, 0.95, l) * amount;
  return [c[0] + (shadow[0] - 0.5) * ws + (highlight[0] - 0.5) * wh, c[1] + (shadow[1] - 0.5) * ws + (highlight[1] - 0.5) * wh, c[2] + (shadow[2] - 0.5) * ws + (highlight[2] - 0.5) * wh];
}

function gain(c: Rgb, r: number, g: number, b: number): Rgb {
  return [c[0] * r, c[1] * g, c[2] * b];
}

const PRESETS: Record<LutPreset, (c: Rgb) => Rgb> = {
  'teal-orange': (c) => {
    let o = splitTone(c, [0.2, 0.55, 0.62], [0.72, 0.52, 0.32], 0.55);
    o = contrast(o, 1.18);
    return saturate(o, 1.12);
  },
  'warm-film': (c) => {
    let o = gain(c, 1.06, 1.0, 0.9);
    o = contrast(o, 1.12);
    o = fade(o, 0.045, 0.97);
    return saturate(o, 0.9);
  },
  'cool-night': (c) => {
    let o = gain(c, 0.84, 0.95, 1.12);
    o = splitTone(o, [0.35, 0.45, 0.7], [0.5, 0.55, 0.6], 0.5);
    o = contrast(o, 1.15);
    o = [o[0] * 0.92, o[1] * 0.92, o[2] * 0.95];
    return saturate(o, 0.78);
  },
  'bleach-bypass': (c) => {
    const l = luma(c);
    let o: Rgb = [mix(c[0], l, 0.55), mix(c[1], l, 0.55), mix(c[2], l, 0.55)];
    o = contrast(o, 1.45);
    return gain(o, 1.0, 1.0, 0.98);
  },
  vintage: (c) => {
    let o = splitTone(c, [0.6, 0.42, 0.58], [0.66, 0.58, 0.4], 0.45);
    o = fade(o, 0.09, 0.93);
    o = contrast(o, 0.95);
    return saturate(o, 0.72);
  },
  noir: (c) => {
    const l = luma(c);
    const o = contrast([l, l, l], 1.6);
    return fade(o, 0.02, 1);
  },
  vivid: (c) => contrast(saturate(c, 1.38), 1.1),
  matte: (c) => {
    const o = fade(contrast(c, 1.05), 0.08, 0.94);
    return saturate(o, 0.92);
  },
  cyberpunk: (c) => {
    let o = splitTone(c, [0.72, 0.3, 0.85], [0.3, 0.85, 0.9], 0.6);
    o = contrast(o, 1.2);
    return saturate(o, 1.25);
  },
  'golden-hour': (c) => {
    let o = gain(c, 1.1, 1.02, 0.84);
    o = splitTone(o, [0.55, 0.45, 0.42], [0.74, 0.6, 0.3], 0.45);
    o = contrast(o, 1.06);
    return saturate(o, 1.08);
  },
};

export const LUT_SIZE = 33;
const cache = new Map<string, Uint8Array>();

/** Preset LUT as RGBA strip pixels: width size², height size, pixel (r + b·size, g). */
export function presetLutStrip(preset: string, size = LUT_SIZE): Uint8Array {
  const key = `${preset}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const fn = PRESETS[preset as LutPreset] ?? PRESETS['teal-orange'];
  const width = size * size;
  const out = new Uint8Array(width * size * 4);
  for (let g = 0; g < size; g++)
    for (let b = 0; b < size; b++)
      for (let r = 0; r < size; r++) {
        const o = fn([r / (size - 1), g / (size - 1), b / (size - 1)]);
        const i = (g * width + b * size + r) * 4;
        out[i] = Math.round(clamp01(o[0]) * 255);
        out[i + 1] = Math.round(clamp01(o[1]) * 255);
        out[i + 2] = Math.round(clamp01(o[2]) * 255);
        out[i + 3] = 255;
      }
  cache.set(key, out);
  return out;
}
