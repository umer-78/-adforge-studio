import { enqueueJob } from '@adforge/core/server';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { assertLlmReady, llmTaskUsd, toBlueprintViews } from '@/lib/server/growth';

/** Runs the structure analysis again, e.g. after it failed. */
export const POST = route({ limit: ['clones', 60, 3600] }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'ad_blueprints', params.id!, caller, 'The ad clone');
  if (row.status === 'analyzing') throw badRequest('The reference is already being analyzed.');
  await assertLlmReady(sb, caller, llmTaskUsd('analyzeAdStructure') + (row.product_id ? llmTaskUsd('writeScript') : 0), 'clone ads');
  const job = await enqueueJob(sb, { type: 'ad.clone', payload: { blueprintId: row.id, step: 'analyze' }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `ad.clone:${row.id}:analyze:${Date.now()}` });
  const updated = check(await sb.from('ad_blueprints').update({ status: 'analyzing', error: null, job_id: job.id }).eq('id', row.id).select('*').single(), 'Could not start the analysis');
  return (await toBlueprintViews(sb, caller.workspaceId, [updated]))[0];
});
