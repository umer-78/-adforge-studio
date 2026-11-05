import { asJson, EXPORT_PRESETS_BY_ID, presetSize, renderCreateSchema, timelineOps } from '@adforge/core';
import { enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, route } from '@/lib/server/api';
import { loadTimeline, parseTimelineData, toRenderViews } from '@/lib/server/timelines';

const query = z.object({
  timelineId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('renders').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(q.limit);
  if (q.timelineId) req = req.eq('timeline_id', q.timelineId);
  return { items: await toRenderViews(sb, caller.workspaceId, check(await req, 'Could not load exports')) };
});

/** Exports the saved edit with a preset. The exact version is pinned, so later edits don't change it. */
export const POST = route({ body: renderCreateSchema, limit: ['renders', 120, 3600] }, async ({ sb, caller, body }) => {
  const row = await loadTimeline(sb, caller, body.timelineId);
  const preset = EXPORT_PRESETS_BY_ID[body.presetId];
  if (!preset) throw badRequest('Unknown export preset.');
  const tl = parseTimelineData(row.data);
  const frames = timelineOps.timelineDuration(tl);
  if (!tl.tracks.some((t) => t.clips.length)) throw badRequest('The edit is empty. Add something to the timeline first.');
  const durationS = frames / tl.fps;
  if (preset.maxDurationS && durationS > preset.maxDurationS + 0.01) throw badRequest(`${preset.label} allows up to ${preset.maxDurationS}s; this edit is ${Math.round(durationS)}s.`);
  const empty = timelineOps.emptyPlaceholders(tl).filter((p) => p.kind === 'media');
  if (empty.length) throw badRequest(`Fill the empty media slots first: ${empty.slice(0, 5).map((p) => p.label).join(', ')}${empty.length > 5 ? '…' : ''}.`);
  const { count } = await sb.from('renders').select('id', { count: 'exact', head: true }).eq('workspace_id', caller.workspaceId).in('status', ['queued', 'running']);
  if ((count ?? 0) >= 10) throw badRequest('Ten exports are already waiting. Let some finish first.');

  // Pin this version: the worker reads the snapshot if the edit changes before it starts.
  const { data: pinned } = await sb.from('timeline_snapshots').select('id').eq('timeline_id', row.id).eq('version', row.version).limit(1).maybeSingle();
  if (!pinned) check(await sb.from('timeline_snapshots').insert({ timeline_id: row.id, workspace_id: caller.workspaceId, version: row.version, data: asJson(row.data), label: `Export · ${preset.label}`, created_by: caller.userId }), 'Could not pin the version');

  const size = presetSize(preset, tl);
  const render = check(
    await sb
      .from('renders')
      .insert({ workspace_id: caller.workspaceId, timeline_id: row.id, preset: preset.id, format: preset.format, width: size.width, height: size.height, fps: preset.fps ?? tl.fps, timeline_version: row.version, status: 'queued', created_by: caller.userId })
      .select('*')
      .single(),
    'Could not start the export',
  );
  const job = await enqueueJob(sb, { type: 'render.timeline', payload: { renderId: render.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 3, idempotencyKey: `render.timeline:${render.id}` });
  check(await sb.from('renders').update({ job_id: job.id }).eq('id', render.id), 'Could not start the export');
  await logActivity(sb, caller, 'render.created', 'timeline', row.id, { preset: preset.id, renderId: render.id });
  return (await toRenderViews(sb, caller.workspaceId, [{ ...render, job_id: job.id }]))[0];
});
