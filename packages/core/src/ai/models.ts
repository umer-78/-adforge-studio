import * as z from 'zod';
import type { AspectRatio } from '../constants';

export const CAPABILITIES = {
  t2v: { label: 'Text to video', output: 'video', group: 'video' },
  i2v: { label: 'Image to video', output: 'video', group: 'video' },
  first_last: { label: 'First & last frame', output: 'video', group: 'video' },
  v2v: { label: 'Restyle video', output: 'video', group: 'video' },
  video_edit: { label: 'Edit video with words', output: 'video', group: 'video' },
  lipsync: { label: 'Lip-sync to audio', output: 'video', group: 'video' },
  avatar: { label: 'Talking avatar', output: 'video', group: 'video' },
  upscale_video: { label: 'Upscale video', output: 'video', group: 'tools' },
  remove_bg_video: { label: 'Remove video background', output: 'video', group: 'tools' },
  interpolate: { label: 'Smooth slow motion', output: 'video', group: 'tools' },
  t2i: { label: 'Text to image', output: 'image', group: 'image' },
  i2i: { label: 'Edit image', output: 'image', group: 'image' },
  upscale_image: { label: 'Upscale image', output: 'image', group: 'tools' },
  remove_bg_image: { label: 'Remove image background', output: 'image', group: 'tools' },
  image_to_3d: { label: 'Image to 3D model', output: 'model3d', group: '3d' },
  depth: { label: 'Depth map', output: 'image', group: 'tools' },
  tts: { label: 'Voice-over', output: 'audio', group: 'audio' },
  dialogue: { label: 'Multi-voice dialogue', output: 'audio', group: 'audio' },
  sts: { label: 'Change voice', output: 'audio', group: 'audio' },
  music: { label: 'Music & songs', output: 'audio', group: 'audio' },
  sfx: { label: 'Sound effects', output: 'audio', group: 'audio' },
  isolate: { label: 'Clean up voice', output: 'audio', group: 'audio' },
  stems: { label: 'Split stems', output: 'audio', group: 'audio' },
  dub: { label: 'Translate & dub', output: 'video', group: 'audio' },
  transcribe: { label: 'Transcribe', output: 'text', group: 'audio' },
} as const;
export type Capability = keyof typeof CAPABILITIES;
export const capabilitySchema = z.enum(Object.keys(CAPABILITIES) as [Capability, ...Capability[]]);

export type ProviderId = 'fal' | 'replicate' | 'agnes' | 'elevenlabs' | 'openai' | 'anthropic';

export const genParamsSchema = z.object({
  prompt: z.string().max(5000).default(''),
  negativePrompt: z.string().max(2000).optional(),
  durationS: z.number().min(0.5).max(600).optional(),
  aspect: z.string().optional(),
  resolution: z.string().optional(),
  audio: z.boolean().optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  numOutputs: z.number().int().min(1).max(4).default(1),
  imageAssetId: z.string().uuid().optional(),
  endImageAssetId: z.string().uuid().optional(),
  videoAssetId: z.string().uuid().optional(),
  audioAssetId: z.string().uuid().optional(),
  referenceAssetIds: z.array(z.string().uuid()).max(8).optional(),
  /** Reference audio clips (voice, rhythm, sound) for models with reference mode. */
  referenceAudioAssetIds: z.array(z.string().uuid()).max(3).optional(),
  upscaleFactor: z.number().min(1).max(8).optional(),
  targetResolution: z.enum(['720p', '1080p', '1440p', '2160p']).optional(),
  quality: z.enum(['low', 'medium', 'high']).optional(),
  textured: z.boolean().optional(),
  slowmo: z.number().int().min(1).max(4).optional(),
  colors: z.array(z.string()).max(6).optional(),
  /** ElevenLabs voice for tts/sts. */
  voiceId: z.string().optional(),
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  speed: z.number().min(0.7).max(1.2).optional(),
  language: z.string().max(12).optional(),
  instrumental: z.boolean().optional(),
  lyrics: z.string().max(5000).optional(),
  loop: z.boolean().optional(),
  promptInfluence: z.number().min(0).max(1).optional(),
});
export type GenParams = z.infer<typeof genParamsSchema>;
export type GenParamsInput = z.input<typeof genParamsSchema>;

export interface ResolvedInputs {
  image?: string;
  endImage?: string;
  video?: string;
  audio?: string;
  references?: string[];
  referenceAudios?: string[];
  /** Seconds of the input video/audio, for pricing. */
  inputDurationS?: number;
  inputWidth?: number;
  inputHeight?: number;
}

export interface OutputFile {
  url: string;
  kind: 'video' | 'image' | 'audio' | 'model3d';
  contentType?: string;
  width?: number;
  height?: number;
}

