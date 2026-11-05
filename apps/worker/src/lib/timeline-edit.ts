import {
  ASPECT_SIZES,
  aspectFromSize,
  asJson,
  EXPORT_PRESETS_BY_ID,
  makeClip,
  makeTrack,
  motionDefaults,
  presetSize,
  timelineOps,
  type AssetRow,
  type CaptionWord,
  type Clip,
  type TimelineData,
  type TimelineRow,
} from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';

type TextClip = Extract<Clip, { type: 'text' }>;
type MotionClip = Extract<Clip, { type: 'motion' }>;
type AudioClip = Extract<Clip, { type: 'audio' }>;
type VideoClip = Extract<Clip, { type: 'video' }>;

const allClips = (tl: TimelineData) => tl.tracks.flatMap((t) => t.clips.map((c) => ({ track: t, clip: c })));

/** The on-screen hook: a "hook" slot, or the biggest text in the first three seconds. */
export function findHookClip(tl: TimelineData): TextClip | null {
  const texts = allClips(tl).map((x) => x.clip).filter((c): c is TextClip => c.type === 'text');
  const keyed = texts.find((c) => /hook|headline|title/i.test(c.placeholder?.key ?? c.name ?? ''));
  if (keyed) return keyed;
  const early = texts.filter((c) => c.start < tl.fps * 3).sort((a, b) => b.style.fontSize - a.style.fontSize || a.start - b.start);
  return early[0] ?? null;
}

export function setHook(tl: TimelineData, hook: string): 'replaced' | 'added' {
  const clip = findHookClip(tl);
  if (clip) {
    clip.text = hook;
    clip.placeholder = null;
    return 'replaced';
  }
  const track = makeTrack('text', 'Hook');
  track.clips.push(
    makeClip({
      type: 'text',
      text: hook,
      start: 0,
      duration: Math.min(Math.round(tl.fps * 2.5), Math.max(1, timelineOps.timelineDuration(tl))),
      name: 'Hook',
      style: { fontWeight: 800, fontSize: 84, uppercase: true, strokeColor: '#000000', strokeWidth: 8 },
      transform: { y: -0.28, width: 0.86 },
      animation: { in: 'pop', out: 'fade' },
    }),
  );
  tl.tracks.unshift(track);
  return 'added';
}

/** The call to action: a CTA motion template, a "cta" slot, or the last text near the end. */
export function setCta(tl: TimelineData, cta: string): 'replaced' | 'added' {
  const clips = allClips(tl).map((x) => x.clip);
  const button = clips.find((c): c is MotionClip => c.type === 'motion' && c.templateId === 'cta-button');
  if (button) {
    button.props = { ...button.props, text: cta };
    return 'replaced';
  }
  const end = timelineOps.timelineDuration(tl);
  const slot = clips.find((c): c is TextClip => c.type === 'text' && /cta|call/i.test(c.placeholder?.key ?? c.name ?? ''));
  const late = clips.filter((c): c is TextClip => c.type === 'text' && c.start + c.duration >= end - tl.fps * 4).sort((a, b) => b.start - a.start)[0];
  const target = slot ?? late;
  if (target) {
    target.text = cta;
    target.placeholder = null;
    return 'replaced';
  }
  const duration = Math.min(Math.round(tl.fps * 2.5), Math.max(1, end));
  const track = makeTrack('overlay', 'CTA');
  track.clips.push(makeClip({ type: 'motion', templateId: 'cta-button', props: { ...motionDefaults('cta-button'), text: cta }, start: Math.max(0, end - duration), duration, transform: { width: 1, height: 1 } }));
  tl.tracks.unshift(track);
  return 'added';
}

export function setCaptionStyle(tl: TimelineData, styleId: string): number {
  let n = 0;
  for (const { clip } of allClips(tl)) {
    if (clip.type === 'captions') {
      clip.styleId = styleId;
      n++;
    }
  }
  return n;
}

export function audioClipsWithRole(tl: TimelineData, assets: Map<string, AssetRow>, role: 'voice' | 'music', trackKinds: Map<string, string> = new Map()): AudioClip[] {
  return allClips(tl)
    .map((x) => x.clip)
    .filter((c): c is AudioClip => c.type === 'audio' && !!c.assetId)
    .filter((c) => {
      if (c.audio.role !== 'auto') return c.audio.role === role;
      const a = assets.get(c.assetId!);
      const metaRole = (a?.meta as { role?: string } | undefined)?.role;
      const kind = trackKinds.get(c.assetId!);
      const inferred = metaRole ?? (kind === 'voiceover' || kind === 'recording' ? 'voice' : kind === 'music' ? 'music' : undefined);
      return inferred === role;
    });
}

