import { asJson, CAPTION_STYLES_BY_ID, parseVariants } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { toVariantBatchViews } from '@/lib/server/growth';

const text = (max: number) => z.string().trim().max(max).nullable().optional();

const patch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  /** Edits to planned variants before rendering, by position. */
  updates: z
    .array(
      z.object({
        index: z.number().int().min(0).max(9),
        label: z.string().trim().min(1).max(40).optional(),
        hook: text(300),
        cta: text(120),
        voiceStyle: text(300),
        captionStyleId: text(60),
        musicMood: text(80),
        firstShot: text(300),
        hypothesis: z.string().max(500).optional(),
      }),
    )
    .max(10)
    .optional(),
  /** Positions of planned variants to drop. */
  remove: z.array(z.number().int().min(0).max(9)).max(9).optional(),
});

export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'variant_batches', params.id!, caller, 'The variants');
  return (await toVariantBatchViews(sb, caller.workspaceId, [row]))[0];
});

export const PATCH = route({ body: patch }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'variant_batches', params.id!, caller, 'The variants');
  let variants = parseVariants(row.variants);
  const editing = !!body.updates?.length || !!body.remove?.length;
  if (editing && row.status !== 'ready') throw badRequest('Variants can be edited after planning and before rendering.');
  for (const u of body.updates ?? []) {
    const v = variants[u.index];
    if (!v) throw badRequest(`There is no variant ${u.index + 1}.`);
    if (v.status !== 'planned') throw badRequest(`${v.label} is already rendering.`);
    if (u.captionStyleId && !CAPTION_STYLES_BY_ID[u.captionStyleId]) throw badRequest('Unknown caption style.');
    const { index: _, ...fields } = u;
    // Only the parts this batch varies can change.
    const allowed: Record<string, string> = { hook: 'hook', cta: 'cta', voiceStyle: 'voice', captionStyleId: 'caption_style', musicMood: 'music', firstShot: 'first_shot' };
    for (const [key, dim] of Object.entries(allowed)) if (fields[key as keyof typeof fields] !== undefined && !row.dimensions.includes(dim)) throw badRequest(`This batch does not vary ${dim.replace('_', ' ')}.`);
    variants[u.index] = { ...v, ...Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined)) };
  }
  if (body.remove?.length) {
    const drop = new Set(body.remove);
    variants = variants.filter((_, i) => !drop.has(i));
    if (variants.length < 2) throw badRequest('Keep at least two variants to compare.');
  }
  const updated = check(
    await sb
      .from('variant_batches')
      .update({ ...(body.name ? { name: body.name } : {}), ...(editing ? { variants: asJson(variants), count: variants.length } : {}) })
      .eq('id', row.id)
      .select('*')
      .single(),
    'Could not save the variants',
  );
  return (await toVariantBatchViews(sb, caller.workspaceId, [updated]))[0];
});

/** Removes the batch. Edits and exports it made stay in the Editor and Library. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'variant_batches', params.id!, caller, 'The variants');
  if (row.job_id) {
    const { data: job } = await sb.from('jobs').select('status').eq('id', row.job_id).maybeSingle();
    if (job && ['queued', 'running'].includes(job.status)) throw badRequest('Wait for the variants to finish, or cancel the job first.');
  }
  check(await sb.from('variant_batches').delete().eq('id', row.id), 'Could not delete the variants');
});