export interface PriceQuote {
  usd: number;
  /** Human readable unit math, e.g. "5 s × $0.168/s". */
  detail: string;
  /** True when the provider bills in a way we can only approximate. */
  approx: boolean;
}

export interface ModelDef {
  id: string;
  label: string;
  vendor: string;
  provider: ProviderId;
  endpoint: string;
  capability: Capability;
  description: string;
  badges: string[];
  inputs?: { image?: 'required' | 'optional'; endImage?: 'optional'; video?: 'required' | 'optional'; audio?: 'required' | 'optional'; references?: number; audioReferences?: number };
  controls: {
    durations?: number[];
    durationRange?: [number, number];
    aspects?: AspectRatio[];
    resolutions?: string[];
    audioToggle?: boolean;
    seed?: boolean;
    negativePrompt?: boolean;
    maxOutputs?: number;
    maxInputDurationS?: number;
    /** Extra knobs some models expose; the studio shows a control for each one present. */
    targetResolutions?: ('720p' | '1080p' | '1440p' | '2160p')[];
    upscaleFactors?: number[];
    slowmoFactors?: number[];
    qualities?: ('low' | 'medium' | 'high')[];
    texturedToggle?: boolean;
    brandColors?: boolean;
  };
  defaults: Partial<GenParams>;
  price: (p: GenParams, inputs: ResolvedInputs) => PriceQuote;
  etaS: (p: GenParams) => number;
  buildInput: (p: GenParams, inputs: ResolvedInputs) => Record<string, unknown>;
  parseOutput: (data: unknown) => OutputFile[];
  /** Kept for existing work but hidden from new generations after this date. */
  sunsetAt?: string;
  recommended?: boolean;
}

export const get = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

const videoOut = (data: unknown): OutputFile[] => {
  const url = get(data, 'video.url');
  return typeof url === 'string' ? [{ url, kind: 'video', contentType: (get(data, 'video.content_type') as string) ?? 'video/mp4' }] : [];
};

const imagesOut = (data: unknown): OutputFile[] => {
  const list = get(data, 'images');
  const single = get(data, 'image');
  const arr = Array.isArray(list) ? list : single ? [single] : [];
  return arr
    .map((i) => i as { url?: string; width?: number; height?: number; content_type?: string })
    .filter((i) => typeof i.url === 'string')
    .map((i) => ({ url: i.url!, kind: 'image' as const, ...(i.width ? { width: i.width } : {}), ...(i.height ? { height: i.height } : {}), ...(i.content_type ? { contentType: i.content_type } : {}) }));
};

export const perSecond = (rate: number, seconds: number, label = ''): PriceQuote => ({
  usd: rate * seconds,
  detail: `${round1(seconds)} s × $${rate.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}/s${label ? ` (${label})` : ''}`,
  approx: false,
});
const round1 = (n: number) => Math.round(n * 10) / 10;

export const nearest = <T extends number>(value: number | undefined, options: readonly T[], fallback: T): T => {
  if (value == null) return fallback;
  return options.reduce((best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best), options[0] ?? fallback);
};

const aspectOr = (aspect: string | undefined, allowed: readonly string[], fallback: string) => {
  if (aspect && allowed.includes(aspect)) return aspect;
  if (aspect === '4:5' && allowed.includes('3:4')) return '3:4';
  if (aspect === '4:5' && allowed.includes('9:16')) return '9:16';
  return fallback;
};

const IMAGE_SIZE_PRESET: Record<string, string> = {
  '9:16': 'portrait_16_9',
  '4:5': 'portrait_4_3',
  '1:1': 'square_hd',
  '16:9': 'landscape_16_9',
};

const SEEDANCE_RATES: Record<string, number> = { '480p': 0.135, '720p': 0.3034, '1080p': 0.682, '4k': 1.555 };
const seedanceDurations = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const seedanceAspects: AspectRatio[] = ['9:16', '1:1', '16:9', '4:5'];
const seedanceAspectAllowed = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];

