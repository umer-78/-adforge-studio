import { asJson, timelineSaveSchema } from '@adforge/core';
import { check, conflict, logActivity, route } from '@/lib/server/api';
import { loadTimeline, parseTimelineData, timelineColumns, timelineDetail } from '@/lib/server/timelines';

const AUTO_SNAPSHOT_EVERY = 25;
const MAX_AUTO_SNAPSHOTS = 40;

export const GET = route({}, async ({ sb, caller, params }) => timelineDetail(sb, caller.workspaceId, await loadTimeline(sb, caller, params.id!)));

/**
 * Saves the edit. `baseVersion` is the version the editor loaded; a newer version on the
 * server means someone else saved in between, so the save is refused instead of overwriting.
 */
export const PATCH = route({ body: timelineSaveSchema, limit: ['timeline-save', 3000, 3600] }, async ({ sb, caller, params, body }) => {
  const row = await loadTimeline(sb, caller, params.id!);
  if (row.version !== body.baseVersion) throw conflict('This edit was changed somewhere else. Reload to get the latest version.', { version: row.version, updatedAt: row.updated_at });
  const data = body.data === undefined ? null : parseTimelineData(body.data);
  const version = row.version + 1;
  const { data: saved, error } = await sb
    .from('timelines')
    .update({ ...(body.name ? { name: body.name } : {}), ...(data ? { data: asJson(data), ...timelineColumns(data) } : {}), version })
    .eq('id', row.id)
    .eq('version', row.version)
    .select('id, version, updated_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!saved) throw conflict('This edit was changed somewhere else. Reload to get the latest version.');
  if (data && (body.snapshotLabel || version % AUTO_SNAPSHOT_EVERY === 0)) {
    check(
      await sb.from('timeline_snapshots').insert({ timeline_id: row.id, workspace_id: caller.workspaceId, version, data: asJson(data), label: body.snapshotLabel ?? 'Autosave', created_by: caller.userId }),
      'Could not save the version',
    );
    if (!body.snapshotLabel) {
      const { data: autos } = await sb.from('timeline_snapshots').select('id').eq('timeline_id', row.id).eq('label', 'Autosave').order('created_at', { ascending: false }).range(MAX_AUTO_SNAPSHOTS, MAX_AUTO_SNAPSHOTS + 50);
      if (autos?.length) await sb.from('timeline_snapshots').delete().in('id', autos.map((a) => a.id));
    }
  }
  return { id: saved.id, version: saved.version, updatedAt: saved.updated_at };
});

/** Moves the edit to the trash; exports already made stay in the Library. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await loadTimeline(sb, caller, params.id!);
  check(await sb.from('timelines').update({ deleted_at: new Date().toISOString() }).eq('id', row.id), 'Could not delete the edit');
  await logActivity(sb, caller, 'timeline.deleted', 'timeline', row.id, { name: row.name });
});
