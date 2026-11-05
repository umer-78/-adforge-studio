import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  audibleAssetIds,
  EXPORT_PRESETS_BY_ID,
  extForMime,
  findLicenseIssues,
  parseTimeline,
  presetSize,
  roleFromAudioTrackKind,
  timelineOps,
  type AssetMap,
  type AssetMeta,
  type AssetRow,
  type ExportPreset,
  type LicenseIssue,
  type RenderRow,
  type ResolvedAsset,
  type TimelineData,
  type TimelineRow,
} from '@adforge/core';
import { storage } from '@adforge/core/server';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { activity } from '../lib/activity';
import { PermanentError } from '../lib/errors';
import { createAssetFromFile, loadAssets } from '../lib/files';
import { serveDirectory } from '../lib/media-server';
import { browserExecutable, chromiumOptions, licenseKey, renderConcurrency, serveUrl, TIMELINE_COMPOSITION_ID } from '../lib/remotion';
import { mapLimit, throttle } from '../lib/util';
import { syncVariantRender } from '../lib/variant-sync';
import { needsAudioOverride, renderClipAudio } from '../media/clip-audio';
import { ffmpeg, loudnormFilter, measureLoudness, probe } from '../media/ffmpeg';
import { reschedule, type JobContext, type JobHandler } from '../runner';

const MIME_BY_FORMAT: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', gif: 'image/gif' };

async function loadRender(ctx: JobContext, id: string): Promise<RenderRow> {
  const { data, error } = await ctx.sb.from('renders').select('*').eq('id', id).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (error) throw new Error(`Could not load render: ${error.message}`);
  if (!data) throw new PermanentError('This export no longer exists.');
  return data;
}

/** The timeline exactly as it was when the export was requested. */
async function timelineForRender(ctx: JobContext, render: RenderRow): Promise<{ row: TimelineRow; data: unknown }> {
  if (!render.timeline_id) throw new PermanentError('This export has no timeline.');
  const { data: row } = await ctx.sb.from('timelines').select('*').eq('id', render.timeline_id).eq('workspace_id', render.workspace_id).maybeSingle();
  if (!row || row.deleted_at) throw new PermanentError('The timeline was deleted.');
  if (render.timeline_version == null || render.timeline_version === row.version) return { row, data: row.data };
  const { data: snap } = await ctx.sb.from('timeline_snapshots').select('data').eq('timeline_id', row.id).eq('version', render.timeline_version).maybeSingle();
  if (!snap) throw new PermanentError('That version of the timeline is no longer available. Export again.');
  return { row, data: snap.data };
}

/** Audio a published ad can't legally use, by the shared rules in core. */
async function licenseIssues(ctx: JobContext, tl: TimelineData, assets: Map<string, AssetRow>, roles: Map<string, ResolvedAsset['role']>): Promise<LicenseIssue[]> {
  const heard = audibleAssetIds(tl)
    .map((id) => assets.get(id))
    .filter((a): a is AssetRow => !!a)
    .map((a) => ({ id: a.id, name: a.name, type: a.type, source: a.source, licenseId: a.license_id, hasAudio: (a.meta as AssetMeta).hasAudio, role: roles.get(a.id) ?? null }));
  const licenseIds = [...new Set(heard.map((a) => a.licenseId).filter((v): v is string => !!v))];
  const { data: licenses } = licenseIds.length ? await ctx.sb.from('licenses').select('id, commercial_use, expires_at').in('id', licenseIds) : { data: [] };
  return findLicenseIssues(heard, licenses ?? []);
}

function remotionCodec(preset: ExportPreset) {
  return preset.codec;
}

