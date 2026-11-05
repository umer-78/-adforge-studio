import { asJson } from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';
import { check, logActivity, notFound, route } from '@/lib/server/api';
import { loadTimeline, parseTimelineData, timelineColumns } from '@/lib/server/timelines';

async function loadSnapshot(sb: ServiceClient, timelineId: string, id: string) {
  const { data } = await sb.from('timeline_snapshots').select('*').eq('id', id).eq('timeline_id', timelineId).maybeSingle();
  if (!data) throw notFound('That version');
  return data;
}

/** Restores a saved version. The current state is kept as its own version first. */
export const POST = route({}, async ({ sb, caller, params }) => {
  const row = await loadTimeline(sb, caller, params.id!);
  const snap = await loadSnapshot(sb, row.id, params.snapshotId!);
  const data = parseTimelineData(snap.data);
  check(await sb.from('timeline_snapshots').insert({ timeline_id: row.id, workspace_id: caller.workspaceId, version: row.version, data: asJson(row.data), label: 'Before restore', created_by: caller.userId }), 'Could not keep the current version');
  const saved = check(
    await sb
      .from('timelines')
      .update({ data: asJson(data), ...timelineColumns(data), version: row.version + 1 })
      .eq('id', row.id)
      .select('id, version, updated_at')
      .single(),
    'Could not restore the version',
  );
  await logActivity(sb, caller, 'timeline.restored', 'timeline', row.id, { version: snap.version, label: snap.label });
  return { id: saved.id, version: saved.version, updatedAt: saved.updated_at };
});

export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await loadTimeline(sb, caller, params.id!);
  const snap = await loadSnapshot(sb, row.id, params.snapshotId!);
  check(await sb.from('timeline_snapshots').delete().eq('id', snap.id), 'Could not delete the version');
});
