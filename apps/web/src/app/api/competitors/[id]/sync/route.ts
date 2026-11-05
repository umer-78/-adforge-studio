import { enqueueJob } from '@adforge/core/server';
import { owned, route } from '@/lib/server/api';
import { toJobView } from '@/lib/server/workspace';

/** Checks the brand's ads now instead of waiting for the next scheduled check. */
export const POST = route({ limit: ['competitor-sync', 60, 3600] }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'competitors', params.id!, caller, 'The competitor');
  const job = await enqueueJob(sb, { type: 'competitors.sync', payload: { competitorId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 4, idempotencyKey: `competitors.sync:${row.id}:${Math.floor(Date.now() / 60_000)}` });
  return toJobView(job);
});
