import { enqueueJob } from '@adforge/core/server';
import { owned, route } from '@/lib/server/api';
import { assertLlmReady, llmTaskUsd } from '@/lib/server/growth';
import { toJobView } from '@/lib/server/workspace';

/** Breaks the ad down: hook, angle, structure, triggers, why it works and ideas to borrow. */
export const POST = route({ limit: ['inspiration-analyze', 120, 3600] }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'inspiration_ads', params.id!, caller, 'The saved ad');
  await assertLlmReady(sb, caller, llmTaskUsd('analyzeAdStructure'), 'analyze ads');
  const job = await enqueueJob(sb, { type: 'inspiration.analyze', payload: { inspirationAdId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 4, idempotencyKey: `inspiration.analyze:${row.id}:${Math.floor(Date.now() / 60_000)}` });
  return toJobView(job);
});
