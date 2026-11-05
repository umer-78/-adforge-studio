import * as z from 'zod';

export type MotionFieldDef =
  | { key: string; label: string; type: 'text' | 'textarea' | 'url' }
  | { key: string; label: string; type: 'color' }
  | { key: string; label: string; type: 'number'; min: number; max: number; step: number }
  | { key: string; label: string; type: 'select'; options: string[] }
  | { key: string; label: string; type: 'boolean' }
  | { key: string; label: string; type: 'asset'; assetType: 'image' | 'video' }
  | { key: string; label: string; type: 'list' };

export interface MotionTemplateDef<S extends z.ZodObject = z.ZodObject> {
  id: string;
  name: string;
  category: 'title' | 'commerce' | 'social' | 'brand' | 'data' | 'utility';
  description: string;
  durationInFrames: number;
  schema: S;
  fields: MotionFieldDef[];
  /** Full-frame templates fill the canvas; others are overlays. */
  fullFrame?: boolean;
}

const color = (def: string) => z.string().default(def);

export const kineticTitleSchema = z.object({
  text: z.string().default('MAKE IT\nUNMISSABLE'),
  color: color('#FFFFFF'),
  accent: color('#7C5CFF'),
  font: z.string().default('Unbounded'),
  style: z.enum(['stack', 'slam', 'reveal', 'split']).default('stack'),
  background: z.string().nullable().default(null),
});

export const lowerThirdSchema = z.object({
  title: z.string().default('Jamie Rivera'),
  subtitle: z.string().default('Founder, Northwind'),
  accent: color('#22D3EE'),
  align: z.enum(['left', 'right']).default('left'),
});

export const priceTagSchema = z.object({
  price: z.string().default('49'),
  oldPrice: z.string().default('79'),
  currency: z.string().default('$'),
  label: z.string().default('Launch price'),
  accent: color('#F43F5E'),
});

export const saleBadgeSchema = z.object({
  text: z.string().default('50% OFF'),
  subtext: z.string().default('Today only'),
  color: color('#FACC15'),
  textColor: color('#0B0B12'),
  shape: z.enum(['burst', 'circle', 'pill']).default('burst'),
});

export const countdownSchema = z.object({
  mode: z.enum(['numbers', 'timer']).default('numbers'),
  seconds: z.number().int().min(1).max(86_400).default(3),
  label: z.string().default('Drop starts in'),
  color: color('#FFFFFF'),
  accent: color('#7C5CFF'),
});

export const ctaButtonSchema = z.object({
  text: z.string().default('Shop now'),
  subtext: z.string().default('Free shipping over $50'),
  color: color('#7C5CFF'),
  textColor: color('#FFFFFF'),
  icon: z.enum(['arrow', 'cart', 'download', 'none']).default('arrow'),
  pulse: z.boolean().default(true),
});

export const ratingStarsSchema = z.object({
  rating: z.number().min(0).max(5).default(4.8),
  count: z.string().default('2,431 reviews'),
  color: color('#FACC15'),
});

export const logoStingSchema = z.object({
  logoAssetId: z.string().nullable().default(null),
  wordmark: z.string().default('Brand'),
  tagline: z.string().default(''),
  color: color('#7C5CFF'),
  background: color('#0B0B12'),
  style: z.enum(['glow', 'reveal', 'bounce']).default('glow'),
});

export const progressBarSchema = z.object({
  color: color('#7C5CFF'),
  track: color('rgba(255,255,255,0.18)'),
  thickness: z.number().min(2).max(40).default(10),
  position: z.enum(['top', 'bottom']).default('top'),
});

export const qrCardSchema = z.object({
  url: z.string().default('https://example.com'),
  label: z.string().default('Scan to shop'),
  fg: color('#0B0B12'),
  bg: color('#FFFFFF'),
});

