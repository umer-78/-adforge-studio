import { assertBudget, enqueueJob } from '@adforge/core/server';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { llmTaskUsd, toProductViews } from '@/lib/server/growth';
import { providerStatus } from '@/lib/server/workspace';

/** Reads the product page again, e.g. after a price change or a failed import. */
export const POST = route({ limit: ['products', 60, 3600] }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'products', params.id!, caller, 'The product');
  if (row.status === 'importing') throw badRequest('This product is already being imported.');
  if ((await providerStatus(sb, caller.workspaceId)).anthropic) await assertBudget(sb, caller.workspaceId, llmTaskUsd('extractProduct'));
  const job = await enqueueJob(sb, { type: 'product.import', payload: { productId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `product.import:${row.id}:${Date.now()}` });
  const updated = check(await sb.from('products').update({ status: 'importing', error: null, job_id: job.id }).eq('id', row.id).select('*').single(), 'Could not start the import');
  return (await toProductViews(sb, caller.workspaceId, [updated]))[0];
});
