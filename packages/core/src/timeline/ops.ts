import { clamp, uid } from '../utils';
import { sourceSpan } from './animate';
import { defaultEffectParams, TRANSITIONS_BY_ID } from './catalog';

import {
  clipSchema,
  timelineDataSchema,
  trackSchema,
  type AnimatableProp,
  type Clip,
  type ClipDraft,
  type EasingId,
  type EffectInstance,
  type Keyframe,
  type Marker,
  type TimelineData,
  type Track,
  type TrackKind,
  type Transition,
} from './schema';

/**
 * Timeline operations mutate the timeline passed in. The editor calls them on
 * an Immer draft; server code calls them on a structured clone.
 */

/**
 * Deep copy that also works on Immer drafts, which structuredClone rejects. Timeline
 * documents are plain JSON, so nothing is lost.
 */
function copyClip(clip: Clip): Clip {
  return JSON.parse(JSON.stringify(clip)) as Clip;
}

export const secondsToFrames = (seconds: number, fps: number) => Math.round(seconds * fps);
export const framesToSeconds = (frames: number, fps: number) => frames / fps;

export function createTimeline(opts: { fps?: number; width?: number; height?: number; background?: string } = {}): TimelineData {
  return timelineDataSchema.parse({
    fps: opts.fps ?? 30,
    width: opts.width ?? 1080,
    height: opts.height ?? 1920,
    background: opts.background ?? '#000000',
    tracks: [
      { id: uid('trk_'), kind: 'text', name: 'Text' },
      { id: uid('trk_'), kind: 'video', name: 'Video 1' },
      { id: uid('trk_'), kind: 'audio', name: 'Voice' },
      { id: uid('trk_'), kind: 'audio', name: 'Music' },
    ],
  });
}

export function makeTrack(kind: TrackKind, name?: string): Track {
  return trackSchema.parse({ id: uid('trk_'), kind, name: name ?? defaultTrackName(kind) });
}

function defaultTrackName(kind: TrackKind): string {
  return { video: 'Video', audio: 'Audio', text: 'Text', overlay: 'Overlay' }[kind];
}

export function makeClip(input: ClipDraft): Clip {
  return clipSchema.parse({ id: uid('clp_'), ...input });
}

export function timelineDuration(tl: TimelineData): number {
  let end = 0;
  for (const t of tl.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration);
  return Math.max(end, 1);
}

export function findTrack(tl: TimelineData, trackId: string): Track | undefined {
  return tl.tracks.find((t) => t.id === trackId);
}

export function findClip(tl: TimelineData, clipId: string): { track: Track; clip: Clip; index: number } | null {
  for (const track of tl.tracks) {
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index >= 0) return { track, clip: track.clips[index]!, index };
  }
  return null;
}

function requireClip(tl: TimelineData, clipId: string) {
  const found = findClip(tl, clipId);
  if (!found) throw new Error(`Clip ${clipId} not found`);
  return found;
}

export function sortClips(track: Track) {
  track.clips.sort((a, b) => a.start - b.start);
}

/** Which clip kinds a track kind accepts. */
export function trackAccepts(kind: TrackKind, type: Clip['type']): boolean {
  switch (kind) {
    case 'video':
      return type === 'video' || type === 'image' || type === 'adjustment' || type === 'shape' || type === 'motion';
    case 'audio':
      return type === 'audio';
    case 'text':
      return type === 'text' || type === 'captions';
    case 'overlay':
      return type !== 'audio';
  }
}

export function preferredTrackKind(type: Clip['type']): TrackKind {
  if (type === 'audio') return 'audio';
  if (type === 'text' || type === 'captions') return 'text';
  if (type === 'shape' || type === 'motion') return 'overlay';
  return 'video';
}

function overlaps(track: Track, start: number, duration: number, ignoreId?: string): boolean {
  const end = start + duration;
  return track.clips.some((c) => c.id !== ignoreId && start < c.start + c.duration && c.start < end);
}

/** First frame at or after `from` where a clip of `duration` fits on the track. */
export function firstFreeStart(track: Track, from: number, duration: number, ignoreId?: string): number {
  let start = Math.max(0, from);
  const clips = track.clips.filter((c) => c.id !== ignoreId).sort((a, b) => a.start - b.start);
  for (const c of clips) {
    if (start + duration <= c.start) break;
    if (start < c.start + c.duration) start = c.start + c.duration;
  }
  return start;
}