export const bulletListSchema = z.object({
  title: z.string().default('Why people switch'),
  items: z.array(z.string()).default(['Ships in 24 hours', '30-day returns', 'Loved by 20k customers']),
  accent: color('#22D3EE'),
  icon: z.enum(['check', 'dot', 'number']).default('check'),
});

export const testimonialSchema = z.object({
  quote: z.string().default('Honestly the best purchase I made this year.'),
  author: z.string().default('Priya S.'),
  role: z.string().default('Verified buyer'),
  avatarAssetId: z.string().nullable().default(null),
  rating: z.number().min(0).max(5).default(5),
  accent: color('#7C5CFF'),
});

export const comparisonSchema = z.object({
  leftTitle: z.string().default('Others'),
  rightTitle: z.string().default('Us'),
  leftItems: z.array(z.string()).default(['Slow shipping', 'Hidden fees', 'Generic fit']),
  rightItems: z.array(z.string()).default(['Next-day delivery', 'One clear price', 'Made to measure']),
  accent: color('#22C55E'),
});

export const subscribeSchema = z.object({
  handle: z.string().default('@yourbrand'),
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'x', 'generic']).default('generic'),
  color: color('#F43F5E'),
});

export const productShowcaseSchema = z.object({
  imageAssetId: z.string().nullable().default(null),
  title: z.string().default('The Everyday Bottle'),
  subtitle: z.string().default('Keeps cold for 24 hours'),
  price: z.string().default('$34'),
  accent: color('#7C5CFF'),
  background: color('#0B0B12'),
});

export const ugcHookSchema = z.object({
  text: z.string().default('I tried this so you don’t have to'),
  emoji: z.string().default('👀'),
  style: z.enum(['tiktok', 'bubble', 'outline']).default('tiktok'),
});


/** Parsed props per template, for the renderer. */
export type KineticTitleProps = z.infer<typeof kineticTitleSchema>;
export type LowerThirdProps = z.infer<typeof lowerThirdSchema>;
export type PriceTagProps = z.infer<typeof priceTagSchema>;
export type SaleBadgeProps = z.infer<typeof saleBadgeSchema>;
export type CountdownProps = z.infer<typeof countdownSchema>;
export type CtaButtonProps = z.infer<typeof ctaButtonSchema>;
export type RatingStarsProps = z.infer<typeof ratingStarsSchema>;
export type LogoStingProps = z.infer<typeof logoStingSchema>;
export type ProgressBarProps = z.infer<typeof progressBarSchema>;
export type QrCardProps = z.infer<typeof qrCardSchema>;
export type BulletListProps = z.infer<typeof bulletListSchema>;
export type TestimonialProps = z.infer<typeof testimonialSchema>;
export type ComparisonProps = z.infer<typeof comparisonSchema>;
export type SubscribeProps = z.infer<typeof subscribeSchema>;
export type ProductShowcaseProps = z.infer<typeof productShowcaseSchema>;
export type UgcHookProps = z.infer<typeof ugcHookSchema>;

