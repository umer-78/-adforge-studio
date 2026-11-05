import * as z from 'zod';

export const TIMELINE_SCHEMA_VERSION = 1;

export const EASING_IDS = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeInBack',
  'easeOutBack',
  'easeOutElastic',
  'easeOutBounce',
  'hold',
] as const;
export const easingSchema = z.enum(EASING_IDS);
export type EasingId = z.infer<typeof easingSchema>;

export const ANIMATABLE_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity', 'volume', 'blur'] as const;
export const animatablePropSchema = z.enum(ANIMATABLE_PROPS);
export type AnimatableProp = z.infer<typeof animatablePropSchema>;

export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'soft-light', 'hard-light', 'difference', 'luminosity'] as const;
export const blendModeSchema = z.enum(BLEND_MODES);
export type BlendMode = z.infer<typeof blendModeSchema>;

/** A keyframe value at a frame relative to the clip start. The easing shapes the segment leaving this keyframe. */
export const keyframeSchema = z.object({
  frame: z.number().int().min(0),
  value: z.number(),
  easing: easingSchema.default('easeInOut'),
});
export type Keyframe = z.infer<typeof keyframeSchema>;

const paramValue = z.union([z.number(), z.string(), z.boolean()]);
export type ParamValue = z.infer<typeof paramValue>;

export const cropSchema = z.object({
  top: z.number().min(0).max(0.95).default(0),
  right: z.number().min(0).max(0.95).default(0),
  bottom: z.number().min(0).max(0.95).default(0),
  left: z.number().min(0).max(0.95).default(0),
});

/**
 * Position is an offset from the canvas centre in fractions of the canvas size
 * (x: 0.5 moves the layer half a canvas width to the right).
 */
export const transformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().min(0).max(20).default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  anchorX: z.number().min(0).max(1).default(0.5),
  anchorY: z.number().min(0).max(1).default(0.5),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  /** Layer box width as a fraction of canvas width, for text, shapes and motion overlays. */
  width: z.number().min(0.02).max(2).default(1),
  /** Layer box height as a fraction of canvas height. */
  height: z.number().min(0.02).max(2).default(1),
  crop: cropSchema.prefault({}),
});
export type Transform = z.infer<typeof transformSchema>;

export const effectInstanceSchema = z.object({
  id: z.string(),
  type: z.string(),
  enabled: z.boolean().default(true),
  params: z.record(z.string(), paramValue).default({}),
});
export type EffectInstance = z.infer<typeof effectInstanceSchema>;

export const transitionSchema = z.object({
  type: z.string(),
  duration: z.number().int().min(1).max(240),
  easing: easingSchema.default('easeInOut'),
  params: z.record(z.string(), paramValue).default({}),
});
export type Transition = z.infer<typeof transitionSchema>;

export const maskSchema = z.object({
  shape: z.enum(['rect', 'ellipse']),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5),
  width: z.number().min(0).max(1).default(1),
  height: z.number().min(0).max(1).default(1),
  radius: z.number().min(0).max(0.5).default(0),
  feather: z.number().min(0).max(0.5).default(0),
  invert: z.boolean().default(false),
});
export type Mask = z.infer<typeof maskSchema>;

export const audioSettingsSchema = z.object({
  volume: z.number().min(0).max(4).default(1),
  muted: z.boolean().default(false),
  pan: z.number().min(-1).max(1).default(0),
  /** Seconds. */
  fadeIn: z.number().min(0).max(30).default(0),
  fadeOut: z.number().min(0).max(30).default(0),
  eq: z
    .object({
      low: z.number().min(-24).max(24).default(0),
      mid: z.number().min(-24).max(24).default(0),
      high: z.number().min(-24).max(24).default(0),
    })
    .prefault({}),
  compressor: z.boolean().default(false),
  denoise: z.boolean().default(false),
  /** voice clips duck music clips; auto infers from the asset. */
  role: z.enum(['auto', 'voice', 'music', 'sfx']).default('auto'),
  /** When true this clip is lowered while voice clips play. */
  duck: z.boolean().default(false),
});
export type AudioSettings = z.infer<typeof audioSettingsSchema>;

export const placeholderSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(['media', 'text']),
  /** Suggested generation prompt for empty media slots (templates, ad clones). */
  prompt: z.string().optional(),
});
export type Placeholder = z.infer<typeof placeholderSchema>;