export function addTrack(tl: TimelineData, kind: TrackKind, opts: { name?: string; index?: number } = {}): Track {
  const track = makeTrack(kind, opts.name);
  const index = opts.index ?? defaultTrackIndex(tl, kind);
  tl.tracks.splice(clamp(index, 0, tl.tracks.length), 0, track);
  return track;
}

function defaultTrackIndex(tl: TimelineData, kind: TrackKind): number {
  if (kind === 'audio') return tl.tracks.length;
  if (kind === 'text' || kind === 'overlay') return 0;
  const firstAudio = tl.tracks.findIndex((t) => t.kind === 'audio');
  return firstAudio === -1 ? tl.tracks.length : firstAudio;
}

export function removeTrack(tl: TimelineData, trackId: string) {
  tl.tracks = tl.tracks.filter((t) => t.id !== trackId);
}

/**
 * Adds a clip. When the slot is taken the clip moves to the next free spot on
 * the same track, or to a new track when `newTrackOnConflict` is set.
 */
export function addClip(
  tl: TimelineData,
  clip: Clip,
  opts: { trackId?: string; newTrackOnConflict?: boolean } = {},
): { trackId: string; clip: Clip } {
  let track = opts.trackId ? findTrack(tl, opts.trackId) : undefined;
  if (track && !trackAccepts(track.kind, clip.type)) track = undefined;
  if (!track) {
    const kind = preferredTrackKind(clip.type);
    track = tl.tracks.find((t) => t.kind === kind && !t.locked && !overlaps(t, clip.start, clip.duration)) ?? addTrack(tl, kind);
  }
  if (overlaps(track, clip.start, clip.duration)) {
    if (opts.newTrackOnConflict) {
      const index = tl.tracks.indexOf(track);
      track = addTrack(tl, track.kind, { index });
    } else {
      clip.start = firstFreeStart(track, clip.start, clip.duration);
    }
  }
  track.clips.push(clip);
  sortClips(track);
  return { trackId: track.id, clip };
}

export function removeClip(tl: TimelineData, clipId: string, opts: { ripple?: boolean } = {}) {
  const { track, clip, index } = requireClip(tl, clipId);
  track.clips.splice(index, 1);
  if (opts.ripple) {
    for (const c of track.clips) if (c.start >= clip.start + clip.duration) c.start -= clip.duration;
  }
}

export function moveClip(tl: TimelineData, clipId: string, to: { start: number; trackId?: string }): boolean {
  const { track, clip, index } = requireClip(tl, clipId);
  const target = to.trackId ? findTrack(tl, to.trackId) : track;
  if (!target || target.locked || !trackAccepts(target.kind, clip.type)) return false;
  const start = Math.max(0, Math.round(to.start));
  if (overlaps(target, start, clip.duration, clip.id)) return false;
  if (target !== track) {
    track.clips.splice(index, 1);
    target.clips.push(clip);
  }
  clip.start = start;
  sortClips(target);
  return true;
}

