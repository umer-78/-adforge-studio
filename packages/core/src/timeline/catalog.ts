import type { ParamValue, TextAnimationId, TextStyle } from './schema';

export type ParamDef =
  | { key: string; label: string; type: 'number'; min: number; max: number; step: number; default: number; unit?: string }
  | { key: string; label: string; type: 'color'; default: string }
  | { key: string; label: string; type: 'boolean'; default: boolean }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default: string };

/** css: CSS filter; svg: SVG filter; overlay: drawn on top; webgl: per-pixel shader on decoded frames; motion: moves the layer. */
export type EffectEngine = 'css' | 'svg' | 'overlay' | 'webgl' | 'motion';

export interface EffectDef {
  id: string;
  label: string;
  category: 'color' | 'blur' | 'stylize' | 'light' | 'distort' | 'key' | 'camera';
  engine: EffectEngine;
  description: string;
  params: ParamDef[];
  /** Works on adjustment layers (applied to everything below). */
  adjustment?: boolean;
}

const num = (key: string, label: string, min: number, max: number, def: number, step = 0.01, unit?: string): ParamDef => ({
  key,
  label,
  type: 'number',
  min,
  max,
  step,
  default: def,
  ...(unit ? { unit } : {}),
});

export const LUT_PRESETS = [
  { value: 'teal-orange', label: 'Teal & orange' },
  { value: 'warm-film', label: 'Warm film' },
  { value: 'cool-night', label: 'Cool night' },
  { value: 'bleach-bypass', label: 'Bleach bypass' },
  { value: 'vintage', label: 'Vintage fade' },
  { value: 'noir', label: 'Noir' },
  { value: 'vivid', label: 'Vivid pop' },
  { value: 'matte', label: 'Soft matte' },
  { value: 'cyberpunk', label: 'Neon cyber' },
  { value: 'golden-hour', label: 'Golden hour' },
] as const;
export type LutPreset = (typeof LUT_PRESETS)[number]['value'];