function seedance(id: string, endpoint: string, capability: Capability, label: string, withImage: boolean): ModelDef {
  return {
    id,
    label,
    vendor: 'ByteDance',
    provider: 'fal',
    endpoint,
    capability,
    description: withImage ? 'Animates your image with native audio; optional last frame for exact endings.' : 'Cinematic text-to-video with native audio and strong motion.',
    badges: ['Audio', 'Up to 4K', capability === 'first_last' ? 'First+last frame' : 'Best motion'],
    ...(withImage ? { inputs: { image: 'required' as const, ...(capability === 'first_last' ? { endImage: 'optional' as const } : {}) } } : {}),
    controls: { durations: seedanceDurations, aspects: seedanceAspects, resolutions: ['480p', '720p', '1080p', '4k'], audioToggle: true },
    defaults: { durationS: 5, resolution: '720p', audio: true, aspect: '9:16' },
    price: (p) => {
      const res = p.resolution ?? '720p';
      return { ...perSecond(SEEDANCE_RATES[res] ?? SEEDANCE_RATES['720p']!, nearest(p.durationS, seedanceDurations, 5), res), approx: res === '480p' || res === '4k' };
    },
    etaS: (p) => 60 + nearest(p.durationS, seedanceDurations, 5) * 12,
    buildInput: (p, i) => ({
      prompt: p.prompt,
      resolution: p.resolution ?? '720p',
      duration: String(nearest(p.durationS, seedanceDurations, 5)),
      aspect_ratio: withImage ? (p.aspect ? aspectOr(p.aspect, seedanceAspectAllowed, 'auto') : 'auto') : aspectOr(p.aspect, seedanceAspectAllowed, '9:16'),
      generate_audio: p.audio ?? true,
      ...(withImage && i.image ? { image_url: i.image } : {}),
      ...(withImage && i.endImage ? { end_image_url: i.endImage } : {}),
    }),
    parseOutput: videoOut,
    recommended: capability === 'first_last',
  };
}

