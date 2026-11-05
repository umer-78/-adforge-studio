import { asJson } from '@adforge/core';
import * as z from 'zod';
import { check, route } from '@/lib/server/api';
import { loadTimeline } from '@/lib/server/timelines';
import type { SnapshotView } from '@/lib/types';

const toView = (s: { id: string; version: number; label: string | null; created_at: string }): SnapshotView => ({ id: s.id, version: s.version, label: s.label, createdAt: s.created_at });

export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await loadTimeline(sb, caller, params.id!);
  const snaps = check(await sb.from('timeline_snapshots').select('id, version, label, created_at').eq('timeline_id', row.id).order('created_at', { ascending: false }).limit(100), 'Could not load versions');
  return { items: snaps.map(toView) };
});

/** Names the current saved state so it can be restored later. */
export const POST = route({ body: z.object({ label: z.string().trim().min(1).max(120) }) }, async ({ sb, caller, params, body }) => {
  const row = await loadTimeline(sb, caller, params.id!);
  const snap = check(
    await sb.from('timeline_snapshots').insert({ timeline_id: row.id, workspace_id: caller.workspaceId, version: row.version, data: asJson(row.data), label: body.label, created_by: caller.userId }).select('id, version, label, created_at').single(),
    'Could not save the version',
  );
  return toView(snap);
});