/** Longest the clip can be on the timeline given its source length. */
export function maxClipDuration(clip: Clip, fps: number, sourceDurationS?: number | null): number {
  if ((clip.type === 'video' || clip.type === 'audio') && sourceDurationS) {
    if (clip.type === 'video' && clip.freezeAt != null) return Number.MAX_SAFE_INTEGER;
    const remaining = clip.type === 'video' && clip.reverse ? sourceDurationS : sourceDurationS - clip.trimStart;
    return Math.max(1, Math.floor((remaining / clip.speed) * fps));
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Moves one edge of a clip by `delta` frames, keeping media in sync. */
export function trimClip(
  tl: TimelineData,
  clipId: string,
  edge: 'start' | 'end',
  delta: number,
  sourceDurationS?: number | null,
): void {
  const { track, clip } = requireClip(tl, clipId);
  const fps = tl.fps;
  const others = track.clips.filter((c) => c.id !== clip.id);
  if (edge === 'end') {
    const prevEnd = clip.start + clip.duration;
    const nextStart = Math.min(...others.filter((c) => c.start >= prevEnd).map((c) => c.start), Number.MAX_SAFE_INTEGER);
    const max = Math.min(maxClipDuration(clip, fps, sourceDurationS), nextStart - clip.start);
    clip.duration = clamp(clip.duration + Math.round(delta), 1, max);
    return;
  }
  const prevEnd = Math.max(0, ...others.filter((c) => c.start + c.duration <= clip.start).map((c) => c.start + c.duration));
  let d = Math.round(delta);
  d = Math.max(d, prevEnd - clip.start);
  d = Math.min(d, clip.duration - 1);
  if (clip.type === 'video' || clip.type === 'audio') {
    const secs = (d / fps) * clip.speed;
    if (clip.trimStart + secs < 0) d = Math.ceil((-clip.trimStart / clip.speed) * fps);
    clip.trimStart = Math.max(0, clip.trimStart + (d / fps) * clip.speed);
  }
  if (clip.type === 'captions') shiftCaptionWords(clip, -d / fps);
  shiftKeyframes(clip, -d);
  clip.start += d;
  clip.duration -= d;
}

function shiftKeyframes(clip: Clip, deltaFrames: number) {
  for (const prop of Object.keys(clip.keyframes) as AnimatableProp[]) {
    const kfs = clip.keyframes[prop];
    if (!kfs) continue;
    clip.keyframes[prop] = kfs.map((k) => ({ ...k, frame: k.frame + deltaFrames })).filter((k) => k.frame >= 0);
  }
}

function shiftCaptionWords(clip: Extract<Clip, { type: 'captions' }>, deltaSeconds: number) {
  clip.words = clip.words
    .map((w) => ({ ...w, start: w.start + deltaSeconds, end: w.end + deltaSeconds }))
    .filter((w) => w.end > 0);
}

/** Splits a clip at an absolute timeline frame. Returns the new right-hand clip. */
export function splitClip(tl: TimelineData, clipId: string, atFrame: number): Clip | null {
  const { track, clip } = requireClip(tl, clipId);
  const local = Math.round(atFrame - clip.start);
  if (local <= 0 || local >= clip.duration) return null;
  const right = copyClip(clip);
  right.id = uid('clp_');
  right.start = clip.start + local;
  right.duration = clip.duration - local;
  right.transitionIn = null;
  clip.duration = local;
  clip.transitionOut = null;
  if ((right.type === 'video' || right.type === 'audio') && (clip.type === 'video' || clip.type === 'audio')) {
    if (right.type === 'video' && right.speedRamp.length) right.speedRamp = [];
    if (right.type === 'video' && right.reverse) {
      clip.trimStart = clip.trimStart + (right.duration / tl.fps) * clip.speed;
    } else {
      right.trimStart = clip.trimStart + (local / tl.fps) * clip.speed;
    }
    if (clip.type === 'video' && clip.speedRamp.length) clip.speedRamp = [];
  }
  if (right.type === 'captions' && clip.type === 'captions') {
    const cut = local / tl.fps;
    clip.words = clip.words.filter((w) => w.start < cut);
    right.words = right.words.filter((w) => w.end > cut).map((w) => ({ ...w, start: Math.max(0, w.start - cut), end: w.end - cut }));
  }
  for (const prop of Object.keys(clip.keyframes) as AnimatableProp[]) {
    const kfs = clip.keyframes[prop] ?? [];
    clip.keyframes[prop] = kfs.filter((k) => k.frame <= local);
    right.keyframes[prop] = kfs.filter((k) => k.frame >= local).map((k) => ({ ...k, frame: k.frame - local }));
  }
  track.clips.push(right);
  sortClips(track);
  return right;
}

/** Changes playback speed while keeping the same source range. */
export function setSpeed(tl: TimelineData, clipId: string, speed: number) {
  const { clip } = requireClip(tl, clipId);
  if (clip.type !== 'video' && clip.type !== 'audio') return;
  const next = clamp(speed, clip.type === 'audio' ? 0.25 : 0.1, clip.type === 'audio' ? 4 : 16);
  const span = sourceSpan(clip, tl.fps);
  clip.speed = next;
  if (clip.type === 'video') clip.speedRamp = [];
  clip.duration = Math.max(1, Math.round((span / next) * tl.fps));
}

export function duplicateClip(tl: TimelineData, clipId: string): Clip {
  const { track, clip } = requireClip(tl, clipId);
  const copy = copyClip(clip);
  copy.id = uid('clp_');
  copy.start = firstFreeStart(track, clip.start + clip.duration, clip.duration);
  track.clips.push(copy);
  sortClips(track);
  return copy;
}

export function updateClip(tl: TimelineData, clipId: string, patch: Record<string, unknown>) {
  const { clip } = requireClip(tl, clipId);
  deepAssign(clip as unknown as Record<string, unknown>, patch);
}

function deepAssign(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'type') continue;
    const current = target[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current)) {
      deepAssign(current as Record<string, unknown>, value as Record<string, unknown>);
    } else if (value !== undefined) {
      target[key] = value;
    }
  }
}