/** Final pass: loudness to the master target and the preset frame rate, without re-encoding when possible. */
async function finishFile(ctx: JobContext, input: string, output: string, preset: ExportPreset, tl: TimelineData, targetFps: number) {
  const p = await probe(input, ctx.signal);
  const loud = tl.master.loudnorm && p.hasAudio && preset.codec !== 'gif' ? await measureLoudness(input, tl.master.targetLufs, ctx.signal) : null;
  const fpsChange = preset.codec !== 'gif' && Math.abs(targetFps - tl.fps) > 0.01;
  if (!loud && !fpsChange) {
    await copyFile(input, output);
    return;
  }
  const video: string[] = !fpsChange
    ? ['-c:v', 'copy']
    : preset.codec === 'prores'
      ? ['-r', String(targetFps), '-c:v', 'prores_ks', '-profile:v', preset.proresProfile === '4444' ? '4' : '3', ...(preset.proresProfile === '4444' ? ['-pix_fmt', 'yuva444p10le'] : ['-pix_fmt', 'yuv422p10le'])]
      : preset.codec === 'vp9'
        ? ['-r', String(targetFps), '-c:v', 'libvpx-vp9', '-crf', String(preset.crf ?? 30), '-b:v', '0', '-row-mt', '1']
        : preset.codec === 'h265'
          ? ['-r', String(targetFps), '-c:v', 'libx265', '-crf', String(preset.crf ?? 24), '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p']
          : ['-r', String(targetFps), '-c:v', 'libx264', '-crf', String(preset.crf ?? 18), '-preset', 'medium', '-pix_fmt', 'yuv420p'];
  const audioCodec = preset.format === 'webm' ? ['-c:a', 'libopus', '-b:a', '160k'] : preset.format === 'mov' ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', '192k'];
  const audio = !p.hasAudio ? ['-an'] : loud ? ['-af', `${loudnormFilter(loud, tl.master.targetLufs)},aresample=48000`, ...audioCodec] : ['-c:a', 'copy'];
  await ffmpeg(
    ['-i', input, '-map', '0:v:0', ...(p.hasAudio ? ['-map', '0:a:0'] : []), ...video, ...audio, ...(preset.format === 'mp4' || preset.format === 'mov' ? ['-movflags', '+faststart'] : []), output],
    { signal: ctx.signal },
  );
}