export const EFFECTS: EffectDef[] = [
  {
    id: 'adjust',
    label: 'Color adjust',
    category: 'color',
    engine: 'css',
    adjustment: true,
    description: 'Brightness, contrast, saturation and hue.',
    params: [
      num('brightness', 'Brightness', 0, 2, 1),
      num('contrast', 'Contrast', 0, 2, 1),
      num('saturation', 'Saturation', 0, 3, 1),
      num('hue', 'Hue', -180, 180, 0, 1, '°'),
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature & tint',
    category: 'color',
    engine: 'overlay',
    adjustment: true,
    description: 'Warm or cool the image and shift its tint.',
    params: [num('temperature', 'Temperature', -1, 1, 0.2), num('tint', 'Tint', -1, 1, 0)],
  },
  {
    id: 'lut',
    label: 'Color grade (LUT)',
    category: 'color',
    engine: 'webgl',
    description: 'Cinematic look from a 3D lookup table. Import a .cube file to use your own grade.',
    params: [
      { key: 'preset', label: 'Look', type: 'select', options: [...LUT_PRESETS], default: 'teal-orange' },
      { key: 'cubeAssetId', label: 'Custom LUT (imported .cube)', type: 'select', options: [], default: '' },
      num('intensity', 'Intensity', 0, 1, 0.8),
    ],
  },
  {
    id: 'duotone',
    label: 'Duotone',
    category: 'color',
    engine: 'svg',
    description: 'Map shadows and highlights to two colors.',
    params: [
      { key: 'shadows', label: 'Shadows', type: 'color', default: '#1B0B3A' },
      { key: 'highlights', label: 'Highlights', type: 'color', default: '#22D3EE' },
    ],
  },
  { id: 'grayscale', label: 'Black & white', category: 'color', engine: 'css', adjustment: true, description: 'Remove color.', params: [num('amount', 'Amount', 0, 1, 1)] },
  { id: 'sepia', label: 'Sepia', category: 'color', engine: 'css', adjustment: true, description: 'Old photo tone.', params: [num('amount', 'Amount', 0, 1, 0.7)] },
  { id: 'invert', label: 'Invert', category: 'color', engine: 'css', adjustment: true, description: 'Negative image.', params: [num('amount', 'Amount', 0, 1, 1)] },
  { id: 'blur', label: 'Blur', category: 'blur', engine: 'css', adjustment: true, description: 'Gaussian blur.', params: [num('radius', 'Radius', 0, 60, 8, 0.5, 'px')] },
  { id: 'sharpen', label: 'Sharpen', category: 'blur', engine: 'svg', description: 'Crisper edges.', params: [num('amount', 'Amount', 0, 2, 0.6)] },
  {
    id: 'glow',
    label: 'Glow',
    category: 'light',
    engine: 'css',
    description: 'Soft bloom around bright areas.',
    params: [num('radius', 'Radius', 0, 60, 18, 1, 'px'), num('intensity', 'Intensity', 0, 1, 0.6), { key: 'color', label: 'Color', type: 'color', default: '#7C5CFF' }],
  },
  {
    id: 'vignette',
    label: 'Vignette',
    category: 'light',
    engine: 'overlay',
    adjustment: true,
    description: 'Darken the edges.',
    params: [num('strength', 'Strength', 0, 1, 0.5), num('size', 'Size', 0.2, 1, 0.65), { key: 'color', label: 'Color', type: 'color', default: '#000000' }],
  },
  {
    id: 'lightLeak',
    label: 'Light leak',
    category: 'light',
    engine: 'overlay',
    adjustment: true,
    description: 'Drifting film light leak.',
    params: [num('intensity', 'Intensity', 0, 1, 0.5), num('hue', 'Hue', 0, 360, 25, 1, '°'), num('speed', 'Speed', 0, 3, 1)],
  },
  {
    id: 'grain',
    label: 'Film grain',
    category: 'stylize',
    engine: 'overlay',
    adjustment: true,
    description: 'Animated film grain.',
    params: [num('amount', 'Amount', 0, 1, 0.25), num('size', 'Size', 0.5, 3, 1)],
  },
  {
    id: 'chromatic',
    label: 'Chromatic aberration',
    category: 'stylize',
    engine: 'svg',
    description: 'RGB channel split.',
    params: [num('offset', 'Offset', 0, 30, 4, 0.5, 'px')],
  },
  {
    id: 'glitch',
    label: 'Glitch',
    category: 'stylize',
    engine: 'overlay',
    description: 'Digital slicing and color split bursts.',
    params: [num('intensity', 'Intensity', 0, 1, 0.5), num('frequency', 'Frequency', 0, 1, 0.3), num('seed', 'Seed', 0, 999, 7, 1)],
  },
  {
    id: 'vhs',
    label: 'VHS',
    category: 'stylize',
    engine: 'overlay',
    adjustment: true,
    description: 'Scanlines, color bleed and noise.',
    params: [num('intensity', 'Intensity', 0, 1, 0.6)],
  },
  {
    id: 'pixelate',
    label: 'Pixelate',
    category: 'distort',
    engine: 'webgl',
    description: 'Mosaic blocks.',
    params: [num('size', 'Block size', 1, 80, 12, 1, 'px')],
  },
  {
    id: 'letterbox',
    label: 'Letterbox',
    category: 'camera',
    engine: 'overlay',
    adjustment: true,
    description: 'Cinematic bars.',
    params: [num('ratio', 'Ratio', 1.5, 2.76, 2.39, 0.01), { key: 'color', label: 'Color', type: 'color', default: '#000000' }],
  },
  {
    id: 'shake',
    label: 'Camera shake',
    category: 'camera',
    engine: 'motion',
    description: 'Handheld or impact shake.',
    params: [num('intensity', 'Intensity', 0, 1, 0.3), num('speed', 'Speed', 0.2, 4, 1)],
  },
  {
    id: 'zoomPulse',
    label: 'Zoom pulse',
    category: 'camera',
    engine: 'motion',
    description: 'Rhythmic punch-in, great on beats.',
    params: [num('amount', 'Amount', 0, 0.5, 0.08), num('bpm', 'BPM', 40, 200, 120, 1)],
  },
  {
    id: 'chromaKey',
    label: 'Chroma key',
    category: 'key',
    engine: 'webgl',
    description: 'Remove a green or blue screen.',
    params: [
      { key: 'keyColor', label: 'Key color', type: 'color', default: '#00FF00' },
      num('similarity', 'Similarity', 0, 1, 0.4),
      num('smoothness', 'Smoothness', 0, 1, 0.08),
      num('spill', 'Spill', 0, 1, 0.1),
    ],
  },
];

export const EFFECTS_BY_ID: Record<string, EffectDef> = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));

