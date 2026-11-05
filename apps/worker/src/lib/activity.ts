import type { Json } from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';

/** Adds an entry to the workspace activity feed. Never fails the job. */
export async function activity(sb: ServiceClient, entry: { workspaceId: string; actorId?: string | null; verb: string; objectType: string; objectId?: string | null; data?: Record<string, unknown> }) {
  await sb
    .from('activity')
    .insert({ workspace_id: entry.workspaceId, actor_id: entry.actorId ?? null, verb: entry.verb, object_type: entry.objectType, object_id: entry.objectId ?? null, data: (entry.data ?? {}) as Json })
    .then(
      () => undefined,
      () => undefined,
    );
}