export const renderTimeline: JobHandler<'render.timeline'> = {
  async run(ctx, { renderId }) {
    const render = await loadRender(ctx, renderId);
    if (render.status === 'succeeded' || render.status === 'canceled') return { skipped: render.status };
    const { row, data } = await timelineForRender(ctx, render);
    let tl: TimelineData;
    try {
      tl = parseTimeline(data);
    } catch {
      throw new PermanentError('The timeline data is invalid. Open it in the editor and save again.');
    }
    const preset = EXPORT_PRESETS_BY_ID[render.preset] ?? EXPORT_PRESETS_BY_ID['source-1080']!;
    const frames = timelineOps.timelineDuration(tl);
    if (frames <= 0) throw new PermanentError('The timeline is empty.');
    const durationS = frames / tl.fps;
    if (preset.maxDurationS && durationS > preset.maxDurationS + 0.01) throw new PermanentError(`${preset.label} allows up to ${preset.maxDurationS}s; this edit is ${Math.round(durationS)}s.`);
    const empty = timelineOps.emptyPlaceholders(tl).filter((p) => p.kind === 'media');
    if (empty.length) throw new PermanentError(`Fill the empty media slots first: ${empty.slice(0, 5).map((p) => p.label).join(', ')}${empty.length > 5 ? '…' : ''}.`);

    await ctx.sb.from('renders').update({ status: 'running', job_id: ctx.job.id, progress: 1, error: null }).eq('id', render.id);
    const mirror = throttle(async (pct: number) => {
      await ctx.sb.from('renders').update({ progress: Math.round(pct * 100) / 100 }).eq('id', render.id).eq('status', 'running');
    }, 2000);
    const progress = (pct: number, message: string) => {
      ctx.progress(pct, message);
      mirror(pct);
    };

    // Media: originals, downloaded once and served locally.
    progress(2, 'Collecting media');
    const ids = timelineOps.collectAssetIds(tl);
    const rows = await loadAssets(ctx.sb, render.workspace_id, ids);
    const missing = ids.filter((id) => !rows.get(id) || rows.get(id)!.deleted_at);
    if (missing.length) throw new PermanentError(`${missing.length} file${missing.length > 1 ? 's' : ''} used in this edit ${missing.length > 1 ? 'were' : 'was'} deleted. Replace ${missing.length > 1 ? 'them' : 'it'} and export again.`);
    const notReady = [...rows.values()].filter((a) => a.status !== 'ready');
    if (notReady.some((a) => a.status === 'failed')) throw new PermanentError(`“${notReady.find((a) => a.status === 'failed')!.name}” could not be processed. Replace it and export again.`);
    if (notReady.length) {
      const waitedS = (Date.now() - new Date(render.created_at).getTime()) / 1000;
      if (waitedS > 3600) throw new PermanentError('Some files were still processing after an hour. Check them in the Library and export again.');
      await ctx.sb.from('renders').update({ status: 'queued' }).eq('id', render.id);
      return reschedule(15, `Waiting for ${notReady.length} file${notReady.length > 1 ? 's' : ''} to finish processing`);
    }

    const dir = path.join(await ctx.tmp(), 'media');
    await mkdir(dir, { recursive: true });
    const local = new Map<string, string>();
    let done = 0;
    await mapLimit([...rows.values()], 3, async (a) => {
      const file = path.join(dir, `${a.id}.${extForMime(a.mime_type)}`);
      await storage(a.storage_driver).downloadToFile(a.storage_key, file);
      local.set(a.id, file);
      progress(2 + (++done / rows.size) * 8, 'Collecting media');
    });
    ctx.checkAborted();

    const audioIds = [...rows.values()].filter((a) => a.type === 'audio').map((a) => a.id);
    const { data: tracks } = audioIds.length ? await ctx.sb.from('audio_tracks').select('asset_id, kind').in('asset_id', audioIds) : { data: [] };
    const trackKind = new Map((tracks ?? []).map((t) => [t.asset_id, t.kind]));
    const roles = new Map<string, ResolvedAsset['role']>();
    for (const a of rows.values()) {
      const role = (a.meta as AssetMeta).role ?? roleFromAudioTrackKind(trackKind.get(a.id));
      if (role) roles.set(a.id, role);
    }
    const issues = await licenseIssues(ctx, tl, rows, roles);

    const server = await serveDirectory(dir);
    try {
      const assets: AssetMap = {};
      for (const a of rows.values()) {
        assets[a.id] = {
          id: a.id,
          type: a.type as ResolvedAsset['type'],
          src: server.url(local.get(a.id)!),
          width: a.width,
          height: a.height,
          durationS: a.duration_s == null ? null : Number(a.duration_s),
          fps: a.fps == null ? null : Number(a.fps),
          hasAudio: a.type === 'audio' ? true : (a.meta as AssetMeta).hasAudio !== false,
          name: a.name,
          ...(roles.get(a.id) ? { role: roles.get(a.id) } : {}),
        };
      }

      // Clip audio that needs EQ, pan, dynamics, noise reduction or retiming is prepared up front.
      progress(11, 'Preparing audio');
      const audioOverrides: Record<string, string> = {};
      const jobs = tl.tracks.flatMap((t) => t.clips).filter((c): c is Extract<typeof c, { type: 'audio' | 'video' }> => (c.type === 'audio' || c.type === 'video') && !!c.assetId && needsAudioOverride(c));
      await mapLimit(jobs, 2, async (clip) => {
        const asset = assets[clip.assetId!];
        if (!asset || asset.hasAudio === false) return;
        const out = path.join(dir, `clip-${clip.id.replace(/[^\w-]/g, '')}.wav`);
        await renderClipAudio(clip, local.get(clip.assetId!)!, tl.fps, out, ctx.signal);
        audioOverrides[clip.id] = server.url(out);
      });

      const size = { width: render.width || presetSize(preset, tl).width, height: render.height || presetSize(preset, tl).height };
      const targetFps = preset.codec === 'gif' ? tl.fps : (render.fps || preset.fps || tl.fps);
      const inputProps = {
        timeline: tl,
        assets,
        options: { aiLabel: tl.aiLabel, showPlaceholders: false, audioOverrides, soloTrackIds: [] },
        output: size,
      };
      progress(14, 'Starting renderer');
      const url = await serveUrl();
      const browser = browserExecutable();
      const composition = await selectComposition({ serveUrl: url, id: TIMELINE_COMPOSITION_ID, inputProps, browserExecutable: browser, chromiumOptions: chromiumOptions(), logLevel: 'warn' });

      const { cancelSignal, cancel } = makeCancelSignal();
      const onAbort = () => cancel();
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      const rendered = path.join(await ctx.tmp(), `render.${preset.format}`);
      const alpha = preset.codec === 'prores' && preset.proresProfile === '4444';
      try {
        await renderMedia({
          composition,
          serveUrl: url,
          codec: remotionCodec(preset),
          outputLocation: rendered,
          inputProps,
          ...(preset.crf != null && preset.codec !== 'prores' && preset.codec !== 'gif' ? { crf: preset.crf } : {}),
          ...(preset.videoBitrate ? { videoBitrate: preset.videoBitrate } : {}),
          ...(preset.codec === 'prores' ? { proResProfile: preset.proresProfile === '4444' ? '4444' : 'hq' } : {}),
          ...(alpha ? { imageFormat: 'png', pixelFormat: 'yuva444p10le' } : {}),
          ...(preset.codec === 'gif' ? { everyNthFrame: Math.max(1, Math.round(tl.fps / (preset.fps ?? 15))) } : {}),
          muted: preset.codec === 'gif',
          concurrency: renderConcurrency(),
          browserExecutable: browser,
          chromiumOptions: chromiumOptions(),
          timeoutInMilliseconds: 120_000,
          cancelSignal,
          logLevel: 'warn',
          licenseKey: licenseKey(),
          onProgress: ({ progress: p }) => progress(15 + p * 75, 'Rendering'),
        });
      } finally {
        ctx.signal.removeEventListener('abort', onAbort);
      }
      ctx.checkAborted();

      progress(91, 'Mastering audio');
      const final = path.join(await ctx.tmp(), `final.${preset.format}`);
      await finishFile(ctx, rendered, final, preset, tl, targetFps);

      progress(95, 'Saving');
      const usesAi = [...rows.values()].some((a) => a.is_ai_generated);
      const asset = await createAssetFromFile(ctx, {
        workspaceId: render.workspace_id,
        filePath: final,
        mime: MIME_BY_FORMAT[preset.format] ?? 'video/mp4',
        name: `${row.name} · ${preset.label}`,
        source: 'render',
        createdBy: render.created_by,
        projectId: row.project_id,
        isAiGenerated: usesAi,
        meta: { render: { renderId: render.id, timelineId: row.id, version: render.timeline_version ?? row.version, preset: preset.id }, aiLabelBurnedIn: tl.aiLabel, licenseIssues: issues },
      });
      await ctx.sb.from('renders').update({ status: 'succeeded', progress: 100, output_asset_id: asset.id, error: null }).eq('id', render.id);
      if (!row.thumbnail_asset_id) await ctx.sb.from('timelines').update({ thumbnail_asset_id: asset.id }).eq('id', row.id);
      await syncVariantRender(ctx.sb, render.id, { status: 'done', assetId: asset.id });
      await activity(ctx.sb, { workspaceId: render.workspace_id, actorId: render.created_by, verb: 'rendered', objectType: 'render', objectId: render.id, data: { timeline: row.name, preset: preset.label, assetId: asset.id } });
      return { assetId: asset.id, durationS, licenseIssues: issues.length };
    } finally {
      await server.close();
    }
  },

  async onFailure(ctx, { renderId }, message) {
    await ctx.sb.from('renders').update({ status: 'failed', error: message }).eq('id', renderId);
    await syncVariantRender(ctx.sb, renderId, { status: 'failed', error: message });
  },

  async onCancel(ctx, { renderId }) {
    await ctx.sb.from('renders').update({ status: 'canceled' }).eq('id', renderId).in('status', ['queued', 'running']);
  },
};
