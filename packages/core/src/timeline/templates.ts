import { ASPECT_SIZES, type AspectRatio } from '../constants';
import { motionDefaults } from '../motion-templates';
import { uid } from '../utils';
import { makeTransition } from './ops';
import { clipSchema, timelineDataSchema, type Clip, type ClipDraft, type TextStyle, type TimelineData, type TrackKind } from './schema';

export interface BrandStyle {
  primary: string;
  accent: string;
  ink: string;
  paper: string;
  displayFont: string;
  bodyFont: string;
}

export const DEFAULT_BRAND: BrandStyle = {
  primary: '#7C5CFF',
  accent: '#22D3EE',
  ink: '#0B0B12',
  paper: '#F5F5FA',
  displayFont: 'Unbounded',
  bodyFont: 'Geist',
};

export interface TimelineTemplateDef {
  id: string;
  name: string;
  category: 'ugc' | 'product' | 'promo' | 'story' | 'social-proof';
  description: string;
  durationS: number;
  build: (ctx: { aspect: AspectRatio; brand: BrandStyle; fps: number }) => TimelineData;
}

type Layer = { kind: TrackKind; name: string; clips: ClipDraft[] };

function timeline(aspect: AspectRatio, fps: number, layers: Layer[], background = '#000000'): TimelineData {
  const size = ASPECT_SIZES[aspect];
  return timelineDataSchema.parse({
    fps,
    width: size.width,
    height: size.height,
    background,
    tracks: layers.map((l) => ({
      id: uid('trk_'),
      kind: l.kind,
      name: l.name,
      clips: l.clips.map((c) => clipSchema.parse({ id: uid('clp_'), ...c }) as Clip),
    })),
  });
}

const s = (seconds: number, fps: number) => Math.round(seconds * fps);

function text(
  fps: number,
  at: number,
  len: number,
  value: string,
  style: Partial<TextStyle>,
  extra: Partial<{ y: number; x: number; width: number; key: string; label: string; in: string; out: string }> = {},
): ClipDraft {
  return {
    type: 'text',
    start: s(at, fps),
    duration: s(len, fps),
    text: value,
    style,
    transform: { y: extra.y ?? 0, x: extra.x ?? 0, width: extra.width ?? 0.86 },
    animation: { in: (extra.in ?? 'pop') as never, out: (extra.out ?? 'fade') as never },
    ...(extra.key ? { placeholder: { key: extra.key, label: extra.label ?? extra.key, kind: 'text' as const } } : {}),
  };
}

function media(
  fps: number,
  at: number,
  len: number,
  key: string,
  label: string,
  prompt: string,
  extra: Partial<{ type: 'video' | 'image'; kenBurns: boolean; transitionIn: string; y: number; scale: number }> = {},
): ClipDraft {
  const duration = s(len, fps);
  return {
    type: extra.type ?? 'video',
    assetId: null,
    start: s(at, fps),
    duration,
    placeholder: { key, label, kind: 'media', prompt },
    transform: { y: extra.y ?? 0, scale: extra.scale ?? 1 },
    ...(extra.kenBurns
      ? { keyframes: { scale: [{ frame: 0, value: extra.scale ?? 1, easing: 'linear' as const }, { frame: duration, value: (extra.scale ?? 1) * 1.12, easing: 'linear' as const }] } }
      : {}),
    ...(extra.transitionIn ? { transitionIn: makeTransition(extra.transitionIn) } : {}),
  };
}

function motion(fps: number, at: number, len: number, templateId: string, props: Record<string, unknown>, transform: Record<string, number> = {}): ClipDraft {
  return {
    type: 'motion',
    start: s(at, fps),
    duration: s(len, fps),
    templateId,
    props: { ...motionDefaults(templateId), ...props },
    transform: { width: 1, height: 1, ...transform },
  };
}

const headline = (b: BrandStyle): Partial<TextStyle> => ({
  fontFamily: b.displayFont,
  fontWeight: 800,
  fontSize: 84,
  uppercase: true,
  strokeColor: '#000000',
  strokeWidth: 8,
  shadowBlur: 0,
});

const body = (b: BrandStyle): Partial<TextStyle> => ({ fontFamily: b.bodyFont, fontWeight: 700, fontSize: 56 });

