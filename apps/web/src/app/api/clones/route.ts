import { cloneCreateSchema } from '@adforge/core';
import { enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { assertLlmReady, llmTaskUsd, toBlueprintViews } from '@/lib/server/growth';

const query = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().datetime({ offset: true }).optional(),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('ad_blueprints').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(q.limit + 1);
  if (q.cursor) req = req.lt('created_at', q.cursor);
  const rows = check(await req, 'Could not load ad clones');
  const page = rows.slice(0, q.limit);
  return { items: await toBlueprintViews(sb, caller.workspaceId, page), nextCursor: rows.length > q.limit ? page[page.length - 1]!.created_at : null };
});

/**
 * Maps a reference ad beat by beat (hook, cuts, shots, text, voice-over). With a product picked,
 * the worker then writes an original ad on the same structure and builds its storyboard.
 */
export const POST = route({ body: cloneCreateSchema, limit: ['clones', 60, 3600] }, async ({ sb, caller, body }) => {
  if (body.referenceAssetId) {
    const asset = await owned(sb, 'assets', body.referenceAssetId, caller, 'The reference');
    if (asset.deleted_at) throw badRequest('The reference is in the trash.');
    if (asset.type !== 'video' && asset.type !== 'image') throw badRequest('The reference must be a video or an image.');
    if (asset.status === 'failed') throw badRequest('The reference could not be processed. Upload it again.');
  }
  if (body.inspirationAdId) await owned(sb, 'inspiration_ads', body.inspirationAdId, caller, 'The saved ad');
  if (body.productId) {
    const product = await owned(sb, 'products', body.productId, caller, 'The product');
    if (product.status === 'failed') throw badRequest('That product failed to import. Import it again first.');
  }
  await assertLlmReady(sb, caller, llmTaskUsd('analyzeAdStructure') + (body.productId ? llmTaskUsd('writeScript') : 0), 'clone ads');

  const row = check(
    await sb
      .from('ad_blueprints')
      .insert({
        workspace_id: caller.workspaceId,
        name: body.name,
        reference_asset_id: body.referenceAssetId ?? null,
        inspiration_ad_id: body.inspirationAdId ?? null,
        product_id: body.productId ?? null,
        status: 'analyzing',
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not start the clone',
  );
  const job = await enqueueJob(sb, { type: 'ad.clone', payload: { blueprintId: row.id, step: 'analyze' }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `ad.clone:${row.id}:analyze` });
  check(await sb.from('ad_blueprints').update({ job_id: job.id }).eq('id', row.id), 'Could not start the clone');
  await logActivity(sb, caller, 'clone.create', 'ad_blueprint', row.id, { name: row.name });
  return (await toBlueprintViews(sb, caller.workspaceId, [{ ...row, job_id: job.id }]))[0];
});
