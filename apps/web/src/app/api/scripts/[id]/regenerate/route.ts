import { asJson, isRecord, scriptBriefSchema } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, conflict, logActivity, owned, route } from '@/lib/server/api';
import { assertCanWrite, queueScriptWrite, scriptLines, toScriptView } from '@/lib/server/scripts';

const body = z
  .object({
    angle: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
    tone: z.string().trim().max(200).optional(),
    durationS: z.number().int().min(5).max(180).optional(),
  })
  .default({});

/**
 * Writes the script again from its brief. A failed or empty script is retried in place;
 * a written one gets a new take beside it so no edits are lost.
 */
export const POST = route({ body, scope: 'generate', limit: ['scripts', 120, 3600] }, async ({ sb, caller, body, params }) => {
  const row = await owned(sb, 'scripts', params.id!, caller, 'This script');
  if (row.status === 'generating') throw conflict('This script is already being written.');
  const stored = isRecord(row.brief) ? row.brief : {};
  if (!stored.product && !stored.productId) throw badRequest('This script was written by hand, so there is no brief to write it from. Start a new script from a brief instead.');
  const parsed = scriptBriefSchema.safeParse(stored);
  if (!parsed.success) throw badRequest('The brief on this script is incomplete. Start a new script from a brief instead.');
  await assertCanWrite(sb, caller);

  const lines = scriptLines(row.lines);
  const overrides = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== ''));
  if (row.status === 'failed' || !lines.length) {
    check(await sb.from('scripts').update({ brief: asJson({ ...parsed.data, ...overrides }) }).eq('id', row.id), 'Could not update the brief');
    const job = await queueScriptWrite(sb, caller, row.id);
    return { ...toScriptView({ ...row, status: 'generating', error: null, job_id: job.id }), jobId: job.id };
  }

  const previousHook = typeof stored.hook === 'string' ? stored.hook : lines[0]?.text;
  const brief = {
    ...parsed.data,
    // A new take should find its own angle unless one is asked for.
    angle: body.angle ?? undefined,
    ...overrides,
    notes: [overrides.notes ?? parsed.data.notes, previousHook ? `Write a clearly different take; do not reuse this hook: "${previousHook}".` : ''].filter(Boolean).join('\n').slice(0, 2000),
  };
  const take = check(
    await sb
      .from('scripts')
      .insert({
        workspace_id: caller.workspaceId,
        created_by: caller.userId,
        project_id: row.project_id,
        title: 'Untitled script',
        format: row.format,
        language: row.language,
        brief: asJson(brief),
        status: 'generating',
      })
      .select('*')
      .single(),
    'Could not start a new take',
  );
  const job = await queueScriptWrite(sb, caller, take.id);
  await logActivity(sb, caller, 'script.generate', 'script', take.id, { from: row.id });
  return { ...toScriptView({ ...take, job_id: job.id }), jobId: job.id };
});
