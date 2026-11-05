import * as z from 'zod';
import { check, owned, route } from '@/lib/server/api';
import { toCompetitorView } from '@/lib/server/growth';

const patch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  website: z.string().url().max(500).regex(/^https?:\/\//i, 'Use an http or https link.').nullish(),
  metaPageId: z.string().regex(/^[0-9]{1,40}$/, 'A Facebook Page id is a number.').nullish(),
  tiktokHandle: z.string().max(60).nullish(),
  countries: z.array(z.string().length(2)).min(1).max(30).optional(),
  notes: z.string().max(2000).nullish(),
  isActive: z.boolean().optional(),
});

export const GET = route({}, async ({ sb, caller, params }) => toCompetitorView(await owned(sb, 'competitors', params.id!, caller, 'The competitor')));

export const PATCH = route({ body: patch }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'competitors', params.id!, caller, 'The competitor');
  const updated = check(
    await sb
      .from('competitors')
      .update({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.website !== undefined ? { website: body.website ?? null } : {}),
        ...(body.metaPageId !== undefined ? { meta_page_id: body.metaPageId || null } : {}),
        ...(body.tiktokHandle !== undefined ? { tiktok_handle: body.tiktokHandle?.replace(/^@/, '') || null } : {}),
        ...(body.countries ? { countries: [...new Set(body.countries.map((c) => c.toUpperCase()))] } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
      })
      .eq('id', row.id)
      .select('*')
      .single(),
    'Could not save the competitor',
  );
  return toCompetitorView(updated);
});

/** Stops tracking. With `?ads=delete` the ads found for this brand leave the swipe file too, except favorites. */
export const DELETE = route({ query: z.object({ ads: z.enum(['keep', 'delete']).default('keep') }) }, async ({ sb, caller, params, query }) => {
  const row = await owned(sb, 'competitors', params.id!, caller, 'The competitor');
  if (query.ads === 'delete') check(await sb.from('inspiration_ads').delete().eq('workspace_id', caller.workspaceId).eq('competitor_id', row.id).eq('is_favorite', false), 'Could not delete the ads');
  check(await sb.from('competitors').delete().eq('id', row.id), 'Could not delete the competitor');
});
