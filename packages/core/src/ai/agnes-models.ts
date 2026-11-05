import type { AspectRatio } from '../constants';
import { get, nearest, type Capability, type GenParams, type ModelDef, type OutputFile, type ResolvedInputs } from './models';
import { expandReferences } from './references';

/*
 * Agnes AI models (agnes-ai.com). Prices are list prices converted to USD and marked approximate:
 * Agnes bills in its own currency and runs free promotions (Flash video and all images were free
 * in October 2026), so the estimate is the most you would pay.
 */

const VIDEO_SECONDS = [4, 5, 6, 7, 8, 9, 10, 11, 12];
const VIDEO_RATE_USD: Record<string, number> = { '720P': 0.021, '1080P': 0.035, '2K': 0.049 };
const IMAGE_USD: Record<string, number> = { '1K': 0.01, '2K': 0.018, '3K': 0.021, '4K': 0.024 };
const ASPECTS: AspectRatio[] = ['9:16', '1:1', '4:5', '16:9'];

/** Agnes has no 4:5; 3:4 is the closest portrait shape. */
const agnesAspect = (aspect: string | undefined) => (aspect === '4:5' ? '3:4' : aspect && ['9:16', '1:1', '16:9', '21:9', '4:3', '3:4'].includes(aspect) ? aspect : '9:16');

const videoOut = (data: unknown): OutputFile[] => {
  const url = get(data, 'url');
  return typeof url === 'string' ? [{ url, kind: 'video', contentType: 'video/mp4' }] : [];
};

const imagesOut = (data: unknown): OutputFile[] => {
  const list = get(data, 'data');
  return (Array.isArray(list) ? list : [])
    .map((d) => (d as { url?: string | null }).url)
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .map((url) => ({ url, kind: 'image' as const }));
};

function referenceMode(i: ResolvedInputs, flash: boolean) {
  const images = (i.references ?? []).slice(0, flash ? 5 : 8);
  const audios = (i.referenceAudios?.length ? i.referenceAudios : i.audio ? [i.audio] : []).slice(0, 3);
  const video = !flash && i.video ? i.video : null;
  return { images, audios, video, any: images.length > 0 || audios.length > 0 || !!video };
}

function agnesVideo(id: string, endpoint: string, capability: Capability, flash: boolean): ModelDef {
  const sizes = flash ? ['720P'] : ['720P', '1080P', '2K'];
  const label = `Agnes Video 2.5${flash ? ' Flash' : ''}`;
  const seconds = (p: GenParams) => nearest(p.durationS, VIDEO_SECONDS, 5);
  const size = (p: GenParams) => (flash ? '720P' : sizes.includes(p.resolution ?? '') ? p.resolution! : '720P');
  return {
    id,
    label,
    vendor: 'Agnes AI',
    provider: 'agnes',
    endpoint,
    capability,
    description:
      capability === 't2v'
        ? `Text to video, or tag up to ${flash ? 5 : 8} reference images, 3 audio clips${flash ? '' : ' and 1 video'} in the prompt with @image1, @audio1${flash ? '' : ', @video1'}.`
        : capability === 'i2v'
          ? 'Animates your start frame.'
          : 'Animates between a first and a last frame.',
    badges: [flash ? 'Fast' : 'Up to 2K', ...(capability === 't2v' ? ['Reference board'] : []), 'Keyframes'],
    inputs:
      capability === 't2v'
        ? { references: flash ? 5 : 8, audioReferences: 3, ...(flash ? {} : { video: 'optional' as const }) }
        : capability === 'i2v'
          ? { image: 'required' }
          : { image: 'required', endImage: 'optional' },
    controls: { durations: VIDEO_SECONDS, aspects: ASPECTS, resolutions: sizes, seed: true, ...(capability === 't2v' && !flash ? { maxInputDurationS: 12 } : {}) },
    defaults: { durationS: 5, resolution: '720P', aspect: '9:16' },
    price: (p, i) => {
      const s = seconds(p);
      const res = size(p);
      const rate = VIDEO_RATE_USD[res] ?? VIDEO_RATE_USD['720P']!;
      const ref = capability === 't2v' ? referenceMode(i, flash) : null;
      const inputVideoS = ref?.video ? Math.min(12, i.inputDurationS ?? 0) : 0;
      const extraImages = Math.max(0, (ref?.images.length ?? 0) - 5);
      const usd = (s + inputVideoS) * rate + extraImages * 0.004;
      return { usd, detail: `${s + inputVideoS} s × $${rate}/s (${res}, Agnes list price${flash ? '; Flash is free during its promotion' : ''})`, approx: true };
    },
    etaS: (p) => 60 + seconds(p) * 10,
    buildInput: (p, i) => {
      const body: Record<string, unknown> = {
        model: endpoint,
        prompt: expandReferences(p.prompt, 'agnes'),
        seconds: String(seconds(p)),
        size: size(p),
        aspect_ratio: agnesAspect(p.aspect),
        n: 1,
        ...(p.seed != null ? { seed: p.seed } : {}),
      };
      if (capability === 'i2v' || capability === 'first_last') {
        return { ...body, mode: 'keyframe', first_frame: i.image, ...(capability === 'first_last' && i.endImage ? { last_frame: i.endImage } : {}) };
      }
      const ref = referenceMode(i, flash);
      if (!ref.any) return { ...body, mode: 'text' };
      return {
        ...body,
        mode: 'reference',
        ...(ref.images.length ? { images: ref.images } : {}),
        ...(ref.audios.length ? { audios: ref.audios } : {}),
        ...(ref.video ? { videos: [{ url: ref.video, start_seconds: 0, require_audio: false }] } : {}),
      };
    },
    parseOutput: videoOut,
    recommended: false,
  };
}