export const MOTION_TEMPLATES: MotionTemplateDef[] = [
  {
    id: 'kinetic-title',
    name: 'Kinetic title',
    category: 'title',
    description: 'Bold animated headline with stacked or slammed words.',
    durationInFrames: 90,
    schema: kineticTitleSchema,
    fields: [
      { key: 'text', label: 'Text', type: 'textarea' },
      { key: 'style', label: 'Style', type: 'select', options: ['stack', 'slam', 'reveal', 'split'] },
      { key: 'font', label: 'Font', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'accent', label: 'Accent', type: 'color' },
    ],
  },
  {
    id: 'lower-third',
    name: 'Lower third',
    category: 'title',
    description: 'Name and title bar for talking-head footage.',
    durationInFrames: 120,
    schema: lowerThirdSchema,
    fields: [
      { key: 'title', label: 'Name', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'accent', label: 'Accent', type: 'color' },
      { key: 'align', label: 'Align', type: 'select', options: ['left', 'right'] },
    ],
  },
  {
    id: 'price-tag',
    name: 'Price tag',
    category: 'commerce',
    description: 'Price drop with strike-through old price.',
    durationInFrames: 90,
    schema: priceTagSchema,
    fields: [
      { key: 'price', label: 'Price', type: 'text' },
      { key: 'oldPrice', label: 'Old price', type: 'text' },
      { key: 'currency', label: 'Currency', type: 'text' },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'accent', label: 'Accent', type: 'color' },
    ],
  },
  {
    id: 'sale-badge',
    name: 'Sale badge',
    category: 'commerce',
    description: 'Spinning burst badge for offers.',
    durationInFrames: 90,
    schema: saleBadgeSchema,
    fields: [
      { key: 'text', label: 'Text', type: 'text' },
      { key: 'subtext', label: 'Subtext', type: 'text' },
      { key: 'shape', label: 'Shape', type: 'select', options: ['burst', 'circle', 'pill'] },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'textColor', label: 'Text color', type: 'color' },
    ],
  },
  {
    id: 'countdown',
    name: 'Countdown',
    category: 'utility',
    description: 'Numbers or a live timer that counts down.',
    durationInFrames: 120,
    schema: countdownSchema,
    fields: [
      { key: 'mode', label: 'Mode', type: 'select', options: ['numbers', 'timer'] },
      { key: 'seconds', label: 'Seconds', type: 'number', min: 1, max: 86400, step: 1 },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'accent', label: 'Accent', type: 'color' },
    ],
  },
  {
    id: 'cta-button',
    name: 'Call to action',
    category: 'commerce',
    description: 'Animated button with optional pulse.',
    durationInFrames: 90,
    schema: ctaButtonSchema,
    fields: [
      { key: 'text', label: 'Text', type: 'text' },
      { key: 'subtext', label: 'Subtext', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'select', options: ['arrow', 'cart', 'download', 'none'] },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'textColor', label: 'Text color', type: 'color' },
      { key: 'pulse', label: 'Pulse', type: 'boolean' },
    ],
  },
  {
    id: 'rating-stars',
    name: 'Rating stars',
    category: 'social',
    description: 'Stars that fill to the rating.',
    durationInFrames: 75,
    schema: ratingStarsSchema,
    fields: [
      { key: 'rating', label: 'Rating', type: 'number', min: 0, max: 5, step: 0.1 },
      { key: 'count', label: 'Count text', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
    ],
  },
  {
    id: 'logo-sting',
    name: 'Logo sting',
    category: 'brand',
    description: 'Short brand reveal for intros and outros.',
    durationInFrames: 75,
    fullFrame: true,
    schema: logoStingSchema,
    fields: [
      { key: 'logoAssetId', label: 'Logo', type: 'asset', assetType: 'image' },
      { key: 'wordmark', label: 'Wordmark', type: 'text' },
      { key: 'tagline', label: 'Tagline', type: 'text' },
      { key: 'style', label: 'Style', type: 'select', options: ['glow', 'reveal', 'bounce'] },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'background', label: 'Background', type: 'color' },
    ],
  },
  {
    id: 'progress-bar',
    name: 'Progress bar',
    category: 'utility',
    description: 'Fills across the clip duration to keep viewers watching.',
    durationInFrames: 300,
    schema: progressBarSchema,
    fields: [
      { key: 'position', label: 'Position', type: 'select', options: ['top', 'bottom'] },
      { key: 'thickness', label: 'Thickness', type: 'number', min: 2, max: 40, step: 1 },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'track', label: 'Track', type: 'color' },
    ],
  },
  {
    id: 'qr-card',
    name: 'QR card',
    category: 'utility',
    description: 'Scannable QR code with a label.',
    durationInFrames: 120,
    schema: qrCardSchema,
    fields: [
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'fg', label: 'Foreground', type: 'color' },
      { key: 'bg', label: 'Background', type: 'color' },
    ],
  },
  {
    id: 'bullet-list',
    name: 'Bullet list',
    category: 'data',
    description: 'Benefits that appear one by one.',
    durationInFrames: 120,
    schema: bulletListSchema,
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'items', label: 'Items', type: 'list' },
      { key: 'icon', label: 'Icon', type: 'select', options: ['check', 'dot', 'number'] },
      { key: 'accent', label: 'Accent', type: 'color' },
    ],
  },
  {
    id: 'testimonial',
    name: 'Testimonial',
    category: 'social',
    description: 'Review card with stars and avatar.',
    durationInFrames: 120,
    schema: testimonialSchema,
    fields: [
      { key: 'quote', label: 'Quote', type: 'textarea' },
      { key: 'author', label: 'Author', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'avatarAssetId', label: 'Avatar', type: 'asset', assetType: 'image' },
      { key: 'rating', label: 'Rating', type: 'number', min: 0, max: 5, step: 0.5 },
      { key: 'accent', label: 'Accent', type: 'color' },
    ],
  },
  {
    id: 'comparison',
    name: 'Us vs them',
    category: 'data',
    description: 'Side-by-side comparison table.',
    durationInFrames: 150,
    fullFrame: true,
    schema: comparisonSchema,
    fields: [
      { key: 'leftTitle', label: 'Left title', type: 'text' },
      { key: 'leftItems', label: 'Left items', type: 'list' },
      { key: 'rightTitle', label: 'Right title', type: 'text' },
      { key: 'rightItems', label: 'Right items', type: 'list' },
      { key: 'accent', label: 'Accent', type: 'color' },
    ],
  },
  {
    id: 'subscribe',
    name: 'Follow prompt',
    category: 'social',
    description: 'Follow/subscribe nudge with handle.',
    durationInFrames: 90,
    schema: subscribeSchema,
    fields: [
      { key: 'handle', label: 'Handle', type: 'text' },
      { key: 'platform', label: 'Platform', type: 'select', options: ['tiktok', 'instagram', 'youtube', 'x', 'generic'] },
      { key: 'color', label: 'Color', type: 'color' },
    ],
  },
  {
    id: 'product-showcase',
    name: 'Product showcase',
    category: 'commerce',
    description: 'Hero product reveal with title and price.',
    durationInFrames: 150,
    fullFrame: true,
    schema: productShowcaseSchema,
    fields: [
      { key: 'imageAssetId', label: 'Product image', type: 'asset', assetType: 'image' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'price', label: 'Price', type: 'text' },
      { key: 'accent', label: 'Accent', type: 'color' },
      { key: 'background', label: 'Background', type: 'color' },
    ],
  },
  {
    id: 'ugc-hook',
    name: 'UGC hook',
    category: 'social',
    description: 'Native-looking hook caption for the first seconds.',
    durationInFrames: 75,
    schema: ugcHookSchema,
    fields: [
      { key: 'text', label: 'Hook', type: 'textarea' },
      { key: 'emoji', label: 'Emoji', type: 'text' },
      { key: 'style', label: 'Style', type: 'select', options: ['tiktok', 'bubble', 'outline'] },
    ],
  },
];

export const MOTION_TEMPLATES_BY_ID: Record<string, MotionTemplateDef> = Object.fromEntries(MOTION_TEMPLATES.map((t) => [t.id, t]));

export function motionDefaults(id: string): Record<string, unknown> {
  const def = MOTION_TEMPLATES_BY_ID[id];
  return def ? (def.schema.parse({}) as Record<string, unknown>) : {};
}

export function parseMotionProps(id: string, props: unknown): Record<string, unknown> {
  const def = MOTION_TEMPLATES_BY_ID[id];
  if (!def) return {};
  const parsed = def.schema.safeParse(props ?? {});
  return (parsed.success ? parsed.data : def.schema.parse({})) as Record<string, unknown>;
}
