import { enqueueJob } from '@adforge/core/server';
import { logActivity, route } from '@/lib/server/api';
import { toJobView } from '@/lib/server/workspace';

/** Empties the trash now: files are deleted from storage by the worker. */
export const DELETE = route({ role: 'admin' }, async ({ sb, caller }) => {
  const job = await enqueueJob(sb, { type: 'trash.purge', payload: { all: true }, workspaceId: caller.workspaceId, createdBy: caller.userId, idempotencyKey: `trash.purge:${caller.workspaceId}:${Math.floor(Date.now() / 30_000)}` });
  await logActivity(sb, caller, 'trash.emptied', 'workspace', caller.workspaceId);
  return toJobView(job);
});