function agnesImage(id: string, capability: Capability): ModelDef {
  const edit = capability === 'i2i';
  const tier = (p: GenParams) => (p.resolution && IMAGE_USD[p.resolution] != null ? p.resolution : '2K');
  return {
    id,
    label: edit ? 'Agnes Image 2.5 Flash Edit' : 'Agnes Image 2.5 Flash',
    vendor: 'Agnes AI',
    provider: 'agnes',
    endpoint: 'agnes-image-2.5-flash',
    capability,
    description: edit
      ? 'Edits your image with words; add more images to composite a product into a scene.'
      : 'Sharp product and lifestyle stills up to 4K; attach references to composite several images.',
    badges: ['Up to 4K', 'Multi-image'],
    inputs: edit ? { image: 'required', references: 7 } : { references: 8 },
    controls: { aspects: ASPECTS, resolutions: ['1K', '2K', '3K', '4K'], maxOutputs: 1 },
    defaults: { resolution: '2K', aspect: '9:16' },
    price: (p, i) => {
      const t = tier(p);
      const inputs = (edit ? 1 : 0) + (i.references?.length ?? 0);
      const usd = IMAGE_USD[t]! + Math.max(0, inputs - 3) * 0.003;
      return { usd, detail: `1 image at ${t} (Agnes list price; images are free during its promotion)`, approx: true };
    },
    etaS: (p) => (tier(p) === '4K' || tier(p) === '3K' ? 45 : 25),
    buildInput: (p, i) => {
      const images = [...(edit && i.image ? [i.image] : []), ...(i.references ?? [])];
      // Numbered tokens follow the order Agnes receives the images in; the edited image is image 1.
      const prompt = p.prompt.replace(/@image([1-9])\b/gi, (_m, n: string) => `image ${Number(n) + (edit ? 1 : 0)}`);
      return {
        model: 'agnes-image-2.5-flash',
        prompt: expandReferences(prompt, 'natural'),
        size: tier(p),
        ratio: agnesAspect(p.aspect),
        extra_body: { response_format: 'url', ...(images.length ? { image: images } : {}) },
      };
    },
    parseOutput: imagesOut,
    recommended: false,
  };
}

export const AGNES_MODELS: ModelDef[] = [
  agnesVideo('agnes-video-2.5-flash-t2v', 'agnes-video-2.5-flash', 't2v', true),
  agnesVideo('agnes-video-2.5-t2v', 'agnes-video-2.5', 't2v', false),
  agnesVideo('agnes-video-2.5-flash-i2v', 'agnes-video-2.5-flash', 'i2v', true),
  agnesVideo('agnes-video-2.5-i2v', 'agnes-video-2.5', 'i2v', false),
  agnesVideo('agnes-video-2.5-flash-first-last', 'agnes-video-2.5-flash', 'first_last', true),
  agnesVideo('agnes-video-2.5-first-last', 'agnes-video-2.5', 'first_last', false),
  agnesImage('agnes-image-2.5-flash-t2i', 't2i'),
  agnesImage('agnes-image-2.5-flash-edit', 'i2i'),
];