export const TIMELINE_TEMPLATES: TimelineTemplateDef[] = [
  {
    id: 'ugc-testimonial',
    name: 'UGC testimonial',
    category: 'ugc',
    description: 'Real creator footage with a scroll-stopping hook, product B-roll, stars and a CTA end card.',
    durationS: 18,
    build: ({ aspect, brand, fps }) =>
      timeline(aspect, fps, [
        { kind: 'text', name: 'Captions', clips: [] },
        {
          kind: 'overlay',
          name: 'Graphics',
          clips: [
            motion(fps, 0, 3, 'ugc-hook', { text: 'I didn’t expect this to work…', emoji: '😳' }),
            motion(fps, 9, 3.5, 'rating-stars', { color: brand.accent }, { y: 0.28 }),
            motion(fps, 14.5, 3.5, 'cta-button', { color: brand.primary }, { y: 0.22 }),
          ],
        },
        {
          kind: 'video',
          name: 'B-roll',
          clips: [media(fps, 6, 3, 'broll_1', 'Product close-up B-roll', 'Slow cinematic close-up of the product on a clean surface, soft daylight', { transitionIn: 'zoomIn' })],
        },
        { kind: 'video', name: 'Creator', clips: [media(fps, 0, 18, 'creator', 'Creator talking to camera', 'Creator speaking to camera, handheld selfie framing, natural light')] },
        { kind: 'audio', name: 'Voice', clips: [] },
        { kind: 'audio', name: 'Music', clips: [] },
      ]),
  },
  {
    id: 'product-showcase',
    name: 'Product showcase',
    category: 'product',
    description: 'Hero product shots with kinetic headline, benefit list, price drop and CTA.',
    durationS: 15,
    build: ({ aspect, brand, fps }) =>
      timeline(
        aspect,
        fps,
        [
          {
            kind: 'text',
            name: 'Text',
            clips: [text(fps, 0.3, 2.7, 'MEET YOUR NEW FAVORITE', headline(brand), { y: -0.3, key: 'headline', label: 'Headline' })],
          },
          {
            kind: 'overlay',
            name: 'Graphics',
            clips: [
              motion(fps, 6, 4, 'bullet-list', { accent: brand.accent }),
              motion(fps, 10, 2.5, 'price-tag', { accent: brand.primary }, { y: 0.2 }),
              motion(fps, 12.5, 2.5, 'cta-button', { color: brand.primary }, { y: 0.25 }),
            ],
          },
          {
            kind: 'video',
            name: 'Product',
            clips: [
              media(fps, 0, 3, 'hero', 'Hero product shot', 'Hero shot of the product rotating slowly on a pedestal, studio lighting', { type: 'image', kenBurns: true }),
              media(fps, 3, 3, 'detail', 'Detail shot', 'Macro detail shot of the product texture, shallow depth of field', { kenBurns: true, transitionIn: 'whip' }),
              media(fps, 6, 4, 'lifestyle', 'Lifestyle shot', 'Person using the product in a bright modern home, candid', { transitionIn: 'crossfade' }),
              media(fps, 10, 5, 'packshot', 'Packshot', 'Clean packshot of the product on brand-colored background', { type: 'image', kenBurns: true, transitionIn: 'zoomOut' }),
            ],
          },
          { kind: 'audio', name: 'Voice', clips: [] },
          { kind: 'audio', name: 'Music', clips: [] },
        ],
        brand.ink,
      ),
  },
  {
    id: 'problem-solution',
    name: 'Problem → solution',
    category: 'story',
    description: 'Name the pain, twist the knife, reveal the fix, close with an offer.',
    durationS: 16,
    build: ({ aspect, brand, fps }) =>
      timeline(aspect, fps, [
        {
          kind: 'text',
          name: 'Text',
          clips: [
            text(fps, 0, 3.5, 'TIRED OF THIS?', headline(brand), { y: -0.28, key: 'problem', label: 'Problem line' }),
            text(fps, 3.5, 3.5, 'It wastes hours every week', body(brand), { y: 0.3, key: 'agitate', label: 'Agitate line', in: 'wordByWord' }),
            text(fps, 7, 5, 'THERE’S A BETTER WAY', { ...headline(brand), color: brand.accent }, { y: -0.3, key: 'solution', label: 'Solution line', in: 'kinetic' }),
          ],
        },
        { kind: 'overlay', name: 'Graphics', clips: [motion(fps, 12, 4, 'cta-button', { color: brand.primary }, { y: 0.2 })] },
        {
          kind: 'video',
          name: 'Footage',
          clips: [
            media(fps, 0, 3.5, 'problem', 'Problem footage', 'Frustrated person dealing with the everyday problem, muted colors, handheld'),
            media(fps, 3.5, 3.5, 'agitate', 'Agitate footage', 'Close-up of the frustrating moment, dramatic lighting', { transitionIn: 'glitch' }),
            media(fps, 7, 9, 'solution', 'Product in use', 'The product solving the problem effortlessly, bright and vibrant', { transitionIn: 'flash' }),
          ],
        },
        { kind: 'audio', name: 'Voice', clips: [] },
        { kind: 'audio', name: 'Music', clips: [] },
      ]),
  },
  {
    id: 'sale-promo',
    name: 'Flash sale',
    category: 'promo',
    description: 'Urgent offer with sale badge, countdown and product shots.',
    durationS: 12,
    build: ({ aspect, brand, fps }) =>
      timeline(
        aspect,
        fps,
        [
          { kind: 'text', name: 'Text', clips: [text(fps, 0.2, 3.8, 'FLASH SALE', { ...headline(brand), fontSize: 110 }, { y: -0.32, key: 'headline', label: 'Headline', in: 'kinetic' })] },
          {
            kind: 'overlay',
            name: 'Graphics',
            clips: [
              motion(fps, 0.5, 5.5, 'sale-badge', { color: '#FACC15' }, { x: 0.22, y: -0.08, width: 0.5, height: 0.3 }),
              motion(fps, 6, 3, 'countdown', { mode: 'timer', seconds: 7200, label: 'Ends in', accent: brand.primary }),
              motion(fps, 9, 3, 'cta-button', { text: 'Claim offer', color: brand.primary }, { y: 0.2 }),
            ],
          },
          {
            kind: 'video',
            name: 'Product',
            clips: [
              media(fps, 0, 6, 'product_1', 'Product shot', 'Product on vibrant colorful background, energetic studio light', { type: 'image', kenBurns: true }),
              media(fps, 6, 6, 'product_2', 'Second product shot', 'Product flat lay with props, top-down, bright', { type: 'image', kenBurns: true, transitionIn: 'pushLeft' }),
            ],
          },
          { kind: 'audio', name: 'Music', clips: [] },
        ],
        brand.primary,
      ),
  },
  {
    id: 'listicle',
    name: '3 reasons why',
    category: 'story',
    description: 'Numbered reasons with fast cuts, ideal for TikTok and Reels.',
    durationS: 15,
    build: ({ aspect, brand, fps }) =>
      timeline(aspect, fps, [
        {
          kind: 'text',
          name: 'Text',
          clips: [
            text(fps, 0, 3, '3 REASONS PEOPLE SWITCH', headline(brand), { y: -0.3, key: 'title', label: 'Title' }),
            text(fps, 3, 3.5, '1. It just works', body(brand), { y: 0.3, key: 'reason_1', label: 'Reason 1', in: 'slideUp' }),
            text(fps, 6.5, 3.5, '2. Fair price', body(brand), { y: 0.3, key: 'reason_2', label: 'Reason 2', in: 'slideUp' }),
            text(fps, 10, 3, '3. Real support', body(brand), { y: 0.3, key: 'reason_3', label: 'Reason 3', in: 'slideUp' }),
          ],
        },
        { kind: 'overlay', name: 'Graphics', clips: [motion(fps, 0, 15, 'progress-bar', { color: brand.accent }), motion(fps, 13, 2, 'cta-button', { color: brand.primary }, { y: 0.2 })] },
        {
          kind: 'video',
          name: 'Footage',
          clips: [
            media(fps, 0, 3, 'opener', 'Opener', 'Eye-catching shot of the product being picked up, fast motion'),
            media(fps, 3, 3.5, 'reason_1', 'Reason 1 footage', 'Product being used easily, satisfying moment', { transitionIn: 'whip' }),
            media(fps, 6.5, 3.5, 'reason_2', 'Reason 2 footage', 'Product next to price comparison, clean', { transitionIn: 'whip' }),
            media(fps, 10, 5, 'reason_3', 'Reason 3 footage', 'Friendly support moment or happy customer', { transitionIn: 'whip' }),
          ],
        },
        { kind: 'audio', name: 'Voice', clips: [] },
        { kind: 'audio', name: 'Music', clips: [] },
      ]),
  },
  {
    id: 'before-after',
    name: 'Before / after',
    category: 'social-proof',
    description: 'Split transformation reveal with a wipe and labels.',
    durationS: 10,
    build: ({ aspect, brand, fps }) =>
      timeline(aspect, fps, [
        {
          kind: 'text',
          name: 'Labels',
          clips: [
            text(fps, 0, 4, 'BEFORE', { ...headline(brand), fontSize: 64 }, { y: -0.38, key: 'before_label', label: 'Before label' }),
            text(fps, 4, 3.5, 'AFTER', { ...headline(brand), fontSize: 64, color: brand.accent }, { y: -0.38, key: 'after_label', label: 'After label' }),
          ],
        },
        { kind: 'overlay', name: 'Graphics', clips: [motion(fps, 7.5, 2.5, 'cta-button', { color: brand.primary }, { y: 0.2 })] },
        {
          kind: 'video',
          name: 'Footage',
          clips: [
            media(fps, 0, 4, 'before', 'Before', 'The before state, slightly desaturated, same framing as after'),
            media(fps, 4, 6, 'after', 'After', 'The after state, vibrant and polished, same framing as before', { transitionIn: 'wipeLeft' }),
          ],
        },
        { kind: 'audio', name: 'Music', clips: [] },
      ]),
  },
  {
    id: 'unboxing',
    name: 'Unboxing',
    category: 'ugc',
    description: 'Authentic unboxing footage with callouts and a progress bar.',
    durationS: 20,
    build: ({ aspect, brand, fps }) =>
      timeline(aspect, fps, [
        { kind: 'text', name: 'Captions', clips: [] },
        {
          kind: 'overlay',
          name: 'Graphics',
          clips: [
            motion(fps, 0, 2.5, 'ugc-hook', { text: 'Unboxing the viral one', emoji: '📦' }),
            motion(fps, 0, 20, 'progress-bar', { color: brand.primary, position: 'bottom' }),
            motion(fps, 17, 3, 'cta-button', { color: brand.primary }, { y: 0.2 }),
          ],
        },
        { kind: 'video', name: 'Footage', clips: [media(fps, 0, 20, 'unboxing', 'Unboxing footage', 'Hands unboxing the product on a desk, top-down, natural light')] },
        { kind: 'audio', name: 'Music', clips: [] },
      ]),
  },
  {
    id: 'us-vs-them',
    name: 'Us vs them',
    category: 'promo',
    description: 'Comparison table that makes the choice obvious.',
    durationS: 12,
    build: ({ aspect, brand, fps }) =>
      timeline(
        aspect,
        fps,
        [
          { kind: 'overlay', name: 'Graphics', clips: [motion(fps, 0, 8, 'comparison', { accent: brand.accent }), motion(fps, 9.5, 2.5, 'cta-button', { color: brand.primary }, { y: 0.25 })] },
          { kind: 'video', name: 'Product', clips: [media(fps, 8, 4, 'product', 'Product hero', 'Product hero shot with dramatic rim light', { type: 'image', kenBurns: true, transitionIn: 'zoomIn' })] },
          { kind: 'audio', name: 'Music', clips: [] },
        ],
        brand.ink,
      ),
  },
];

