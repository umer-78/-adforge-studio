import * as z from 'zod';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { toInspirationViews } from '@/lib/server/growth';

const patch = z.object({
  brand: z.string().trim().min(1).max(200).optional(),
  sourceUrl: z.string().url().max(2000).nullish(),
  assetId: z.string().uuid().nullish(),
  headline: z.string().max(500).nullish(),
  body: z.string().max(5000).nullish(),
  cta: z.string().max(120).nullish(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  notes: z.string().max(5000).nullish(),
  isFavorite: z.boolean().optional(),
  competitorId: z.string().uuid().nullish(),
  status: z.enum(['active', 'inactive', 'unknown']).optional(),
});

export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'inspiration_ads', params.id!, caller, 'The saved ad');
  return (await toInspirationViews(sb, caller.workspaceId, [row]))[0];
});

export const PATCH = route({ body: patch }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'inspiration_ads', params.id!, caller, 'The saved ad');
  if (body.assetId) {
    const asset = await owned(sb, 'assets', body.assetId, caller, 'The file');
    if (asset.type !== 'video' && asset.type !== 'image') throw badRequest('Save a video or an image as the ad creative.');
  }
  if (body.competitorId) await owned(sb, 'competitors', body.competitorId, caller, 'The competitor');
  const updated = check(
    await sb
      .from('inspiration_ads')
      .update({
        ...(body.brand !== undefined ? { brand: body.brand } : {}),
        ...(body.sourceUrl !== undefined ? { source_url: body.sourceUrl ?? null } : {}),
        ...(body.assetId !== undefined ? { asset_id: body.assetId ?? null } : {}),
        ...(body.headline !== undefined ? { headline: body.headline ?? null } : {}),
        ...(body.body !== undefined ? { body: body.body ?? null } : {}),
        ...(body.cta !== undefined ? { cta: body.cta ?? null } : {}),
        ...(body.tags ? { tags: [...new Set(body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))] } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        ...(body.isFavorite !== undefined ? { is_favorite: body.isFavorite } : {}),
        ...(body.competitorId !== undefined ? { competitor_id: body.competitorId ?? null } : {}),
        ...(body.status ? { status: body.status } : {}),
      })
      .eq('id', row.id)
      .select('*')
      .single(),
    'Could not save the ad',
  );
  return (await toInspirationViews(sb, caller.workspaceId, [updated]))[0];
});

export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'inspiration_ads', params.id!, caller, 'The saved ad');
  check(await sb.from('inspiration_ads').delete().eq('id', row.id), 'Could not delete the ad');
});
