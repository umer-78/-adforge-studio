import 'server-only';
import {
  ASPECT_SIZES,
  aspectFromSize,
  asJson,
  brandFromKit,
  buildTemplate,
  EXPORT_PRESETS_BY_ID,
  isRecord,
  MOTION_TEMPLATES_BY_ID,
  parseMotionProps,
  timelineDataSchema,
  timelineOps,
  TIMELINE_TEMPLATES_BY_ID,
  type AspectRatio,
  type AssetMeta,
  type AssetRow,
  type RenderRow,
  type TimelineCreate,
  type TimelineData,
  type TimelineRow,
} from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';
import type { RenderView, TimelineDetailView, TimelineSummaryView } from '../types';
import { badRequest, type Caller, check, notFound, owned } from './api';
import { assetsByIds, assetViewMap, toAssetViews } from './assets';

export async function insertTimeline(sb: ServiceClient, input: { workspaceId: string; name: string; data: TimelineData; createdBy: string | null; projectId?: string | null; templateId?: string | null }): Promise<TimelineRow> {
  const tl = input.data;
  return check(
    await sb
      .from('timelines')
      .insert({
        workspace_id: input.workspaceId,
        name: input.name.slice(0, 200) || 'Untitled edit',
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
      .single(),
    'Could not create the edit',
  );
}

/** Columns derived from the timeline data, kept in sync on every save. */
export function timelineColumns(tl: TimelineData) {
  return { fps: tl.fps, width: tl.width, height: tl.height, aspect: aspectFromSize(tl.width, tl.height), duration_s: timelineOps.timelineDuration(tl) / tl.fps };
}

export function parseTimelineData(data: unknown): TimelineData {
  const parsed = timelineDataSchema.safeParse(data);
  if (!parsed.success) throw badRequest('The edit could not be saved: its data is invalid.', parsed.error.issues.slice(0, 5));
  return parsed.data;
}

export async function toTimelineSummaries(sb: ServiceClient, workspaceId: string, rows: TimelineRow[]): Promise<TimelineSummaryView[]> {
  const thumbs = await assetViewMap(sb, workspaceId, rows.map((r) => r.thumbnail_asset_id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    aspect: r.aspect,
    width: r.width,
    height: r.height,
    fps: Number(r.fps),
    durationS: Number(r.duration_s),
    version: r.version,
    projectId: r.project_id,
    thumbnailUrl: (r.thumbnail_asset_id && (thumbs[r.thumbnail_asset_id]?.thumbnailUrl ?? thumbs[r.thumbnail_asset_id]?.url)) || null,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }));
}

export async function timelineDetail(sb: ServiceClient, workspaceId: string, row: TimelineRow): Promise<TimelineDetailView> {
  const [summary] = await toTimelineSummaries(sb, workspaceId, [row]);
  let ids: string[] = [];
  try {
    ids = timelineOps.collectAssetIds(timelineDataSchema.parse(row.data));
  } catch {
    // Invalid data still opens; the editor shows it as empty.
  }
  const assets = await assetViewMap(sb, workspaceId, ids);
  return { ...summary!, data: row.data, assets };
}

/** Audio files' roles from their library records, so music ducks under voice. */
async function audioRoles(sb: ServiceClient, assets: AssetRow[]): Promise<Map<string, 'voice' | 'music' | 'sfx'>> {
  const out = new Map<string, 'voice' | 'music' | 'sfx'>();
  const audio = assets.filter((a) => a.type === 'audio');
  if (!audio.length) return out;
  const { data } = await sb.from('audio_tracks').select('asset_id, kind').in('asset_id', audio.map((a) => a.id));
  const kinds = new Map((data ?? []).map((t) => [t.asset_id, t.kind]));
  for (const a of audio) {
    const meta = (isRecord(a.meta) ? a.meta : {}) as AssetMeta;
    const kind = kinds.get(a.id);
    const role = meta.role === 'voice' || meta.role === 'music' || meta.role === 'sfx' ? meta.role : kind === 'voiceover' || kind === 'recording' ? 'voice' : kind === 'music' || kind === 'stem' ? 'music' : kind === 'sfx' ? 'sfx' : null;
    if (role) out.set(a.id, role);
  }
  return out;
}

/** An edit with the given files in order: pictures on the video track, sound on its own tracks. */
async function timelineFromAssets(sb: ServiceClient, rows: AssetRow[], aspect: AspectRatio, fps: number, background?: string): Promise<TimelineData> {
  const size = ASPECT_SIZES[aspect];
  const tl = timelineOps.createTimeline({ fps, width: size.width, height: size.height, background });
  const video = tl.tracks.find((t) => t.kind === 'video')!;
  const voice = tl.tracks.find((t) => t.kind === 'audio' && t.name === 'Voice')!;
  const music = tl.tracks.find((t) => t.kind === 'audio' && t.name === 'Music')!;
  const roles = await audioRoles(sb, rows);
  const f = (s: number) => Math.max(1, Math.round(s * fps));
  let at = 0;
  for (const a of rows) {
    if (a.type === 'video') {
      const clip = timelineOps.makeClip({ type: 'video', assetId: a.id, start: at, duration: f(Number(a.duration_s) || 5), name: a.name });
      timelineOps.addClip(tl, clip, { trackId: video.id });
      at += clip.duration;
    } else if (a.type === 'image') {
      const clip = timelineOps.makeClip({ type: 'image', assetId: a.id, start: at, duration: f(3), name: a.name });
      timelineOps.addClip(tl, clip, { trackId: video.id });
      at += clip.duration;
    }
  }
  const sfx = rows.some((a) => roles.get(a.id) === 'sfx') ? timelineOps.addTrack(tl, 'audio', { name: 'Sound effects' }) : null;
  let voiceAt = 0;
  for (const a of rows.filter((r) => r.type === 'audio')) {
    const role = roles.get(a.id) ?? 'music';
    const duration = f(Number(a.duration_s) || 5);
    if (role === 'voice') {
      timelineOps.addClip(tl, timelineOps.makeClip({ type: 'audio', assetId: a.id, start: voiceAt, duration, name: a.name, audio: { role: 'voice' } }), { trackId: voice.id });
      voiceAt += duration;
    } else if (role === 'sfx') {
      timelineOps.addClip(tl, timelineOps.makeClip({ type: 'audio', assetId: a.id, start: 0, duration, name: a.name, audio: { role: 'sfx' } }), { trackId: sfx!.id });
    } else {
      // Under pictures, music is cut to the picture length and fades out; on its own it plays in full.
      const len = at > 0 ? Math.min(duration, at) : duration;
      timelineOps.addClip(tl, timelineOps.makeClip({ type: 'audio', assetId: a.id, start: 0, duration: len, name: a.name, audio: { role: 'music', duck: true, volume: 0.7, fadeOut: Math.min(1.5, len / fps / 3) } }), { trackId: music.id });
    }
  }
  return tl;
}

function motionTimeline(input: NonNullable<TimelineCreate['motion']>, aspect: AspectRatio, fps: number, background?: string): TimelineData {
  const def = MOTION_TEMPLATES_BY_ID[input.templateId];
  if (!def) throw badRequest('That motion template does not exist.');
  const size = ASPECT_SIZES[aspect];
  const tl = timelineOps.createTimeline({ fps, width: size.width, height: size.height, background });
  const duration = input.durationS ? Math.max(1, Math.round(input.durationS * fps)) : Math.round((def.durationInFrames / 30) * fps);
  timelineOps.addClip(tl, timelineOps.makeClip({ type: 'motion', templateId: def.id, props: parseMotionProps(def.id, input.props), start: 0, duration, name: def.name }));
  return tl;
}

/** Builds the starting timeline for a new edit from whatever it was opened with. */
export async function startingTimeline(sb: ServiceClient, caller: Caller, body: TimelineCreate): Promise<{ data: TimelineData; templateRowId: string | null }> {
  const aspect = body.aspect;
  if (body.data !== undefined) return { data: parseTimelineData(body.data), templateRowId: null };
  if (body.motion) return { data: motionTimeline(body.motion, aspect, body.fps, body.background), templateRowId: null };
  if (body.assetIds?.length) {
    const rows = await assetsByIds(sb, caller.workspaceId, body.assetIds);
    const byId = new Map(rows.filter((a) => !a.deleted_at).map((a) => [a.id, a]));
    const ordered = body.assetIds.map((id) => byId.get(id)).filter((a): a is AssetRow => !!a && a.type !== 'model3d');
    if (!ordered.length) throw badRequest(rows.some((a) => a.type === 'model3d') ? '3D models go through the 3D studio: render a turntable clip first, then edit it.' : 'Those files no longer exist.');
    return { data: await timelineFromAssets(sb, ordered, aspect, body.fps, body.background), templateRowId: null };
  }
  if (body.templateId) {
    let builtinId: string | null = TIMELINE_TEMPLATES_BY_ID[body.templateId] ? body.templateId : null;
    let templateRowId: string | null = null;
    if (!builtinId) {
      const { data: row } = await sb.from('templates').select('*').eq('id', body.templateId).eq('kind', 'timeline').or(`workspace_id.eq.${caller.workspaceId},workspace_id.is.null`).maybeSingle();
      if (!row) throw notFound('That template');
      templateRowId = row.id;
      const data = isRecord(row.data) ? row.data : {};
      if (typeof data.builtinId === 'string') builtinId = data.builtinId;
      else if (data.timeline) return { data: parseTimelineData(data.timeline), templateRowId };
      else throw badRequest('That template is empty.');
    }
    const { data: kit } = body.brandKitId
      ? await sb.from('brand_kits').select('*').eq('id', body.brandKitId).eq('workspace_id', caller.workspaceId).maybeSingle()
      : await sb.from('brand_kits').select('*').eq('workspace_id', caller.workspaceId).order('is_default', { ascending: false }).limit(1).maybeSingle();
    if (body.brandKitId && !kit) throw notFound('That brand kit');
    try {
      return { data: buildTemplate(builtinId!, aspect, brandFromKit(kit), body.fps), templateRowId };
    } catch {
      throw notFound('That template');
    }
  }
  const size = ASPECT_SIZES[aspect];
  return { data: timelineOps.createTimeline({ fps: body.fps, width: size.width, height: size.height, background: body.background }), templateRowId: null };
}

export async function loadTimeline(sb: ServiceClient, caller: Caller, id: string): Promise<TimelineRow> {
  const row = await owned(sb, 'timelines', id, caller, 'This edit');
  if (row.deleted_at) throw notFound('This edit');
  return row;
}

export async function toRenderViews(sb: ServiceClient, workspaceId: string, rows: RenderRow[]): Promise<RenderView[]> {
  const outputs = await assetsByIds(sb, workspaceId, rows.map((r) => r.output_asset_id).filter((x): x is string => !!x));
  const views = new Map((await toAssetViews(outputs)).map((v) => [v.id, v]));
  const metaById = new Map(outputs.map((a) => [a.id, (isRecord(a.meta) ? a.meta : {}) as AssetMeta]));
  return rows.map((r) => {
    const meta = r.output_asset_id ? metaById.get(r.output_asset_id) : undefined;
    const issues = Array.isArray(meta?.licenseIssues) ? (meta.licenseIssues as RenderView['licenseIssues']) : [];
    return {
      id: r.id,
      timelineId: r.timeline_id,
      preset: r.preset,
      presetLabel: EXPORT_PRESETS_BY_ID[r.preset]?.label ?? r.preset,
      format: r.format,
      width: r.width,
      height: r.height,
      status: r.status as RenderView['status'],
      progress: Number(r.progress),
      error: r.error,
      output: (r.output_asset_id && views.get(r.output_asset_id)) || null,
      licenseIssues: issues,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}