export const TIMELINE_TEMPLATES_BY_ID: Record<string, TimelineTemplateDef> = Object.fromEntries(TIMELINE_TEMPLATES.map((t) => [t.id, t]));

export function buildTemplate(id: string, aspect: AspectRatio, brand: BrandStyle = DEFAULT_BRAND, fps = 30): TimelineData {
  const def = TIMELINE_TEMPLATES_BY_ID[id];
  if (!def) throw new Error(`Unknown template ${id}`);
  return def.build({ aspect, brand, fps });
}

export function brandFromKit(kit: { colors?: unknown; fonts?: unknown } | null | undefined): BrandStyle {
  const colors = Array.isArray(kit?.colors) ? (kit!.colors as { name?: string; hex?: string }[]) : [];
  const find = (name: string, fallback: string) => colors.find((c) => c.name?.toLowerCase() === name)?.hex ?? fallback;
  const fonts = (kit?.fonts ?? {}) as { display?: string; body?: string };
  return {
    primary: find('primary', colors[0]?.hex ?? DEFAULT_BRAND.primary),
    accent: find('accent', colors[1]?.hex ?? DEFAULT_BRAND.accent),
    ink: find('ink', DEFAULT_BRAND.ink),
    paper: find('paper', DEFAULT_BRAND.paper),
    displayFont: fonts.display ?? DEFAULT_BRAND.displayFont,
    bodyFont: fonts.body ?? DEFAULT_BRAND.bodyFont,
  };
}
