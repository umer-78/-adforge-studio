import { asJson, timelineOps, variantBatchCreateSchema, variantItemSchema } from '@adforge/core';
import { enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, route } from '@/lib/server/api';
import { assertLlmReady, toVariantBatchViews, variantBatchEstimate } from '@/lib/server/growth';
import { loadTimeline, parseTimelineData } from '@/lib/server/timelines';

const LETTERS = 'ABCDEFGHIJ';

const query = z.object({
  sourceTimelineId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().datetime({ offset: true }).optional(),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('variant_batches').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(q.limit + 1);
  if (q.sourceTimelineId) req = req.eq('source_timeline_id', q.sourceTimelineId);
  if (q.cursor) req = req.lt('created_at', q.cursor);
  const rows = check(await req, 'Could not load variants');
  const page = rows.slice(0, q.limit);
  return { items: await toVariantBatchViews(sb, caller.workspaceId, page), nextCursor: rows.length > q.limit ? page[page.length - 1]!.created_at : null };
});

/** Plans N variants of an edit that change only the chosen parts (hook, CTA, voice, music, captions, first shot). */
export const POST = route({ body: variantBatchCreateSchema, limit: ['variants', 60, 3600] }, async ({ sb, caller, body }) => {
  const row = await loadTimeline(sb, caller, body.sourceTimelineId);
  const tl = parseTimelineData(row.data);
  if (!tl.tracks.some((t) => t.clips.length)) throw badRequest('The edit is empty. Add something to the timeline first.');
  const empty = timelineOps.emptyPlaceholders(tl).filter((p) => p.kind === 'media');
  if (empty.length) throw badRequest(`Fill the empty media slots first: ${empty.slice(0, 5).map((p) => p.label).join(', ')}.`);
  const dims = [...new Set(body.dimensions)];

  let voiceIds: string[] = [];
  if (dims.includes('voice')) {
    voiceIds = [...new Set(body.voiceIds ?? [])];
    if (!voiceIds.length) throw badRequest('Pick at least one voice for the voice variants.');
    const { data: voices } = await sb.from('voices').select('provider_voice_id').eq('workspace_id', caller.workspaceId).in('provider_voice_id', voiceIds);
    if ((voices?.length ?? 0) !== voiceIds.length) throw badRequest('Add the voices to your Voice-over library first.');
  }
  const estimate = await variantBatchEstimate(sb, caller.workspaceId, tl, dims, body.count);
  if (dims.includes('voice') && !estimate.voiceChars) throw badRequest('The edit has no voice-over with a transcript to re-voice. Transcribe it in the Library first, or drop the voice option.');
  await assertLlmReady(sb, caller, estimate.usd, 'plan variants');

  // Voices are assigned up front so the planner can write a delivery style for each.
  const seeded = voiceIds.length ? Array.from({ length: body.count }, (_, i) => variantItemSchema.parse({ label: `Variant ${LETTERS[i]}`, voiceId: voiceIds[i % voiceIds.length] })) : [];
  const batch = check(
    await sb
      .from('variant_batches')
      .insert({
        workspace_id: caller.workspaceId,
        source_timeline_id: row.id,
        name: body.name,
        dimensions: dims,
        count: body.count,
        status: 'planning',
        variants: asJson(seeded),
        cost_estimate_usd: estimate.usd,
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not start the variants',
  );
  const job = await enqueueJob(sb, { type: 'variants.plan', payload: { batchId: batch.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `variants.plan:${batch.id}` });
  check(await sb.from('variant_batches').update({ job_id: job.id }).eq('id', batch.id), 'Could not start the variants');
  await logActivity(sb, caller, 'variants.create', 'variant_batch', batch.id, { count: body.count, dimensions: dims });
  return (await toVariantBatchViews(sb, caller.workspaceId, [{ ...batch, job_id: job.id }]))[0];
});