export function defaultEffectParams(type: string): Record<string, ParamValue> {
  const def = EFFECTS_BY_ID[type];
  if (!def) return {};
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

export interface TransitionDef {
  id: string;
  label: string;
  /** Pair transitions animate the outgoing clip too when clips overlap. */
  pair: boolean;
  defaultDuration: number;
  params: ParamDef[];
}

export const TRANSITIONS: TransitionDef[] = [
  { id: 'fade', label: 'Fade', pair: false, defaultDuration: 12, params: [] },
  { id: 'crossfade', label: 'Cross dissolve', pair: true, defaultDuration: 15, params: [] },
  { id: 'dipBlack', label: 'Dip to black', pair: false, defaultDuration: 15, params: [] },
  { id: 'flash', label: 'Flash', pair: false, defaultDuration: 8, params: [{ key: 'color', label: 'Color', type: 'color', default: '#FFFFFF' }] },
  { id: 'slideLeft', label: 'Slide left', pair: false, defaultDuration: 12, params: [] },
  { id: 'slideRight', label: 'Slide right', pair: false, defaultDuration: 12, params: [] },
  { id: 'slideUp', label: 'Slide up', pair: false, defaultDuration: 12, params: [] },
  { id: 'slideDown', label: 'Slide down', pair: false, defaultDuration: 12, params: [] },
  { id: 'pushLeft', label: 'Push left', pair: true, defaultDuration: 14, params: [] },
  { id: 'pushUp', label: 'Push up', pair: true, defaultDuration: 14, params: [] },
  { id: 'wipeLeft', label: 'Wipe left', pair: false, defaultDuration: 14, params: [] },
  { id: 'wipeDown', label: 'Wipe down', pair: false, defaultDuration: 14, params: [] },
  { id: 'iris', label: 'Iris', pair: false, defaultDuration: 16, params: [] },
  { id: 'zoomIn', label: 'Zoom in', pair: true, defaultDuration: 12, params: [] },
  { id: 'zoomOut', label: 'Zoom out', pair: true, defaultDuration: 12, params: [] },
  { id: 'whip', label: 'Whip pan', pair: true, defaultDuration: 10, params: [] },
  { id: 'blur', label: 'Blur', pair: true, defaultDuration: 12, params: [] },
  { id: 'spin', label: 'Spin', pair: true, defaultDuration: 14, params: [] },
  { id: 'glitch', label: 'Glitch', pair: true, defaultDuration: 8, params: [] },
];

export const TRANSITIONS_BY_ID: Record<string, TransitionDef> = Object.fromEntries(TRANSITIONS.map((t) => [t.id, t]));

export const TEXT_ANIMATION_LABELS: Record<TextAnimationId, string> = {
  none: 'None',
  fade: 'Fade',
  slideUp: 'Slide up',
  slideDown: 'Slide down',
  slideLeft: 'Slide left',
  slideRight: 'Slide right',
  pop: 'Pop',
  scaleIn: 'Scale',
  blurIn: 'Blur',
  typewriter: 'Typewriter',
  wordByWord: 'Word by word',
  letterByLetter: 'Letter by letter',
  bounce: 'Bounce',
  glitch: 'Glitch',
  highlight: 'Highlight',
  wave: 'Wave',
  kinetic: 'Kinetic',
};

export interface CaptionStyleDef {
  id: string;
  label: string;
  style: Partial<TextStyle>;
  /** How the active word is shown. */
  activeWord: 'none' | 'color' | 'box' | 'scale' | 'underline';
  activeColor: string;
  animation: 'none' | 'pop' | 'fade' | 'slide';
}

export const CAPTION_STYLES: CaptionStyleDef[] = [
  {
    id: 'pop',
    label: 'Pop',
    style: { fontFamily: 'Unbounded', fontWeight: 800, fontSize: 78, uppercase: true, strokeColor: '#000000', strokeWidth: 10, shadowBlur: 0 },
    activeWord: 'color',
    activeColor: '#FACC15',
    animation: 'pop',
  },
  {
    id: 'karaoke',
    label: 'Karaoke',
    style: { fontFamily: 'Geist', fontWeight: 800, fontSize: 72, color: 'rgba(255,255,255,0.55)', shadowBlur: 16 },
    activeWord: 'color',
    activeColor: '#FFFFFF',
    animation: 'none',
  },
  {
    id: 'boxed',
    label: 'Boxed',
    style: { fontFamily: 'Geist', fontWeight: 700, fontSize: 64, shadowColor: null, shadowBlur: 0 },
    activeWord: 'box',
    activeColor: '#7C5CFF',
    animation: 'fade',
  },
  {
    id: 'neon',
    label: 'Neon',
    style: { fontFamily: 'Unbounded', fontWeight: 700, fontSize: 70, color: '#F0ABFC', shadowColor: '#D946EF', shadowBlur: 28, shadowY: 0 },
    activeWord: 'scale',
    activeColor: '#22D3EE',
    animation: 'pop',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    style: { fontFamily: 'Geist', fontWeight: 600, fontSize: 54, shadowBlur: 10 },
    activeWord: 'none',
    activeColor: '#FFFFFF',
    animation: 'fade',
  },
  {
    id: 'subtitle',
    label: 'Subtitle bar',
    style: { fontFamily: 'Geist', fontWeight: 500, fontSize: 46, backgroundColor: 'rgba(0,0,0,0.72)', shadowColor: null, shadowBlur: 0 },
    activeWord: 'none',
    activeColor: '#FFFFFF',
    animation: 'none',
  },
  {
    id: 'highlighter',
    label: 'Highlighter',
    style: { fontFamily: 'Unbounded', fontWeight: 800, fontSize: 70, color: '#0B0B12', uppercase: true, shadowColor: null, shadowBlur: 0 },
    activeWord: 'underline',
    activeColor: '#A3E635',
    animation: 'slide',
  },
];

export const CAPTION_STYLES_BY_ID: Record<string, CaptionStyleDef> = Object.fromEntries(CAPTION_STYLES.map((c) => [c.id, c]));

export const FONT_FAMILIES = [
  { family: 'Unbounded', category: 'display', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Geist', category: 'sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Anton', category: 'display', weights: [400] },
  { family: 'Bebas Neue', category: 'display', weights: [400] },
  { family: 'Montserrat', category: 'sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Poppins', category: 'sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Inter', category: 'sans', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Archivo Black', category: 'display', weights: [400] },
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'DM Serif Display', category: 'serif', weights: [400] },
  { family: 'Space Grotesk', category: 'sans', weights: [400, 500, 600, 700] },
  { family: 'Permanent Marker', category: 'hand', weights: [400] },
  { family: 'Caveat', category: 'hand', weights: [400, 500, 600, 700] },
  { family: 'JetBrains Mono', category: 'mono', weights: [400, 500, 600, 700, 800] },
] as const;

/** Google Fonts stylesheet for the given families (unknown families are ignored). */
export function googleFontsHref(families: readonly string[]): string | null {
  const wanted = new Set(families);
  const parts = FONT_FAMILIES.filter((f) => wanted.has(f.family)).map(
    (f) => `family=${f.family.replace(/ /g, '+')}:wght@${f.weights.join(';')}`,
  );
  return parts.length ? `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap` : null;
}
