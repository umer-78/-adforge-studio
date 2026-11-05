'use client';

import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  isRecord,
  MOTION_TEMPLATES_BY_ID,
  motionDefaults,
  secondsToFrames,
  timelineOps,
  type AudioSettings,
  type CaptionWord,
  type Clip,
  type ClipDraft,
  type TimelineData,
} from '@adforge/core';
import { api, errorMessage } from '@/lib/api-client';
import { uploadAndWait } from '@/lib/upload';
import type { AssetView, BrandKitView } from '@/lib/types';
import { player, usePlayhead } from './playhead';
import { TEXT_PRESETS, TEXT_PRESETS_BY_ID } from './presets';
import { useEditor } from './store';

export interface Place {
  frame?: number;
  trackId?: string;
  /** Put the clip on a fresh track of the right kind. */
  newTrack?: boolean;
}

const state = () => useEditor.getState();
const playhead = () => usePlayhead.getState().frame;

export function sourceDurationS(clip: Clip): number | null {
  if (clip.type !== 'video' && clip.type !== 'audio') return null;
  return clip.assetId ? (state().assets[clip.assetId]?.durationS ?? null) : null;
}

/** Last frame covered by picture (video, image, motion, shape) on visible tracks. */
export function pictureEnd(tl: TimelineData): number {
  let end = 0;
  for (const t of tl.tracks) {
    if (t.kind === 'audio' || t.hidden) continue;
    for (const c of t.clips) if (c.type !== 'text' && c.type !== 'captions' && c.type !== 'adjustment') end = Math.max(end, c.start + c.duration);
  }
  return end;
}

/** Adds one clip, selects it and returns its id. Visual media without a position is appended to the main video track. */
export function placeClip(draft: ClipDraft, place: Place = {}, opts: { append?: boolean; topTrack?: boolean } = {}): string | null {
  const target = place.trackId ? state().timeline.tracks.find((t) => t.id === place.trackId) : undefined;
  if (target?.locked) {
    toast.info(`Unlock “${target.name || 'this track'}” to add clips to it.`);
    return null;
  }
  let id: string | null = null;
  state().edit((tl) => {
    const clip = timelineOps.makeClip(draft);
    if (opts.append && place.frame == null && !place.trackId && !place.newTrack) {
      const main = tl.tracks.find((t) => t.kind === 'video' && !t.locked);
      if (main) {
        clip.start = main.clips.reduce((end, c) => Math.max(end, c.start + c.duration), 0);
        id = timelineOps.addClip(tl, clip, { trackId: main.id }).clip.id;
        return;
      }
    }
    clip.start = Math.max(0, Math.round(place.frame ?? playhead()));
    let trackId = place.trackId;
    if (!trackId && place.newTrack) trackId = timelineOps.addTrack(tl, opts.topTrack ? 'overlay' : timelineOps.preferredTrackKind(clip.type), opts.topTrack ? { index: 0 } : {}).id;
    if (!trackId && opts.topTrack) {
      const top = tl.tracks[0];
      trackId = top && top.kind === 'overlay' && !top.locked && !top.clips.some((c) => clip.start < c.start + c.duration && c.start < clip.start + clip.duration) ? top.id : timelineOps.addTrack(tl, 'overlay', { index: 0, name: 'Adjustments' }).id;
    }
    id = timelineOps.addClip(tl, clip, { ...(trackId ? { trackId } : {}), newTrackOnConflict: true }).clip.id;
  });
  if (id) state().select([id]);
  return id;
}

export function assetClipDraft(asset: AssetView, fps: number): ClipDraft | null {
  const frames = (s: number | null | undefined, fallback: number) => Math.max(1, Math.round((s && s > 0 ? s : fallback) * fps));
  switch (asset.type) {
    case 'video':
      return { type: 'video', assetId: asset.id, start: 0, duration: frames(asset.durationS, 5) };
    case 'image':
      return { type: 'image', assetId: asset.id, start: 0, duration: frames(null, 3) };
    case 'audio': {
      const role: AudioSettings['role'] = asset.role === 'voice' || asset.role === 'music' || asset.role === 'sfx' ? asset.role : 'auto';
      const audio: Partial<AudioSettings> = role === 'music' ? { role, duck: true, volume: 0.7, fadeOut: 1.5 } : { role };
      return { type: 'audio', assetId: asset.id, start: 0, duration: frames(asset.durationS, 5), audio };
    }
    default:
      return null;
  }
}

