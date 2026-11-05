import { randomUUID } from 'node:crypto';
import { asJson, scriptCreateSchema } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { assertCanWrite, queueScriptWrite, toScriptView } from '@/lib/server/scripts';

const query = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['generating', 'draft', 'final', 'failed']).optional(),
  format: z.enum(['ad', 'dialogue']).optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  cursor: z.string().optional(),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('scripts').select('*').eq('workspace_id', caller.workspaceId).order('updated_at', { ascending: false }).limit(q.limit + 1);
  if (q.q?.trim()) req = req.ilike('title', `%${q.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  if (q.status) req = req.eq('status', q.status);
  if (q.format) req = req.eq('format', q.format);
  if (q.projectId) req = req.eq('project_id', q.projectId);
  if (q.cursor) req = req.lt('updated_at', q.cursor);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  const page = (data ?? []).slice(0, q.limit);
  return { items: page.map(toScriptView), nextCursor: (data?.length ?? 0) > q.limit ? page[page.length - 1]!.updated_at : null };
});

/** Starts an AI-written script from a brief, or an empty one to write by hand. */
export const POST = route({ body: scriptCreateSchema, limit: ['scripts', 120, 3600] }, async ({ sb, caller, body }) => {
  if (body.projectId) await owned(sb, 'projects', body.projectId, caller, 'The project');

  if (body.mode === 'blank') {
    const row = check(
      await sb
        .from('scripts')
        .insert({
          workspace_id: caller.workspaceId,
          created_by: caller.userId,
          project_id: body.projectId ?? null,
          title: body.title,
          format: body.format,
          language: body.language,
          status: 'draft',
          lines: asJson([{ id: randomUUID(), speaker: null, text: '', emotion: null, onScreenText: null, visual: '', shotType: 'medium', camera: 'static', durationS: 3, beat: 'hook', useRealFootage: false }]),
        })
        .select('*')
        .single(),
      'Could not create the script',
    );
    await logActivity(sb, caller, 'script.create', 'script', row.id, { title: row.title });
    return toScriptView(row);
  }

  const { brief } = body;
  if (brief.productId) await owned(sb, 'products', brief.productId, caller, 'The product');
  if (brief.characterIds.length) {
    const { data } = await sb.from('characters').select('id').eq('workspace_id', caller.workspaceId).in('id', brief.characterIds);
    if ((data?.length ?? 0) !== new Set(brief.characterIds).size) throw badRequest('One of the characters no longer exists.');
  }
  if (brief.format === 'dialogue' && !brief.characterIds.length) throw badRequest('Pick at least one character for a dialogue.');
  if (!brief.product.trim() && !brief.productId) throw badRequest('Describe the product or pick an imported product page.');
  await assertCanWrite(sb, caller);

  const row = check(
    await sb
      .from('scripts')
      .insert({
        workspace_id: caller.workspaceId,
        created_by: caller.userId,
        project_id: body.projectId ?? null,
        title: body.title?.trim() || 'Untitled script',
        format: brief.format,
        language: brief.language,
        brief: asJson(brief),
        status: 'generating',
      })
      .select('*')
      .single(),
    'Could not create the script',
  );
  const job = await queueScriptWrite(sb, caller, row.id);
  await logActivity(sb, caller, 'script.generate', 'script', row.id, { platform: brief.platform, durationS: brief.durationS });
  return { ...toScriptView({ ...row, job_id: job.id }), jobId: job.id };
});