const klingV3Durations = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export const VISUAL_MODELS: ModelDef[] = [
  // ---------- Text to video ----------
  {
    id: 'kling-v4-t2v',
    label: 'Kling 4',
    vendor: 'Kling',
    provider: 'fal',
    endpoint: 'kling/v4/text-to-video',
    capability: 't2v',
    description: 'Long, coherent shots up to 30 s in 1080p.',
    badges: ['Up to 30 s', '1080p'],
    controls: { durationRange: [3, 30], aspects: ['9:16', '1:1', '16:9'], resolutions: ['720p', '1080p'] },
    defaults: { durationS: 5, resolution: '1080p', aspect: '9:16' },
    price: (p) => perSecond(p.resolution === '720p' ? 0.157 : 0.235, Math.round(p.durationS ?? 5), p.resolution ?? '1080p'),
    etaS: (p) => 90 + (p.durationS ?? 5) * 10,
    buildInput: (p) => ({
      prompt: p.prompt,
      duration: Math.min(30, Math.max(3, Math.round(p.durationS ?? 5))),
      resolution: p.resolution === '720p' ? '720p' : '1080p',
      aspect_ratio: aspectOr(p.aspect, ['16:9', '9:16', '1:1', '21:9'], '9:16'),
    }),
    parseOutput: videoOut,
    recommended: true,
  },
  {
    id: 'kling-v3-pro-t2v',
    label: 'Kling 3 Pro',
    vendor: 'Kling',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/v3/pro/text-to-video',
    capability: 't2v',
    description: 'Fast, affordable shots with optional native audio.',
    badges: ['Audio', 'Budget'],
    controls: { durations: klingV3Durations, aspects: ['9:16', '1:1', '16:9'], audioToggle: true, negativePrompt: true },
    defaults: { durationS: 5, audio: false, aspect: '9:16' },
    price: (p) => perSecond(p.audio ? 0.168 : 0.112, nearest(p.durationS, klingV3Durations, 5), p.audio ? 'with audio' : 'no audio'),
    etaS: (p) => 60 + (p.durationS ?? 5) * 8,
    buildInput: (p) => ({
      prompt: p.prompt,
      duration: String(nearest(p.durationS, klingV3Durations, 5)),
      generate_audio: p.audio ?? false,
      aspect_ratio: aspectOr(p.aspect, ['16:9', '9:16', '1:1'], '9:16'),
      ...(p.negativePrompt ? { negative_prompt: p.negativePrompt } : {}),
    }),
    parseOutput: videoOut,
  },
  {
    id: 'sora-2-t2v',
    label: 'Sora 2',
    vendor: 'OpenAI',
    provider: 'fal',
    endpoint: 'fal-ai/sora-2/text-to-video',
    capability: 't2v',
    description: 'Realistic scenes with synced sound, 720p.',
    badges: ['Audio', 'Realism'],
    controls: { durations: [4, 8, 12, 16, 20], aspects: ['9:16', '16:9'] },
    defaults: { durationS: 8, aspect: '9:16' },
    price: (p) => perSecond(0.1, nearest(p.durationS, [4, 8, 12, 16, 20], 8), '720p'),
    etaS: (p) => 90 + (p.durationS ?? 8) * 10,
    buildInput: (p) => ({
      prompt: p.prompt,
      resolution: '720p',
      aspect_ratio: aspectOr(p.aspect, ['9:16', '16:9'], '9:16'),
      duration: nearest(p.durationS, [4, 8, 12, 16, 20], 8),
      delete_video: true,
    }),
    parseOutput: videoOut,
  },
  {
    id: 'veo31-fast-t2v',
    label: 'Veo 3.1 Fast',
    vendor: 'Google',
    provider: 'fal',
    endpoint: 'fal-ai/veo3.1/fast',
    capability: 't2v',
    description: 'Quick drafts with native audio, up to 4K.',
    badges: ['Audio', 'Fast', '4K'],
    controls: { durations: [4, 6, 8], aspects: ['9:16', '16:9'], resolutions: ['720p', '1080p', '4k'], audioToggle: true, seed: true, negativePrompt: true },
    defaults: { durationS: 8, resolution: '1080p', audio: true, aspect: '9:16' },
    price: (p) => {
      const k = p.resolution === '4k';
      const rate = k ? (p.audio === false ? 0.3 : 0.35) : p.audio === false ? 0.1 : 0.15;
      return perSecond(rate, nearest(p.durationS, [4, 6, 8], 8), `${p.resolution ?? '1080p'}${p.audio === false ? '' : ' + audio'}`);
    },
    etaS: () => 75,
    buildInput: (p) => ({
      prompt: p.prompt,
      aspect_ratio: aspectOr(p.aspect, ['16:9', '9:16'], '9:16'),
      duration: `${nearest(p.durationS, [4, 6, 8], 8)}s`,
      resolution: p.resolution ?? '1080p',
      generate_audio: p.audio ?? true,
      ...(p.negativePrompt ? { negative_prompt: p.negativePrompt } : {}),
      ...(p.seed != null ? { seed: p.seed } : {}),
    }),
    parseOutput: videoOut,
  },
  seedance('seedance-2-t2v', 'bytedance/seedance-2.0/text-to-video', 't2v', 'Seedance 2.0', false),

  // ---------- Image to video ----------
  {
    id: 'kling-v3-pro-i2v',
    label: 'Kling 3 Pro',
    vendor: 'Kling',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
    capability: 'i2v',
    description: 'Brings product photos to life; supports an end frame.',
    badges: ['Audio', 'End frame'],
    inputs: { image: 'required', endImage: 'optional' },
    controls: { durations: klingV3Durations, audioToggle: true, negativePrompt: true },
    defaults: { durationS: 5, audio: false },
    price: (p) => perSecond(p.audio ? 0.168 : 0.112, nearest(p.durationS, klingV3Durations, 5), p.audio ? 'with audio' : 'no audio'),
    etaS: (p) => 60 + (p.durationS ?? 5) * 8,
    buildInput: (p, i) => ({
      start_image_url: i.image,
      prompt: p.prompt,
      duration: String(nearest(p.durationS, klingV3Durations, 5)),
      generate_audio: p.audio ?? false,
      ...(i.endImage ? { end_image_url: i.endImage } : {}),
      ...(p.negativePrompt ? { negative_prompt: p.negativePrompt } : {}),
    }),
    parseOutput: videoOut,
    recommended: true,
  },
  {
    id: 'veo31-fast-i2v',
    label: 'Veo 3.1 Fast',
    vendor: 'Google',
    provider: 'fal',
    endpoint: 'fal-ai/veo3.1/fast/image-to-video',
    capability: 'i2v',
    description: 'Animates a still with synced sound effects and dialogue.',
    badges: ['Audio', 'Fast'],
    inputs: { image: 'required' },
    controls: { durations: [4, 6, 8], aspects: ['9:16', '16:9'], resolutions: ['720p', '1080p', '4k'], audioToggle: true, seed: true, negativePrompt: true },
    defaults: { durationS: 8, resolution: '1080p', audio: true },
    price: (p) => {
      const k = p.resolution === '4k';
      const rate = k ? (p.audio === false ? 0.3 : 0.35) : p.audio === false ? 0.1 : 0.15;
      return perSecond(rate, nearest(p.durationS, [4, 6, 8], 8), `${p.resolution ?? '1080p'}${p.audio === false ? '' : ' + audio'}`);
    },
    etaS: () => 75,
    buildInput: (p, i) => ({
      prompt: p.prompt,
      image_url: i.image,
      aspect_ratio: p.aspect ? aspectOr(p.aspect, ['16:9', '9:16'], 'auto') : 'auto',
      duration: `${nearest(p.durationS, [4, 6, 8], 8)}s`,
      resolution: p.resolution ?? '1080p',
      generate_audio: p.audio ?? true,
      ...(p.negativePrompt ? { negative_prompt: p.negativePrompt } : {}),
      ...(p.seed != null ? { seed: p.seed } : {}),
    }),
    parseOutput: videoOut,
  },
  {
    id: 'sora-2-i2v',
    label: 'Sora 2',
    vendor: 'OpenAI',
    provider: 'fal',
    endpoint: 'fal-ai/sora-2/image-to-video',
    capability: 'i2v',
    description: 'Realistic motion from a first frame, with sound.',
    badges: ['Audio', 'Realism'],
    inputs: { image: 'required' },
    controls: { durations: [4, 8, 12], aspects: ['9:16', '16:9'] },
    defaults: { durationS: 8 },
    price: (p) => perSecond(0.1, nearest(p.durationS, [4, 8, 12], 8), '720p'),
    etaS: (p) => 90 + (p.durationS ?? 8) * 10,
    buildInput: (p, i) => ({
      prompt: p.prompt,
      image_url: i.image,
      resolution: 'auto',
      aspect_ratio: p.aspect ? aspectOr(p.aspect, ['9:16', '16:9'], 'auto') : 'auto',
      duration: nearest(p.durationS, [4, 8, 12], 8),
      delete_video: true,
    }),
    parseOutput: videoOut,
  },
  seedance('seedance-2-i2v', 'bytedance/seedance-2.0/image-to-video', 'i2v', 'Seedance 2.0', true),
  seedance('seedance-2-first-last', 'bytedance/seedance-2.0/image-to-video', 'first_last', 'Seedance 2.0 (first + last)', true),
  {
    id: 'kling-v3-pro-first-last',
    label: 'Kling 3 Pro (first + last)',
    vendor: 'Kling',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
    capability: 'first_last',
    description: 'Morph from one frame to another; great for reveals.',
    badges: ['End frame', 'Budget'],
    inputs: { image: 'required', endImage: 'optional' },
    controls: { durations: klingV3Durations, audioToggle: true },
    defaults: { durationS: 5, audio: false },
    price: (p) => perSecond(p.audio ? 0.168 : 0.112, nearest(p.durationS, klingV3Durations, 5), p.audio ? 'with audio' : 'no audio'),
    etaS: (p) => 60 + (p.durationS ?? 5) * 8,
    buildInput: (p, i) => ({
      start_image_url: i.image,
      prompt: p.prompt,
      duration: String(nearest(p.durationS, klingV3Durations, 5)),
      generate_audio: p.audio ?? false,
      ...(i.endImage ? { end_image_url: i.endImage } : {}),
    }),
    parseOutput: videoOut,
  },

  // ---------- Video to video ----------
  {
    id: 'lucy-restyle',
    label: 'Lucy Restyle',
    vendor: 'Decart',
    provider: 'fal',
    endpoint: 'decart/lucy-restyle',
    capability: 'v2v',
    description: 'Restyles footage (anime, clay, film looks) while keeping motion.',
    badges: ['Cheap', 'Keeps motion'],
    inputs: { video: 'required' },
    controls: { seed: true },
    defaults: {},
    price: (_p, i) => perSecond(0.01, i.inputDurationS ?? 10),
    etaS: () => 60,
    buildInput: (p, i) => ({ prompt: p.prompt, video_url: i.video, enhance_prompt: true, ...(p.seed != null ? { seed: p.seed } : {}) }),
    parseOutput: videoOut,
    recommended: true,
  },
  {
    id: 'flux3-edit-video',
    label: 'FLUX.3 Video Edit',
    vendor: 'Black Forest Labs',
    provider: 'fal',
    endpoint: 'blackforestlabs/flux-3/edit-video',
    capability: 'video_edit',
    description: 'Describe a change (remove an object, swap the background, change the season).',
    badges: ['Object removal', '720p'],
    inputs: { video: 'required' },
    controls: { maxInputDurationS: 15 },
    defaults: {},
    price: (_p, i) => perSecond(0.03, Math.min(15, i.inputDurationS ?? 10), '720p'),
    etaS: () => 90,
    buildInput: (p, i) => ({ prompt: p.prompt, video_url: i.video }),
    parseOutput: videoOut,
    recommended: true,
  },
  {
    id: 'sync-lipsync-2',
    label: 'Lipsync 2',
    vendor: 'Sync Labs',
    provider: 'fal',
    endpoint: 'fal-ai/sync-lipsync/v2',
    capability: 'lipsync',
    description: 'Matches mouth movement in real footage to new audio. Needs consent from the person shown.',
    badges: ['Real footage', 'Consent required'],
    inputs: { video: 'required', audio: 'required' },
    controls: {},
    defaults: {},
    price: (_p, i) => perSecond(0.05, i.inputDurationS ?? 10),
    etaS: (p) => 60 + (p.durationS ?? 10) * 6,
    buildInput: (_p, i) => ({ video_url: i.video, audio_url: i.audio, model: 'lipsync-2', sync_mode: 'cut_off' }),
    parseOutput: videoOut,
    recommended: true,
  },
  {
    id: 'kling-avatar-v2',
    label: 'Kling AI Avatar 2',
    vendor: 'Kling',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/ai-avatar/v2/standard',
    capability: 'avatar',
    description: 'Talking presenter from a photo and audio. Off by default; real footage converts better.',
    badges: ['Opt-in', 'Consent required'],
    inputs: { image: 'required', audio: 'required' },
    controls: {},
    defaults: {},
    price: (_p, i) => perSecond(0.0562, i.inputDurationS ?? 10),
    etaS: (p) => 90 + (p.durationS ?? 10) * 8,
    buildInput: (p, i) => ({ image_url: i.image, audio_url: i.audio, prompt: p.prompt || '.' }),
    parseOutput: videoOut,
    recommended: true,
  },
  {
    id: 'seedvr-upscale-video',
    label: 'SeedVR2 Upscale',
    vendor: 'ByteDance',
    provider: 'fal',
    endpoint: 'fal-ai/seedvr/upscale/video',
    capability: 'upscale_video',
    description: 'Sharper, cleaner video up to 4K.',
    badges: ['Up to 4K'],
    inputs: { video: 'required' },
    controls: { targetResolutions: ['1080p', '1440p', '2160p'] },
    defaults: { targetResolution: '1080p' },
    price: (p, i) => {
      const target = p.targetResolution ?? '1080p';
      const h = { '720p': 720, '1080p': 1080, '1440p': 1440, '2160p': 2160 }[target];
      const aspect = i.inputWidth && i.inputHeight ? i.inputWidth / i.inputHeight : 9 / 16;
      const short = h;
      const w = aspect >= 1 ? short * aspect : short;
      const hh = aspect >= 1 ? short : short / aspect;
      const frames = (i.inputDurationS ?? 10) * 30;
      const mp = (w * hh * frames) / 1e6;
      return { usd: mp * 0.001, detail: `${Math.round(mp)} megapixels × $0.001`, approx: true };
    },
    etaS: (p) => 120 + (p.durationS ?? 10) * 15,
    buildInput: (p, i) => ({ video_url: i.video, upscale_mode: 'target', target_resolution: p.targetResolution ?? '1080p', output_format: 'X264 (.mp4)', output_quality: 'high' }),
    parseOutput: videoOut,
    recommended: true,
  },
  {
    id: 'bria-video-bg',
    label: 'Bria Video Background Removal',
    vendor: 'Bria',
    provider: 'fal',
    endpoint: 'bria/video/background-removal',
    capability: 'remove_bg_video',
    description: 'Cut out people and products from video (up to 30 s).',
    badges: ['Transparent', 'Max 30 s'],
    inputs: { video: 'required' },
    controls: { maxInputDurationS: 30 },
    defaults: {},
    price: (_p, i) => perSecond(0.14, Math.min(30, i.inputDurationS ?? 10)),
    etaS: () => 90,
    buildInput: (_p, i) => ({ video_url: i.video, output_container_and_codec: 'webm_vp9', preserve_audio: true, background_color: 'Transparent' }),
    parseOutput: videoOut,
    recommended: true,
  },
  {
    id: 'rife-interpolate',
    label: 'RIFE frame interpolation',
    vendor: 'Open source',
    provider: 'fal',
    endpoint: 'fal-ai/rife/video',
    capability: 'interpolate',
    description: 'Adds in-between frames for buttery slow motion.',
    badges: ['Slow motion'],
    inputs: { video: 'required' },
    controls: { slowmoFactors: [2, 3, 4] },
    defaults: { slowmo: 2 },
    price: (_p, i) => ({ usd: Math.max(0.005, (i.inputDurationS ?? 10) * 0.004), detail: 'billed per compute second', approx: true }),
    etaS: () => 60,
    buildInput: (p, i) => ({ video_url: i.video, num_frames: Math.min(4, Math.max(1, p.slowmo ?? 2)), use_scene_detection: true, use_calculated_fps: true }),
    parseOutput: videoOut,
    recommended: true,
  },

  // ---------- Images ----------
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    vendor: 'Google',
    provider: 'fal',
    endpoint: 'fal-ai/nano-banana-2',
    capability: 't2i',
    description: 'Fast, sharp product and lifestyle images with great text rendering.',
    badges: ['Text in image', 'Fast'],
    controls: { aspects: ['9:16', '4:5', '1:1', '16:9'], resolutions: ['1K', '2K', '4K'], maxOutputs: 4, seed: true },
    defaults: { resolution: '1K', aspect: '1:1', numOutputs: 1 },
    price: (p) => {
      const mult = { '0.5K': 0.75, '1K': 1, '2K': 1.5, '4K': 2 }[p.resolution ?? '1K'] ?? 1;
      return { usd: 0.08 * mult * p.numOutputs, detail: `${p.numOutputs} × $${(0.08 * mult).toFixed(3)} (${p.resolution ?? '1K'})`, approx: false };
    },
    etaS: () => 15,
    buildInput: (p) => ({
      prompt: p.prompt,
      num_images: p.numOutputs,
      aspect_ratio: p.aspect ?? 'auto',
      resolution: p.resolution ?? '1K',
      output_format: 'png',
      ...(p.seed != null ? { seed: p.seed } : {}),
    }),
    parseOutput: imagesOut,
    recommended: true,
  },
  {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    vendor: 'Google',
    provider: 'fal',
    endpoint: 'fal-ai/nano-banana-pro',
    capability: 't2i',
    description: 'Highest fidelity Gemini image model for hero shots and posters.',
    badges: ['Hero quality', '4K'],
    controls: { aspects: ['9:16', '4:5', '1:1', '16:9'], resolutions: ['1K', '2K', '4K'], maxOutputs: 4, seed: true },
    defaults: { resolution: '1K', aspect: '1:1', numOutputs: 1 },
    price: (p) => {
      const each = p.resolution === '4K' ? 0.3 : 0.15;
      return { usd: each * p.numOutputs, detail: `${p.numOutputs} × $${each.toFixed(2)}`, approx: false };
    },
    etaS: () => 25,
    buildInput: (p) => ({
      prompt: p.prompt,
      num_images: p.numOutputs,
      aspect_ratio: p.aspect ?? 'auto',
      resolution: p.resolution ?? '1K',
      output_format: 'png',
      ...(p.seed != null ? { seed: p.seed } : {}),
    }),
    parseOutput: imagesOut,
  },
  {
    id: 'seedream-5-lite',
    label: 'Seedream 5 Lite',
    vendor: 'ByteDance',
    provider: 'fal',
    endpoint: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
    capability: 't2i',
    description: 'Very cheap 2K+ images for exploring ideas.',
    badges: ['Budget', '2K+'],
    controls: { aspects: ['9:16', '4:5', '1:1', '16:9'], maxOutputs: 4 },
    defaults: { aspect: '1:1', numOutputs: 1 },
    price: (p) => ({ usd: 0.035 * p.numOutputs, detail: `${p.numOutputs} × $0.035`, approx: false }),
    etaS: () => 20,
    buildInput: (p) => {
      const size = ({ '9:16': [1440, 2560], '4:5': [1920, 2400], '1:1': [2048, 2048], '16:9': [2560, 1440] } as Record<string, [number, number]>)[p.aspect ?? '1:1'] ?? [2048, 2048];
      return { prompt: p.prompt, num_images: p.numOutputs, image_size: { width: size[0], height: size[1] }, output_format: 'png' };
    },
    parseOutput: imagesOut,
  },
  {
    id: 'recraft-v4-pro',
    label: 'Recraft V4 Pro',
    vendor: 'Recraft',
    provider: 'fal',
    endpoint: 'fal-ai/recraft/v4/pro/text-to-image',
    capability: 't2i',
    description: 'Design-led images that follow your brand palette.',
    badges: ['Brand colors', 'Design'],
    controls: { aspects: ['9:16', '4:5', '1:1', '16:9'], brandColors: true },
    defaults: { aspect: '1:1' },
    price: () => ({ usd: 0.25, detail: '1 × $0.25', approx: false }),
    etaS: () => 25,
    buildInput: (p) => ({
      prompt: p.prompt,
      image_size: IMAGE_SIZE_PRESET[p.aspect ?? '1:1'] ?? 'square_hd',
      colors: (p.colors ?? [])
        .map((hex) => /^#?([0-9a-f]{6})$/i.exec(hex)?.[1])
        .filter((h): h is string => !!h)
        .map((h) => ({ r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) })),
    }),
    parseOutput: imagesOut,
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    vendor: 'OpenAI',
    provider: 'fal',
    endpoint: 'openai/gpt-image-2',
    capability: 't2i',
    description: 'Precise prompt following and transparent backgrounds.',
    badges: ['Transparent', 'Precise'],
    controls: { aspects: ['9:16', '4:5', '1:1', '16:9'], maxOutputs: 4, qualities: ['low', 'medium', 'high'] },
    defaults: { aspect: '1:1', quality: 'high', numOutputs: 1 },
    price: (p) => {
      const each = { low: 0.02, medium: 0.07, high: 0.25 }[p.quality ?? 'high'];
      return { usd: each * p.numOutputs, detail: `${p.numOutputs} × ~$${each.toFixed(2)} (${p.quality ?? 'high'} quality, token billed)`, approx: true };
    },
    etaS: (p) => (p.quality === 'low' ? 15 : 45),
    buildInput: (p) => ({
      prompt: p.prompt,
      image_size: IMAGE_SIZE_PRESET[p.aspect ?? '1:1'] ?? 'square_hd',
      quality: p.quality ?? 'high',
      num_images: p.numOutputs,
      output_format: 'png',
    }),
    parseOutput: imagesOut,
  },
  {
    id: 'nano-banana-pro-edit',
    label: 'Nano Banana Pro Edit',
    vendor: 'Google',
    provider: 'fal',
    endpoint: 'fal-ai/nano-banana-pro/edit',
    capability: 'i2i',
    description: 'Edit with words: swap backgrounds, place products in scenes, fix details.',
    badges: ['Up to 8 references'],
    inputs: { image: 'required', references: 7 },
    controls: { aspects: ['9:16', '4:5', '1:1', '16:9'], resolutions: ['1K', '2K', '4K'], maxOutputs: 4 },
    defaults: { resolution: '1K', numOutputs: 1 },
    price: (p) => {
      const each = p.resolution === '4K' ? 0.3 : 0.15;
      return { usd: each * p.numOutputs, detail: `${p.numOutputs} × $${each.toFixed(2)}`, approx: false };
    },
    etaS: () => 25,
    buildInput: (p, i) => ({
      prompt: p.prompt,
      image_urls: [i.image, ...(i.references ?? [])].filter(Boolean),
      num_images: p.numOutputs,
      aspect_ratio: p.aspect ?? 'auto',
      resolution: p.resolution ?? '1K',
      output_format: 'png',
    }),
    parseOutput: imagesOut,
    recommended: true,
  },
  {
    id: 'seedvr-upscale-image',
    label: 'SeedVR2 Image Upscale',
    vendor: 'ByteDance',
    provider: 'fal',
    endpoint: 'fal-ai/seedvr/upscale/image',
    capability: 'upscale_image',
    description: 'Upscale up to 4× with restored detail.',
    badges: ['Up to 4×'],
    inputs: { image: 'required' },
    controls: { upscaleFactors: [2, 3, 4] },
    defaults: { upscaleFactor: 2 },
    price: (p, i) => {
      const f = p.upscaleFactor ?? 2;
      const mp = ((i.inputWidth ?? 1024) * f * (i.inputHeight ?? 1024) * f) / 1e6;
      return { usd: Math.max(0.001, mp * 0.001), detail: `${mp.toFixed(1)} MP × $0.001`, approx: !i.inputWidth };
    },
    etaS: () => 20,
    buildInput: (p, i) => ({ image_url: i.image, upscale_mode: 'factor', upscale_factor: p.upscaleFactor ?? 2, output_format: 'png' }),
    parseOutput: imagesOut,
    recommended: true,
  },
  {
    id: 'birefnet-v2',
    label: 'BiRefNet v2',
    vendor: 'Open source',
    provider: 'fal',
    endpoint: 'fal-ai/birefnet/v2',
    capability: 'remove_bg_image',
    description: 'Clean cutouts for products and people.',
    badges: ['Transparent PNG'],
    inputs: { image: 'required' },
    controls: {},
    defaults: {},
    price: () => ({ usd: 0.002, detail: 'billed per compute second', approx: true }),
    etaS: () => 8,
    buildInput: (_p, i) => ({ image_url: i.image, model: 'General Use (Heavy)', operating_resolution: '2048x2048', output_format: 'png', refine_foreground: true }),
    parseOutput: imagesOut,
    recommended: true,
  },

  {
    id: 'depth-anything-v2',
    label: 'Depth Anything v2',
    vendor: 'Open source',
    provider: 'fal',
    endpoint: 'fal-ai/image-preprocessors/depth-anything/v2',
    capability: 'depth',
    description: 'Estimates a depth map from a photo, used for 3D parallax moves.',
    badges: ['Depth map'],
    inputs: { image: 'required' },
    controls: {},
    defaults: {},
    price: () => ({ usd: 0.001, detail: 'billed per compute second', approx: true }),
    etaS: () => 10,
    buildInput: (_p, i) => ({ image_url: i.image }),
    parseOutput: imagesOut,
    recommended: true,
  },

  // ---------- 3D ----------
  {
    id: 'hunyuan3d-21',
    label: 'Hunyuan3D 2.1',
    vendor: 'Tencent',
    provider: 'fal',
    endpoint: 'fal-ai/hunyuan3d-v21',
    capability: 'image_to_3d',
    description: 'Turns a product photo into a GLB model for the 3D studio.',
    badges: ['GLB', 'PBR textures'],
    inputs: { image: 'required' },
    controls: { texturedToggle: true, seed: true },
    defaults: { textured: true },
    price: (p) => ({ usd: p.textured === false ? 0.3 : 0.9, detail: p.textured === false ? 'untextured mesh' : 'textured mesh (3× base)', approx: false }),
    etaS: (p) => (p.textured === false ? 60 : 150),
    buildInput: (p, i) => ({ input_image_url: i.image, textured_mesh: p.textured !== false, ...(p.seed != null ? { seed: p.seed } : {}) }),
    parseOutput: (data) => {
      const url = (get(data, 'model_glb_pbr.url') ?? get(data, 'model_glb.url')) as string | undefined;
      return url ? [{ url, kind: 'model3d', contentType: 'model/gltf-binary' }] : [];
    },
    recommended: true,
  },
];
