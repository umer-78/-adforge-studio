import { clipGainAt, duckingGain, type AudioSettings, type Clip, type FrameRange, type ResolvedAsset } from '@adforge/core';

export interface AudioMix {
  masterVolume: number;
  duckAmount: number;
  /** Frames where voice plays, merged. */
  voice: readonly FrameRange[];
  rampFrames: number;
}

type AudioClipLike = Clip & { audio: AudioSettings };

function roleOf(clip: AudioClipLike, asset: ResolvedAsset | null | undefined): 'voice' | 'music' | 'sfx' | 'other' {
  if (clip.audio.role !== 'auto') return clip.audio.role;
  return asset?.role ?? 'other';
}

export function isVoiceClip(clip: Clip, asset: ResolvedAsset | null | undefined): boolean {
  if (clip.type !== 'audio' && clip.type !== 'video') return false;
  return roleOf(clip, asset) === 'voice';
}

/** Music ducks under voice automatically; any clip can opt in with the duck switch. */
export function ducks(clip: AudioClipLike, asset: ResolvedAsset | null | undefined): boolean {
  return clip.audio.duck || roleOf(clip, asset) === 'music';
}

/** Linear volume of a clip at a clip-relative frame, including fades, keyframes, track, master and ducking. */
export function clipVolume(
  clip: AudioClipLike,
  asset: ResolvedAsset | null | undefined,
  frame: number,
  fps: number,
  trackVolume: number,
  mix: AudioMix,
  extra = 1,
): number {
  const local = Math.min(frame, clip.duration - 1);
  const duck = ducks(clip, asset) ? duckingGain(clip.start + frame, mix.voice, mix.duckAmount, mix.rampFrames) : 1;
  return clipGainAt(clip, local, fps, { trackVolume, masterVolume: mix.masterVolume, duck }) * extra;
}