export function setKeyframe(tl: TimelineData, clipId: string, prop: AnimatableProp, frame: number, value: number, easing: EasingId = 'easeInOut') {
  const { clip } = requireClip(tl, clipId);
  const f = clamp(Math.round(frame), 0, clip.duration);
  const list: Keyframe[] = (clip.keyframes[prop] ?? []).filter((k) => k.frame !== f);
  list.push({ frame: f, value, easing });
  list.sort((a, b) => a.frame - b.frame);
  clip.keyframes[prop] = list;
}

export function removeKeyframe(tl: TimelineData, clipId: string, prop: AnimatableProp, frame: number) {
  const { clip } = requireClip(tl, clipId);
  const list = (clip.keyframes[prop] ?? []).filter((k) => k.frame !== frame);
  if (list.length) clip.keyframes[prop] = list;
  else delete clip.keyframes[prop];
}

export function addEffect(tl: TimelineData, clipId: string, type: string, params: Record<string, number | string | boolean> = {}): EffectInstance {
  const { clip } = requireClip(tl, clipId);
  const effect: EffectInstance = { id: uid('fx_'), type, enabled: true, params: { ...defaultEffectParams(type), ...params } };
  clip.effects.push(effect);
  return effect;
}

export function removeEffect(tl: TimelineData, clipId: string, effectId: string) {
  const { clip } = requireClip(tl, clipId);
  clip.effects = clip.effects.filter((e) => e.id !== effectId);
}

/**
 * Sets an in/out transition. Pair transitions do not move clips: the outgoing
 * clip keeps playing past its out point underneath the incoming clip.
 */
export function setTransition(tl: TimelineData, clipId: string, edge: 'in' | 'out', transition: Transition | null) {
  const { clip } = requireClip(tl, clipId);
  if (transition) transition.duration = clamp(transition.duration, 1, clip.duration);
  if (edge === 'in') clip.transitionIn = transition;
  else clip.transitionOut = transition;
}

/** The clip that ends where this one starts on the same track, if any. */
export function previousAdjacentClip(track: Track, clip: Clip, tolerance = 1): Clip | undefined {
  return track.clips.find((c) => c.id !== clip.id && Math.abs(c.start + c.duration - clip.start) <= tolerance);
}

export function nextAdjacentClip(track: Track, clip: Clip, tolerance = 1): Clip | undefined {
  const end = clip.start + clip.duration;
  return track.clips.find((c) => c.id !== clip.id && Math.abs(c.start - end) <= tolerance);
}

export function makeTransition(type: string, duration?: number, easing: EasingId = 'easeInOut'): Transition {
  return { type, duration: duration ?? TRANSITIONS_BY_ID[type]?.defaultDuration ?? 12, easing, params: {} };
}

/** Removes a time range from every unlocked track, shifting later clips left. */
export function rippleDeleteRange(tl: TimelineData, from: number, to: number) {
  const a = Math.max(0, Math.round(Math.min(from, to)));
  const b = Math.round(Math.max(from, to));
  const len = b - a;
  if (len <= 0) return;
  for (const track of tl.tracks) {
    if (track.locked) continue;
    for (const clip of [...track.clips]) {
      const end = clip.start + clip.duration;
      if (end <= a) continue;
      if (clip.start >= b) {
        clip.start -= len;
        continue;
      }
      if (clip.start >= a && end <= b) {
        track.clips = track.clips.filter((c) => c.id !== clip.id);
        continue;
      }
      if (clip.start < a && end > b) {
        const right = splitClip(tl, clip.id, b);
        clip.duration = a - clip.start;
        if (right) right.start = a;
        continue;
      }
      if (clip.start < a) {
        clip.duration = a - clip.start;
      } else {
        trimClip(tl, clip.id, 'start', b - clip.start);
        clip.start = a;
      }
    }
    sortClips(track);
  }
  tl.markers = tl.markers.filter((m) => m.frame < a || m.frame >= b).map((m) => (m.frame >= b ? { ...m, frame: m.frame - len } : m));
}