export function addAsset(asset: AssetView, place: Place = {}): string | null {
  if (asset.type === 'model3d') {
    toast.info('Render the 3D model to a clip in 3D & Motion first, then add that clip.');
    return null;
  }
  if (asset.status === 'failed') {
    toast.error('This file could not be processed, so it cannot be edited.');
    return null;
  }
  if (asset.status !== 'ready' && asset.type !== 'image') {
    toast.info('This file is still processing. It can go on the timeline in a moment.');
    return null;
  }
  const s = state();
  s.mergeAssets([asset]);
  const draft = assetClipDraft(asset, s.timeline.fps);
  if (!draft) return null;
  if (draft.type === 'audio' && asset.role === 'music') {
    // Music under picture stops where the picture stops.
    const start = place.frame ?? playhead();
    const end = pictureEnd(s.timeline);
    if (end - start > s.timeline.fps) draft.duration = Math.min(draft.duration, end - start);
  }
  return placeClip(draft, place, { append: asset.type === 'video' || asset.type === 'image' });
}

/** The brand watermark over the whole edit, in the kit's corner, at its size and opacity. */
export function addWatermark(asset: AssetView, wm: BrandKitView['watermark']): string | null {
  if (asset.type !== 'image') return addAsset(asset);
  const s = state();
  s.mergeAssets([asset]);
  const { width: W, height: H, fps } = s.timeline;
  const aspect = asset.width && asset.height ? asset.width / asset.height : 1;
  // Box width is a share of the canvas width; its height keeps the image's shape.
  const w = wm.scale;
  const h = Math.min(1, (w * W) / aspect / H);
  const margin = 0.04 * Math.min(W, H);
  const x = (wm.position.endsWith('right') ? 1 : -1) * (0.5 - margin / W - w / 2);
  const y = (wm.position.startsWith('bottom') ? 1 : -1) * (0.5 - margin / H - h / 2);
  const duration = Math.max(fps, pictureEnd(s.timeline));
  return placeClip({ type: 'image', assetId: asset.id, start: 0, duration, transform: { x, y, width: w, height: h, fit: 'contain', opacity: wm.opacity } }, { frame: 0, newTrack: true }, { topTrack: true });
}

export function addText(presetId: string, place: Place = {}): string | null {
  const p = TEXT_PRESETS_BY_ID[presetId] ?? TEXT_PRESETS[0]!;
  return placeClip({ type: 'text', start: 0, duration: secondsToFrames(p.seconds, state().timeline.fps), text: p.text, style: p.style, transform: p.transform, animation: p.animation }, place);
}

export function addMotion(templateId: string, place: Place = {}): string | null {
  const def = MOTION_TEMPLATES_BY_ID[templateId];
  if (!def) return null;
  const fps = state().timeline.fps;
  return placeClip({ type: 'motion', templateId, props: motionDefaults(templateId), start: 0, duration: Math.max(1, Math.round((def.durationInFrames / 30) * fps)), name: def.name }, place);
}

export function addShape(shape: 'rect' | 'ellipse' | 'triangle' | 'line' | 'star', place: Place = {}): string | null {
  const tl = state().timeline;
  const side = 0.4;
  return placeClip(
    {
      type: 'shape',
      shape,
      start: 0,
      duration: secondsToFrames(3, tl.fps),
      fill: shape === 'line' ? '#FFFFFF' : '#7C5CFF',
      transform: { width: shape === 'line' ? 0.6 : side, height: shape === 'line' ? 0.006 : (side * tl.width) / tl.height },
    },
    place,
  );
}

export function addAdjustment(place: Place = {}): string | null {
  const tl = state().timeline;
  const start = place.frame ?? playhead();
  const end = timelineOps.timelineDuration(tl);
  const duration = end - start > tl.fps ? end - start : secondsToFrames(3, tl.fps);
  return placeClip({ type: 'adjustment', start: 0, duration, name: 'Adjustment layer', effects: [] }, place, { topTrack: !place.trackId });
}

export function addCaptions(words: CaptionWord[], start: number, duration: number, styleId?: string | null): string | null {
  if (!words.length) return null;
  return placeClip({ type: 'captions', start: 0, duration, words, ...(styleId ? { styleId } : {}), transform: { width: 0.9 } }, { frame: start });
}

