import { asJson, parseVariants, variantItemSchema } from '@adforge/core';
import { enqueueJob } from '@adforge/core/server';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { assertLlmReady, llmTaskUsd, toVariantBatchViews } from '@/lib/server/growth';

const LETTERS = 'ABCDEFGHIJ';

/** Plans the variants again from scratch (before any were rendered). */
export const POST = route({ limit: ['variants', 60, 3600] }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'variant_batches', params.id!, caller, 'The variants');
  const variants = parseVariants(row.variants);
  if (row.status === 'planning') throw badRequest('The variants are already being planned.');
  if (variants.some((v) => v.status !== 'planned' && v.status !== 'failed')) throw badRequest('Some variants were already rendered. Start a new batch instead.');
  await assertLlmReady(sb, caller, llmTaskUsd('planVariants'), 'plan variants');
  const voiceIds = [...new Set(variants.map((v) => v.voiceId).filter((v): v is string => !!v))];
  const seeded = voiceIds.length ? Array.from({ length: row.count }, (_, i) => variantItemSchema.parse({ label: `Variant ${LETTERS[i]}`, voiceId: voiceIds[i % voiceIds.length] })) : [];
  const job = await enqueueJob(sb, { type: 'variants.plan', payload: { batchId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `variants.plan:${row.id}:${Date.now()}` });
  const updated = check(await sb.from('variant_batches').update({ status: 'planning', variants: asJson(seeded), job_id: job.id, error: null }).eq('id', row.id).select('*').single(), 'Could not start planning');
  return (await toVariantBatchViews(sb, caller.workspaceId, [updated]))[0];
});