const clipBase = {
  id: z.string(),
  start: z.number().int().min(0),
  duration: z.number().int().min(1),
  name: z.string().max(200).optional(),
  locked: z.boolean().default(false),
  transform: transformSchema.prefault({}),
  keyframes: z.partialRecord(animatablePropSchema, z.array(keyframeSchema)).default({}),
  effects: z.array(effectInstanceSchema).default([]),
  transitionIn: transitionSchema.nullable().default(null),
  transitionOut: transitionSchema.nullable().default(null),
  blendMode: blendModeSchema.default('normal'),
  mask: maskSchema.nullable().default(null),
  placeholder: placeholderSchema.nullable().default(null),
  meta: z.record(z.string(), z.unknown()).default({}),
};

export const speedRampPointSchema = z.object({
  at: z.number().min(0).max(1),
  speed: z.number().min(0.1).max(16),
});

export const videoClipSchema = z.object({
  ...clipBase,
  type: z.literal('video'),
  assetId: z.string().nullable(),
  /** Seconds into the source where the clip starts. */
  trimStart: z.number().min(0).default(0),
  speed: z.number().min(0.1).max(16).default(1),
  speedRamp: z.array(speedRampPointSchema).default([]),
  reverse: z.boolean().default(false),
  /** Seconds into the source to hold as a still frame. */
  freezeAt: z.number().min(0).nullable().default(null),
  audio: audioSettingsSchema.prefault({}),
});

export const imageClipSchema = z.object({
  ...clipBase,
  type: z.literal('image'),
  assetId: z.string().nullable(),
});

export const audioClipSchema = z.object({
  ...clipBase,
  type: z.literal('audio'),
  assetId: z.string().nullable(),
  trimStart: z.number().min(0).default(0),
  speed: z.number().min(0.25).max(4).default(1),
  audio: audioSettingsSchema.prefault({}),
});

export const TEXT_ANIMATIONS = [
  'none',
  'fade',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'pop',
  'scaleIn',
  'blurIn',
  'typewriter',
  'wordByWord',
  'letterByLetter',
  'bounce',
  'glitch',
  'highlight',
  'wave',
  'kinetic',
] as const;
export const textAnimationIdSchema = z.enum(TEXT_ANIMATIONS);
export type TextAnimationId = z.infer<typeof textAnimationIdSchema>;

export const textStyleSchema = z.object({
  fontFamily: z.string().default('Unbounded'),
  fontWeight: z.number().int().min(100).max(900).default(700),
  /** Pixels relative to a 1080 px short canvas side. */
  fontSize: z.number().min(6).max(600).default(72),
  color: z.string().default('#FFFFFF'),
  gradient: z.tuple([z.string(), z.string()]).nullable().default(null),
  align: z.enum(['left', 'center', 'right']).default('center'),
  lineHeight: z.number().min(0.6).max(3).default(1.1),
  letterSpacing: z.number().min(-0.2).max(1).default(0),
  uppercase: z.boolean().default(false),
  italic: z.boolean().default(false),
  strokeColor: z.string().nullable().default(null),
  strokeWidth: z.number().min(0).max(40).default(0),
  shadowColor: z.string().nullable().default('rgba(0,0,0,0.45)'),
  shadowBlur: z.number().min(0).max(80).default(12),
  shadowX: z.number().default(0),
  shadowY: z.number().default(4),
  backgroundColor: z.string().nullable().default(null),
  backgroundPadding: z.number().min(0).max(3).default(0.35),
  backgroundRadius: z.number().min(0).max(2).default(0.25),
  highlightColor: z.string().default('#7C5CFF'),
});
export type TextStyle = z.infer<typeof textStyleSchema>;

export const textAnimationSchema = z.object({
  in: textAnimationIdSchema.default('fade'),
  out: textAnimationIdSchema.default('fade'),
  inDuration: z.number().int().min(0).max(120).default(12),
  outDuration: z.number().int().min(0).max(120).default(10),
  loop: z.enum(['none', 'pulse', 'float', 'shake', 'wiggle']).default('none'),
});
export type TextAnimation = z.infer<typeof textAnimationSchema>;

export const textClipSchema = z.object({
  ...clipBase,
  type: z.literal('text'),
  text: z.string().max(2000),
  style: textStyleSchema.prefault({}),
  animation: textAnimationSchema.prefault({}),
});

export const captionWordSchema = z.object({
  text: z.string(),
  /** Seconds relative to the clip start. */
  start: z.number().min(0),
  end: z.number().min(0),
  speaker: z.string().optional(),
});
export type CaptionWord = z.infer<typeof captionWordSchema>;

export const captionsClipSchema = z.object({
  ...clipBase,
  type: z.literal('captions'),
  words: z.array(captionWordSchema).default([]),
  styleId: z.string().default('pop'),
  overrides: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  maxWordsPerLine: z.number().int().min(1).max(12).default(4),
  position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  language: z.string().optional(),
});