/** Re-times captions that overlap a replaced voice clip, from the new word timings. */
export function retimeCaptions(tl: TimelineData, voice: AudioClip, words: { text: string; start: number; end: number }[]) {
  const voiceStartS = voice.start / tl.fps;
  for (const { clip } of allClips(tl)) {
    if (clip.type !== 'captions') continue;
    const overlaps = clip.start < voice.start + voice.duration && clip.start + clip.duration > voice.start;
    if (!overlaps) continue;
    const offset = voiceStartS - clip.start / tl.fps;
    const next: CaptionWord[] = words.map((w) => ({ text: w.text, start: Math.max(0, w.start + offset), end: Math.max(0, w.end + offset) }));
    clip.words = next;
    const needed = Math.ceil((Math.max(...next.map((w) => w.end), 0) + 0.3) * tl.fps);
    if (needed > clip.duration) clip.duration = needed;
  }
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** Swaps the opening shot with the clip whose media best matches a description. */
export function swapFirstShot(tl: TimelineData, assets: Map<string, AssetRow>, description: string): boolean {
  const videoTrack = tl.tracks.filter((t) => t.kind === 'video').sort((a, b) => b.clips.length - a.clips.length)[0];
  if (!videoTrack || videoTrack.clips.length < 2) return false;
  const clips = [...videoTrack.clips].sort((a, b) => a.start - b.start).filter((c): c is VideoClip | Extract<Clip, { type: 'image' }> => (c.type === 'video' || c.type === 'image') && !!c.assetId);
  const first = clips[0];
  if (!first) return false;
  const want = tokens(description);
  let best: (typeof clips)[number] | null = null;
  let bestScore = 0;
  for (const c of clips.slice(1)) {
    const a = assets.get(c.assetId!);
    if (!a) continue;
    const have = tokens([a.name, a.ai_caption ?? '', ...a.ai_tags, ...a.tags].join(' '));
    const overlap = [...want].filter((w) => have.has(w)).length;
    const score = overlap / Math.max(1, Math.min(want.size, have.size));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore < 0.15 || best.type !== first.type) return false;
  const a = first as VideoClip;
  const b = best as VideoClip;
  [a.assetId, b.assetId] = [b.assetId, a.assetId];
  if (a.type === 'video' && b.type === 'video') {
    [a.trimStart, b.trimStart] = [b.trimStart, a.trimStart];
    for (const c of [a, b]) {
      const dur = Number(assets.get(c.assetId!)?.duration_s ?? 0);
      const needed = (c.duration / tl.fps) * c.speed;
      if (dur && c.trimStart + needed > dur) c.trimStart = Math.max(0, dur - needed);
    }
  }
  return true;
}

/** Saves a timeline document as a new editable timeline. */
export async function insertTimeline(sb: ServiceClient, input: { workspaceId: string; name: string; data: TimelineData; createdBy: string | null; projectId?: string | null; templateId?: string | null }): Promise<TimelineRow> {
  const tl = input.data;
  const { data, error } = await sb
    .from('timelines')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name.slice(0, 200),
      data: asJson(tl),
      fps: tl.fps,
      width: tl.width,
      height: tl.height,
      aspect: aspectFromSize(tl.width, tl.height),
      duration_s: timelineOps.timelineDuration(tl) / tl.fps,
      project_id: input.projectId ?? null,
      template_id: input.templateId ?? null,
      created_by: input.createdBy,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Could not save timeline: ${error.message}`);
  return data;
}

/** Creates an export row for a timeline; the caller queues render.timeline. */
export async function insertRender(sb: ServiceClient, input: { workspaceId: string; timeline: TimelineRow; presetId?: string; createdBy: string | null }) {
  const preset = EXPORT_PRESETS_BY_ID[input.presetId ?? 'source-1080'] ?? EXPORT_PRESETS_BY_ID['source-1080']!;
  const size = presetSize(preset, { width: input.timeline.width, height: input.timeline.height });
  const { data, error } = await sb
    .from('renders')
    .insert({
      workspace_id: input.workspaceId,
      timeline_id: input.timeline.id,
      timeline_version: input.timeline.version,
      preset: preset.id,
      format: preset.format,
      width: size.width,
      height: size.height,
      fps: preset.fps ?? input.timeline.fps,
      status: 'queued',
      created_by: input.createdBy,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Could not create export: ${error.message}`);
  return data;
}

export const sizeForAspect = (aspect: keyof typeof ASPECT_SIZES) => ASPECT_SIZES[aspect];