/** Removes gaps between clips on a track. */
export function closeGaps(tl: TimelineData, trackId: string) {
  const track = findTrack(tl, trackId);
  if (!track) return;
  sortClips(track);
  let cursor = 0;
  for (const clip of track.clips) {
    clip.start = Math.min(clip.start, cursor);
    cursor = clip.start + clip.duration;
  }
}

export function addMarker(tl: TimelineData, frame: number, label = '', kind: Marker['kind'] = 'marker'): Marker {
  const marker: Marker = { id: uid('mrk_'), frame: Math.max(0, Math.round(frame)), label, color: kind === 'beat' ? '#F472B6' : '#22D3EE', kind };
  tl.markers.push(marker);
  tl.markers.sort((x, y) => x.frame - y.frame);
  return marker;
}

/** Frames a dragged clip edge can snap to. */
export function snapPoints(tl: TimelineData, opts: { exclude?: string; playhead?: number } = {}): number[] {
  const points = new Set<number>([0]);
  for (const t of tl.tracks)
    for (const c of t.clips) {
      if (c.id === opts.exclude) continue;
      points.add(c.start);
      points.add(c.start + c.duration);
    }
  for (const m of tl.markers) points.add(m.frame);
  if (opts.playhead != null) points.add(Math.round(opts.playhead));
  return [...points].sort((a, b) => a - b);
}

export function snap(frame: number, points: readonly number[], threshold: number): number {
  let best = frame;
  let dist = threshold + 1;
  for (const p of points) {
    const d = Math.abs(p - frame);
    if (d < dist) {
      dist = d;
      best = p;
    }
  }
  return dist <= threshold ? best : frame;
}

export function clipsAtFrame(tl: TimelineData, frame: number): { track: Track; clip: Clip }[] {
  const out: { track: Track; clip: Clip }[] = [];
  for (const track of tl.tracks)
    for (const clip of track.clips) if (frame >= clip.start && frame < clip.start + clip.duration) out.push({ track, clip });
  return out;
}

export function collectAssetIds(tl: TimelineData): string[] {
  const ids = new Set<string>();
  for (const t of tl.tracks)
    for (const c of t.clips) {
      if ((c.type === 'video' || c.type === 'image' || c.type === 'audio') && c.assetId) ids.add(c.assetId);
      if (c.type === 'motion') {
        for (const v of Object.values(c.props)) if (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)) ids.add(v);
      }
      for (const e of c.effects) {
        const lut = e.params.cubeAssetId;
        if (e.type === 'lut' && typeof lut === 'string' && lut) ids.add(lut);
      }
    }
  return [...ids];
}

/** Fills template placeholders with assets or text. */
export function fillPlaceholders(tl: TimelineData, values: { media?: Record<string, string>; text?: Record<string, string> }) {
  for (const t of tl.tracks)
    for (const c of t.clips) {
      const key = c.placeholder?.key;
      if (!key) continue;
      if ((c.type === 'video' || c.type === 'image' || c.type === 'audio') && values.media?.[key]) {
        c.assetId = values.media[key]!;
        c.placeholder = null;
      } else if (c.type === 'text' && values.text?.[key] != null) {
        c.text = values.text[key]!;
        c.placeholder = null;
      }
    }
}

export function emptyPlaceholders(tl: TimelineData): { clipId: string; key: string; label: string; kind: 'media' | 'text'; prompt?: string }[] {
  const out: { clipId: string; key: string; label: string; kind: 'media' | 'text'; prompt?: string }[] = [];
  for (const t of tl.tracks)
    for (const c of t.clips) {
      if (!c.placeholder) continue;
      out.push({ clipId: c.id, key: c.placeholder.key, label: c.placeholder.label, kind: c.placeholder.kind, ...(c.placeholder.prompt ? { prompt: c.placeholder.prompt } : {}) });
    }
  return out;
}

/** Changes canvas size, keeping layer positions relative to the centre. */
export function resizeCanvas(tl: TimelineData, width: number, height: number) {
  tl.width = width;
  tl.height = height;
}

export function cloneTimeline(tl: TimelineData): TimelineData {
  return structuredClone(tl);
}
