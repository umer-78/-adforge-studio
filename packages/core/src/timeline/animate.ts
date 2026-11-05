import { clamp } from '../utils';
import type { AnimatableProp, AudioSettings, Clip, EasingId, Keyframe, TimedMediaClip, Track, Transform } from './schema';

const c1 = 1.70158;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

export const easings: Record<EasingId, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  easeInBack: (t) => c3 * t * t * t - c1 * t * t,
  easeOutBack: (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  easeOutElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1),
  easeOutBounce: bounceOut,
  hold: (t) => (t < 1 ? 0 : 1),
};

export function ease(id: EasingId, t: number): number {
  return easings[id](clamp(t, 0, 1));
}

/** Value of a keyframed property at a clip-relative frame. */
export function interpolateKeyframes(keyframes: readonly Keyframe[] | undefined, frame: number, fallback: number): number {
  if (!keyframes || keyframes.length === 0) return fallback;
  const sorted = keyframes.length > 1 ? [...keyframes].sort((a, b) => a.frame - b.frame) : keyframes;
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (frame >= a.frame && frame <= b.frame) {
      const span = b.frame - a.frame || 1;
      return a.value + (b.value - a.value) * ease(a.easing, (frame - a.frame) / span);
    }
  }
  return last.value;
}

const TRANSFORM_PROPS: Record<AnimatableProp, keyof Transform | null> = {
  x: 'x',
  y: 'y',
  scale: 'scale',
  rotation: 'rotation',
  opacity: 'opacity',
  volume: null,
  blur: null,
};

/** Transform with keyframes applied at a clip-relative frame. */
export function transformAt(clip: Clip, localFrame: number): Transform & { blur: number } {
  const t = { ...clip.transform, blur: 0 };
  for (const [prop, kfs] of Object.entries(clip.keyframes) as [AnimatableProp, Keyframe[]][]) {
    if (!kfs?.length) continue;
    if (prop === 'blur') {
      t.blur = interpolateKeyframes(kfs, localFrame, 0);
      continue;
    }
    const key = TRANSFORM_PROPS[prop];
    if (key) (t as Record<string, unknown>)[key] = interpolateKeyframes(kfs, localFrame, t[key] as number);
  }
  return t;
}

/**
 * Cumulative source seconds consumed at the end of each timeline frame for
 * clips with a speed ramp. Index i is the source offset at local frame i.
 */
export function buildTimeMap(clip: TimedMediaClip, fps: number): Float64Array {
  const n = clip.duration + 1;
  const map = new Float64Array(n);
  const ramp = 'speedRamp' in clip ? [...clip.speedRamp].sort((a, b) => a.at - b.at) : [];
  const speedAt = (p: number) => {
    if (!ramp.length) return clip.speed;
    const first = ramp[0]!;
    const last = ramp[ramp.length - 1]!;
    if (p <= first.at) return first.speed;
    if (p >= last.at) return last.speed;
    for (let i = 0; i < ramp.length - 1; i++) {
      const a = ramp[i]!;
      const b = ramp[i + 1]!;
      if (p >= a.at && p <= b.at) return a.speed + (b.speed - a.speed) * ((p - a.at) / (b.at - a.at || 1));
    }
    return last.speed;
  };
  for (let i = 1; i < n; i++) {
    const p = (i - 0.5) / clip.duration;
    map[i] = map[i - 1]! + speedAt(p) / fps;
  }
  return map;
}

/** Seconds of source media consumed by the whole clip. */
export function sourceSpan(clip: TimedMediaClip, fps: number): number {
  if (clip.type === 'video' && clip.freezeAt != null) return 0;
  if (clip.type === 'video' && clip.speedRamp.length) {
    const map = buildTimeMap(clip, fps);
    return map[map.length - 1]!;
  }
  return (clip.duration / fps) * clip.speed;
}

/** Source time in seconds shown at a clip-relative frame. */
export function sourceTimeAt(clip: TimedMediaClip, localFrame: number, fps: number, timeMap?: Float64Array): number {
  if (clip.type === 'video' && clip.freezeAt != null) return clip.freezeAt;
  const f = clamp(localFrame, 0, clip.duration);
  let consumed: number;
  if (clip.type === 'video' && clip.speedRamp.length) {
    const map = timeMap ?? buildTimeMap(clip, fps);
    consumed = map[Math.floor(f)] ?? 0;
  } else {
    consumed = (f / fps) * clip.speed;
  }
  if (clip.type === 'video' && clip.reverse) return clip.trimStart + sourceSpan(clip, fps) - consumed;
  return clip.trimStart + consumed;
}

export function needsTimeRemap(clip: TimedMediaClip): boolean {
  return clip.type === 'video' && (clip.reverse || clip.freezeAt != null || clip.speedRamp.length > 0);
}

export type FrameRange = readonly [number, number];

/** Merged frame ranges where voice clips play, used to duck music. */
export function voiceRegions(tracks: readonly Track[], isVoice: (clip: Clip) => boolean): FrameRange[] {
  const ranges: [number, number][] = [];
  for (const track of tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (isVoice(clip)) ranges.push([clip.start, clip.start + clip.duration]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 6) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** Volume multiplier for a ducked clip at an absolute timeline frame. */
export function duckingGain(frame: number, regions: readonly FrameRange[], amount: number, rampFrames: number): number {
  let gain = 1;
  for (const [a, b] of regions) {
    if (frame < a - rampFrames || frame > b + rampFrames) continue;
    let depth: number;
    if (frame < a) depth = (frame - (a - rampFrames)) / rampFrames;
    else if (frame > b) depth = 1 - (frame - b) / rampFrames;
    else depth = 1;
    gain = Math.min(gain, 1 - amount * clamp(depth, 0, 1));
  }
  return gain;
}

/** Linear gain for an audio-bearing clip at a clip-relative frame. */
export function clipGainAt(
  clip: Clip & { audio: AudioSettings },
  localFrame: number,
  fps: number,
  opts: { trackVolume?: number; masterVolume?: number; duck?: number } = {},
): number {
  const a = clip.audio;
  if (a.muted) return 0;
  let gain = interpolateKeyframes(clip.keyframes.volume, localFrame, a.volume);
  const t = localFrame / fps;
  const total = clip.duration / fps;
  if (a.fadeIn > 0 && t < a.fadeIn) gain *= t / a.fadeIn;
  if (a.fadeOut > 0 && t > total - a.fadeOut) gain *= Math.max(0, (total - t) / a.fadeOut);
  gain *= (opts.trackVolume ?? 1) * (opts.masterVolume ?? 1) * (opts.duck ?? 1);
  return clamp(gain, 0, 4);
}