/** Imports a built-in sound once, then adds it like any other file. */
export async function addBuiltinSfx(builtinId: string, place: Place = {}) {
  try {
    const { asset } = await api.post<{ asset: AssetView }>('/sfx', { mode: 'builtin', builtinId });
    const ready = await waitForAsset(asset);
    addAsset(ready, place);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

async function waitForAsset(asset: AssetView, timeoutMs = 60_000): Promise<AssetView> {
  let current = asset;
  const started = Date.now();
  while (current.status === 'processing' || current.status === 'uploading') {
    if (Date.now() - started > timeoutMs) throw new Error('The sound is still processing. Try again in a moment.');
    await new Promise((r) => setTimeout(r, 1200));
    current = (await api.get<{ asset: AssetView }>(`/assets/${asset.id}`)).asset;
  }
  if (current.status === 'failed') throw new Error(current.processingError ?? 'The sound could not be processed.');
  return current;
}

/** Uploads dropped files to the library and lays them end to end where they were dropped, each once it is ready. */
export async function uploadAndPlace(files: File[], place: Place, queryClient: QueryClient) {
  let frame = place.frame;
  for (const file of files) {
    toast.info(`${file.name} goes on the timeline as soon as it is processed.`);
    try {
      const asset = await uploadAndWait(file, { queryClient }, 15 * 60_000);
      const id = addAsset(asset, { ...place, frame });
      const added = id ? timelineOps.findClip(state().timeline, id)?.clip : null;
      if (added) frame = added.start + added.duration;
    } catch (err) {
      toast.error(`${file.name}: ${errorMessage(err)}`);
    }
  }
}

/* ------------------------------ Clip commands ------------------------------ */

function editableIds(tl: TimelineData, ids: string[]): string[] {
  return ids.filter((id) => {
    const found = timelineOps.findClip(tl, id);
    return !!found && !found.track.locked && !found.clip.locked;
  });
}

export function splitAtPlayhead() {
  const s = state();
  const frame = playhead();
  const targets = s.selection.length ? s.selection : timelineOps.clipsAtFrame(s.timeline, frame).map(({ clip }) => clip.id);
  let count = 0;
  s.edit((tl) => {
    for (const id of editableIds(tl, targets)) if (timelineOps.splitClip(tl, id, frame)) count++;
  });
  if (!count) toast.info(s.selection.length ? 'Move the playhead inside the selected clip to split it.' : 'Move the playhead over a clip to split it.');
}

export function deleteSelection(ripple = false) {
  const s = state();
  const ids = editableIds(s.timeline, s.selection);
  if (!ids.length) return;
  const byStart = ids.map((id) => timelineOps.findClip(s.timeline, id)!).sort((a, b) => b.clip.start - a.clip.start);
  s.edit((tl) => {
    for (const { clip } of byStart) timelineOps.removeClip(tl, clip.id, { ripple });
  });
  s.select([]);
}

export function duplicateSelection() {
  const s = state();
  const ids = editableIds(s.timeline, s.selection);
  if (!ids.length) return;
  const copies: string[] = [];
  s.edit((tl) => {
    for (const id of ids) copies.push(timelineOps.duplicateClip(tl, id).id);
  });
  s.select(copies);
}

export function copySelection(): boolean {
  const n = state().copySelection();
  if (n) toast.success(n === 1 ? 'Clip copied' : `${n} clips copied`);
  return n > 0;
}

export function cutSelection() {
  if (copySelection()) deleteSelection(false);
}

export function pasteClipboard() {
  const s = state();
  if (!s.clipboard.length) return;
  const at = playhead();
  const ids: string[] = [];
  s.edit((tl) => {
    for (const entry of s.clipboard) {
      const { id: _old, ...rest } = entry.clip;
      const clip = timelineOps.makeClip({ ...(rest as ClipDraft), start: at + entry.offset });
      const original = tl.tracks[entry.trackIndex];
      const fits = original && !original.locked && timelineOps.trackAccepts(original.kind, clip.type);
      ids.push(timelineOps.addClip(tl, clip, { ...(fits ? { trackId: original.id } : {}), newTrackOnConflict: true }).clip.id);
    }
  });
  s.select(ids);
}

export function nudgeSelection(delta: number) {
  const s = state();
  const picked = editableIds(s.timeline, s.selection).map((id) => timelineOps.findClip(s.timeline, id)!);
  if (!picked.length || !delta) return;
  picked.sort((a, b) => (delta > 0 ? b.clip.start - a.clip.start : a.clip.start - b.clip.start));
  try {
    s.edit(
      (tl) => {
        for (const { clip } of picked) {
          if (!timelineOps.moveClip(tl, clip.id, { start: clip.start + delta })) throw new Error('blocked');
        }
      },
      { coalesce: `nudge:${s.selection.join(',')}` },
    );
  } catch {
    // Another clip is in the way; leave everything where it was.
  }
}

/** Trims the selected clips (or the clip under the playhead) so they start or end at the playhead. */
export function trimToPlayhead(edge: 'start' | 'end') {
  const s = state();
  const frame = playhead();
  const targets = s.selection.length ? s.selection : timelineOps.clipsAtFrame(s.timeline, frame).map(({ clip }) => clip.id);
  s.edit((tl) => {
    for (const id of editableIds(tl, targets)) {
      const found = timelineOps.findClip(tl, id)!;
      const { clip } = found;
      if (frame <= clip.start || frame >= clip.start + clip.duration) continue;
      const delta = edge === 'start' ? frame - clip.start : frame - (clip.start + clip.duration);
      timelineOps.trimClip(tl, id, edge, delta, sourceDurationS(clip));
    }
  });
}

export function selectAll() {
  const s = state();
  s.select(s.timeline.tracks.flatMap((t) => (t.locked ? [] : t.clips.map((c) => c.id))));
}

export function addMarkerAtPlayhead() {
  state().edit((tl) => {
    timelineOps.addMarker(tl, playhead());
  });
}

/** Moves the audio of a video clip to its own clip on an audio track and mutes the original. */
export function detachAudio(clipId: string) {
  const s = state();
  const found = timelineOps.findClip(s.timeline, clipId);
  if (!found || found.clip.type !== 'video' || !found.clip.assetId) return;
  const video = found.clip;
  let id: string | null = null;
  s.edit((tl) => {
    const clip = timelineOps.makeClip({
      type: 'audio',
      assetId: video.assetId,
      start: video.start,
      duration: video.duration,
      trimStart: video.trimStart,
      speed: Math.min(4, Math.max(0.25, video.speed)),
      audio: { ...video.audio, muted: false },
    });
    id = timelineOps.addClip(tl, clip, { newTrackOnConflict: true }).clip.id;
    const v = timelineOps.findClip(tl, clipId)!.clip;
    if (v.type === 'video') v.audio.muted = true;
  });
  if (id) s.select([id]);
  toast.success('Audio detached to its own clip');
}

/* --------------------------- Analysis-driven edits --------------------------- */

interface AssetDetail {
  asset: AssetView;
  segments: unknown;
  meta: { silences: [number, number][] | null; scenes: number[] | null; beats: number[] | null };
}

function storedWords(segments: unknown): CaptionWord[] {
  if (!isRecord(segments) || !Array.isArray(segments.words)) return [];
  return segments.words
    .filter((w): w is CaptionWord => isRecord(w) && typeof w.text === 'string' && typeof w.start === 'number' && typeof w.end === 'number')
    .map((w) => ({ text: w.text.trim(), start: Math.max(0, w.start), end: Math.max(0, w.end), ...(typeof w.speaker === 'string' ? { speaker: w.speaker } : {}) }))
    .filter((w) => w.text);
}

/** Polls an asset until `ready` says the analysis landed, starting the job once when it is missing. */
async function withAnalysis(assetId: string, has: (d: AssetDetail) => boolean, start: () => Promise<unknown>, label: string): Promise<AssetDetail> {
  let detail = await api.get<AssetDetail>(`/assets/${assetId}`);
  if (has(detail)) return detail;
  const toastId = toast.loading(label);
  try {
    await start();
    const started = Date.now();
    while (!has(detail)) {
      if (Date.now() - started > 5 * 60_000) throw new Error('This is taking longer than usual. It keeps running; try again in a few minutes.');
      await new Promise((r) => setTimeout(r, 3000));
      detail = await api.get<AssetDetail>(`/assets/${assetId}`);
    }
    toast.dismiss(toastId);
    return detail;
  } catch (err) {
    toast.dismiss(toastId);
    throw err;
  }
}

function mediaClip(clipId: string) {
  const found = timelineOps.findClip(state().timeline, clipId);
  if (!found || (found.clip.type !== 'video' && found.clip.type !== 'audio') || !found.clip.assetId) throw new Error('Pick a video or audio clip first.');
  return found.clip;
}

/** Timeline frame for a source time in a clip (no ramps, reverse or freeze). */
function frameForSource(clip: Extract<Clip, { type: 'video' | 'audio' }>, sourceS: number, fps: number): number {
  return clip.start + Math.round(((sourceS - clip.trimStart) / clip.speed) * fps);
}

export async function captionsFromSpeech(clipId: string) {
  try {
    const clip = mediaClip(clipId);
    if (clip.type === 'video' && (clip.reverse || clip.freezeAt != null)) throw new Error('Captions need the clip to play forwards.');
    const detail = await withAnalysis(clip.assetId!, (d) => storedWords(d.segments).length > 0, () => api.post(`/assets/${clip.assetId}/actions`, { action: 'analyze', steps: ['transcribe'] }), 'Transcribing speech…');
    const fps = state().timeline.fps;
    const spanS = (clip.duration / fps) * clip.speed;
    const words = storedWords(detail.segments)
      .filter((w) => w.end > clip.trimStart && w.start < clip.trimStart + spanS)
      .map((w) => ({ ...w, start: Math.max(0, (w.start - clip.trimStart) / clip.speed), end: Math.max(0, (Math.min(w.end, clip.trimStart + spanS) - clip.trimStart) / clip.speed) }));
    if (!words.length) throw new Error('No speech was found in this part of the clip.');
    const kits = await api.get<{ items: { isDefault: boolean; captionStyleId: string | null }[] }>('/brand-kits').catch(() => ({ items: [] }));
    const styleId = kits.items.find((k) => k.isDefault)?.captionStyleId ?? null;
    addCaptions(words, clip.start, clip.duration, styleId);
    toast.success(`Captions added: ${words.length} words`);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

/** Removes pauses longer than the detector's minimum, keeping a short breath on each side. */
export async function cutSilences(clipId: string) {
  try {
    const clip = mediaClip(clipId);
    if (clip.type === 'video' && (clip.reverse || clip.freezeAt != null || clip.speedRamp.length)) throw new Error('Silence removal needs a clip at constant forward speed.');
    const detail = await withAnalysis(clip.assetId!, (d) => Array.isArray(d.meta.silences), () => api.post(`/assets/${clip.assetId}/actions`, { action: 'detect', kind: 'silence', thresholdDb: -38, minSilenceS: 0.45 }), 'Finding silences…');
    const fps = state().timeline.fps;
    const pad = Math.round(fps * 0.08);
    const end = clip.start + clip.duration;
    const ranges = (detail.meta.silences ?? [])
      .map(([a, b]) => [frameForSource(clip, a, fps) + pad, frameForSource(clip, b, fps) - pad] as const)
      .map(([a, b]) => [Math.max(clip.start, a), Math.min(end, b)] as const)
      .filter(([a, b]) => b - a >= Math.round(fps * 0.2))
      .sort((x, y) => y[0] - x[0]);
    if (!ranges.length) {
      toast.info('No long pauses found in this clip.');
      return;
    }
    const removed = ranges.reduce((sum, [a, b]) => sum + (b - a), 0);
    state().edit((tl) => {
      for (const [a, b] of ranges) timelineOps.rippleDeleteRange(tl, a, b);
    });
    toast.success(`Removed ${ranges.length} pause${ranges.length === 1 ? '' : 's'} (${(removed / fps).toFixed(1)}s)`);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

export async function splitAtScenes(clipId: string) {
  try {
    const clip = mediaClip(clipId);
    if (clip.type !== 'video') throw new Error('Scene detection works on video clips.');
    const detail = await withAnalysis(clip.assetId!, (d) => Array.isArray(d.meta.scenes), () => api.post(`/assets/${clip.assetId}/actions`, { action: 'detect', kind: 'scenes' }), 'Finding scene changes…');
    const fps = state().timeline.fps;
    const cuts = (detail.meta.scenes ?? []).map((t) => frameForSource(clip, t, fps)).filter((f) => f > clip.start && f < clip.start + clip.duration);
    if (!cuts.length) {
      toast.info('No scene changes found in this clip.');
      return;
    }
    let current = clip.id;
    let count = 0;
    state().edit((tl) => {
      for (const f of [...new Set(cuts)].sort((a, b) => a - b)) {
        const right = timelineOps.splitClip(tl, current, f);
        if (right) {
          current = right.id;
          count++;
        }
      }
    });
    toast.success(`Split into ${count + 1} shots`);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

/** Drops beat markers under a music clip so edits snap to the rhythm. */
export async function beatMarkers(clipId: string) {
  try {
    const clip = mediaClip(clipId);
    const detail = await withAnalysis(clip.assetId!, (d) => Array.isArray(d.meta.beats) && d.meta.beats.length > 0, () => api.post(`/assets/${clip.assetId}/actions`, { action: 'detect', kind: 'beats' }), 'Finding the beat…');
    const fps = state().timeline.fps;
    const frames = (detail.meta.beats ?? []).map((t) => frameForSource(clip, t, fps)).filter((f) => f >= clip.start && f < clip.start + clip.duration);
    if (!frames.length) {
      toast.info('No beats found in this part of the track.');
      return;
    }
    state().edit((tl) => {
      const existing = new Set(tl.markers.filter((m) => m.kind === 'beat').map((m) => m.frame));
      for (const f of frames) if (!existing.has(f)) timelineOps.addMarker(tl, f, '', 'beat');
    });
    toast.success(`${frames.length} beat markers added. Clips snap to them while you drag.`);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

export function seekToClip(clip: Clip) {
  player.seek(clip.start);
}
