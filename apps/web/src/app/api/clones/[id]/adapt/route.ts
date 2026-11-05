import { adStructureSchema } from '@adforge/core';
import { enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { assertLlmReady, llmTaskUsd, toBlueprintViews } from '@/lib/server/growth';

/** Writes an original ad for the product on the analyzed structure, with a storyboard edit. */
export const POST = route({ body: z.object({ productId: z.string().uuid() }), limit: ['clones', 60, 3600] }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'ad_blueprints', params.id!, caller, 'The ad clone');
  if (row.status === 'analyzing') throw badRequest('The reference is still being analyzed.');
  const structure = adStructureSchema.safeParse(row.structure);
  if (!structure.success || !structure.data.beats.length) throw badRequest('Analyze the reference again first.');
  const product = await owned(sb, 'products', body.productId, caller, 'The product');
  if (product.status !== 'ready') throw badRequest(product.status === 'importing' ? 'The product is still importing. Try again in a moment.' : 'That product failed to import. Import it again first.');
  if (row.job_id) {
    const { data: running } = await sb.from('jobs').select('status').eq('id', row.job_id).maybeSingle();
    if (running && ['queued', 'running'].includes(running.status)) throw badRequest('This clone is already being written.');
  }
  await assertLlmReady(sb, caller, llmTaskUsd('writeScript'), 'clone ads');
  const job = await enqueueJob(sb, { type: 'ad.clone', payload: { blueprintId: row.id, step: 'adapt' }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `ad.clone:${row.id}:adapt:${Date.now()}` });
  const updated = check(await sb.from('ad_blueprints').update({ product_id: product.id, job_id: job.id, status: 'ready', error: null }).eq('id', row.id).select('*').single(), 'Could not start writing');
  return (await toBlueprintViews(sb, caller.workspaceId, [updated]))[0];
});
