import { productImportSchema } from '@adforge/core';
import { assertBudget, assertSafeUrl, enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { check, logActivity, orIlike, route } from '@/lib/server/api';
import { llmTaskUsd, toProductViews } from '@/lib/server/growth';
import { providerStatus } from '@/lib/server/workspace';

const query = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['importing', 'ready', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().datetime({ offset: true }).optional(),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('products').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(q.limit + 1);
  if (q.status) req = req.eq('status', q.status);
  if (q.q?.trim()) req = req.or(orIlike(['title', 'brand_name', 'source_url'], q.q));
  if (q.cursor) req = req.lt('created_at', q.cursor);
  const rows = check(await req, 'Could not load products');
  const page = rows.slice(0, q.limit);
  return { items: await toProductViews(sb, caller.workspaceId, page), nextCursor: rows.length > q.limit ? page[page.length - 1]!.created_at : null };
});

/** Reads a product page in the background: facts, copy angles, colors, images and logo. */
export const POST = route({ body: productImportSchema, limit: ['products', 60, 3600] }, async ({ sb, caller, body }) => {
  const url = assertSafeUrl(body.url).toString();
  // Claude is optional here: without it the import keeps only what the page states.
  if ((await providerStatus(sb, caller.workspaceId)).anthropic) await assertBudget(sb, caller.workspaceId, llmTaskUsd('extractProduct'));
  const row = check(await sb.from('products').insert({ workspace_id: caller.workspaceId, source_url: url, status: 'importing', created_by: caller.userId }).select('*').single(), 'Could not start the import');
  const job = await enqueueJob(sb, { type: 'product.import', payload: { productId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `product.import:${row.id}` });
  check(await sb.from('products').update({ job_id: job.id }).eq('id', row.id), 'Could not start the import');
  await logActivity(sb, caller, 'product.import', 'product', row.id, { url });
  return (await toProductViews(sb, caller.workspaceId, [{ ...row, job_id: job.id }]))[0];
});
