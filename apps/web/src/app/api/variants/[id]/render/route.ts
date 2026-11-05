import { asJson, parseVariants } from '@adforge/core';
import { assertBudget, enqueueJob } from '@adforge/core/server';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toVariantBatchViews, variantBatchEstimate, llmTaskUsd } from '@/lib/server/growth';
import { loadTimeline, parseTimelineData } from '@/lib/server/timelines';

/** Builds an edit per variant and exports each one. Failed variants are retried. */
export const POST = route({ limit: ['variants', 60, 3600] }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'variant_batches', params.id!, caller, 'The variants');
  if (!['ready', 'failed', 'done'].includes(row.status)) throw badRequest(row.status === 'planning' ? 'The variants are still being planned.' : 'The variants are already rendering.');
  const variants = parseVariants(row.variants).map((v) => (v.status === 'failed' ? { ...v, status: 'planned' as const, error: null } : v));
  const todo = variants.filter((v) => v.status === 'planned' || v.status === 'building');
  if (!todo.length) throw badRequest(variants.length ? 'Every variant is already rendered.' : 'Plan the variants first.');
  if (!row.source_timeline_id) throw badRequest('The source edit was deleted.');
  const tl = parseTimelineData((await loadTimeline(sb, caller, row.source_timeline_id)).data);
  // Planning is paid already; what remains is re-voicing the variants still to build.
  const estimate = await variantBatchEstimate(sb, caller.workspaceId, tl, row.dimensions, todo.filter((v) => v.voiceId).length);
  await assertBudget(sb, caller.workspaceId, Math.max(0, estimate.usd - llmTaskUsd('planVariants')));
  const job = await enqueueJob(sb, { type: 'variants.render', payload: { batchId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 3, idempotencyKey: `variants.render:${row.id}:${Date.now()}` });
  const updated = check(await sb.from('variant_batches').update({ status: 'ready', variants: asJson(variants), job_id: job.id, error: null }).eq('id', row.id).select('*').single(), 'Could not start rendering');
  await logActivity(sb, caller, 'variants.render', 'variant_batch', row.id, { variants: todo.length });
  return (await toVariantBatchViews(sb, caller.workspaceId, [updated]))[0];
});