export const shapeClipSchema = z.object({
  ...clipBase,
  type: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'triangle', 'line', 'star']).default('rect'),
  fill: z.string().nullable().default('#7C5CFF'),
  stroke: z.string().nullable().default(null),
  strokeWidth: z.number().min(0).max(100).default(0),
  /** Corner radius as a fraction of the shorter side. */
  radius: z.number().min(0).max(0.5).default(0),
});

export const motionClipSchema = z.object({
  ...clipBase,
  type: z.literal('motion'),
  templateId: z.string(),
  props: z.record(z.string(), z.unknown()).default({}),
});

/** Applies its effects to every layer below it. */
export const adjustmentClipSchema = z.object({
  ...clipBase,
  type: z.literal('adjustment'),
});

export const clipSchema = z.discriminatedUnion('type', [
  videoClipSchema,
  imageClipSchema,
  audioClipSchema,
  textClipSchema,
  captionsClipSchema,
  shapeClipSchema,
  motionClipSchema,
  adjustmentClipSchema,
]);

export type VideoClip = z.infer<typeof videoClipSchema>;
export type ImageClip = z.infer<typeof imageClipSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type TextClip = z.infer<typeof textClipSchema>;
export type CaptionsClip = z.infer<typeof captionsClipSchema>;
export type ShapeClip = z.infer<typeof shapeClipSchema>;
export type MotionClip = z.infer<typeof motionClipSchema>;
export type AdjustmentClip = z.infer<typeof adjustmentClipSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type ClipType = Clip['type'];
export type ClipInput = z.input<typeof clipSchema>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Clip input without an id, as passed to makeClip. */
export type ClipDraft = DistributiveOmit<ClipInput, 'id'> & { id?: string };
export type MediaClip = VideoClip | ImageClip | AudioClip;
export type TimedMediaClip = VideoClip | AudioClip;

export const TRACK_KINDS = ['video', 'audio', 'text', 'overlay'] as const;
export const trackKindSchema = z.enum(TRACK_KINDS);
export type TrackKind = z.infer<typeof trackKindSchema>;

export const trackSchema = z.object({
  id: z.string(),
  kind: trackKindSchema,
  name: z.string().max(80).default(''),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  volume: z.number().min(0).max(4).default(1),
  clips: z.array(clipSchema).default([]),
});
export type Track = z.infer<typeof trackSchema>;

export const markerSchema = z.object({
  id: z.string(),
  frame: z.number().int().min(0),
  label: z.string().max(120).default(''),
  color: z.string().default('#22D3EE'),
  kind: z.enum(['marker', 'beat', 'scene']).default('marker'),
});
export type Marker = z.infer<typeof markerSchema>;

export const masterSchema = z.object({
  volume: z.number().min(0).max(4).default(1),
  loudnorm: z.boolean().default(true),
  targetLufs: z.number().min(-30).max(-6).default(-14),
  /** How far music drops under voice, 0–1. */
  duckAmount: z.number().min(0).max(1).default(0.7),
});

/**
 * Tracks are listed top to bottom as shown in the editor; the first track is
 * drawn in front of the others.
 */
export const timelineDataSchema = z.object({
  version: z.literal(TIMELINE_SCHEMA_VERSION).default(TIMELINE_SCHEMA_VERSION),
  fps: z.number().min(1).max(120).default(30),
  width: z.number().int().min(16).max(7680).default(1080),
  height: z.number().int().min(16).max(7680).default(1920),
  background: z.string().default('#000000'),
  tracks: z.array(trackSchema).default([]),
  markers: z.array(markerSchema).default([]),
  master: masterSchema.prefault({}),
  brandKitId: z.string().nullable().default(null),
  /** Burn a small "AI-generated" label into exports. */
  aiLabel: z.boolean().default(false),
});
export type TimelineData = z.infer<typeof timelineDataSchema>;
export type TimelineDataInput = z.input<typeof timelineDataSchema>;

export function parseTimeline(data: unknown): TimelineData {
  return timelineDataSchema.parse(data ?? {});
}

export function parseClip(data: unknown): Clip {
  return clipSchema.parse(data);
}

/** Asset facts the renderer and editor need, resolved per environment (proxy URLs in the editor, originals on export). */
export const resolvedAssetSchema = z.object({
  id: z.string(),
  type: z.enum(['video', 'image', 'audio', 'model3d']),
  src: z.string(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  durationS: z.number().nullable().optional(),
  fps: z.number().nullable().optional(),
  hasAudio: z.boolean().optional(),
  name: z.string().optional(),
  role: z.enum(['voice', 'music', 'sfx', 'other']).optional(),
  commercialUse: z.boolean().optional(),
});
export type ResolvedAsset = z.infer<typeof resolvedAssetSchema>;
export type AssetMap = Record<string, ResolvedAsset>;
