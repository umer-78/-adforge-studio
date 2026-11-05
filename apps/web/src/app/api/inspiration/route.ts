import { inspirationCreateSchema } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, logActivity, orIlike, owned, route } from '@/lib/server/api';
import { toInspirationViews } from '@/lib/server/growth';

const PLATFORMS = ['meta', 'tiktok', 'youtube', 'instagram', 'x', 'linkedin', 'pinterest', 'other'] as const;

const query = z.object({
  q: z.string().max(200).optional(),
  platform: z.enum(PLATFORMS).optional(),
  status: z.enum(['active', 'inactive', 'unknown']).optional(),
  competitorId: z.string().uuid().optional(),
  favorites: z.enum(['1', 'true']).optional(),
  tag: z.string().max(60).optional(),
  /** `longest`: earliest start first, the ads that have kept running (and likely paying) the longest. */
  sort: z.enum(['recent', 'longest']).default('recent'),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('inspiration_ads').select('*', { count: 'exact' }).eq('workspace_id', caller.workspaceId);
  if (q.q?.trim()) req = req.or(orIlike(['brand', 'headline', 'body', 'notes'], q.q));
  if (q.platform) req = req.eq('platform', q.platform);
  if (q.status) req = req.eq('status', q.status);
  if (q.competitorId) req = req.eq('competitor_id', q.competitorId);
  if (q.favorites) req = req.eq('is_favorite', true);
  if (q.tag) req = req.contains('tags', [q.tag]);
  req = q.sort === 'longest' ? req.order('started_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }) : req.order('last_seen_at', { ascending: false }).order('created_at', { ascending: false });
  const { data, error, count } = await req.range(q.offset, q.offset + q.limit - 1);
  if (error) throw new Error(`Could not load saved ads: ${error.message}`);
  const total = count ?? 0;
  return { items: await toInspirationViews(sb, caller.workspaceId, data ?? []), total, nextOffset: q.offset + q.limit < total ? q.offset + q.limit : null };
});

/** Saves an ad to the swipe file by hand: a link, an uploaded copy of the creative and its copy. */
export const POST = route({ body: inspirationCreateSchema, limit: ['inspiration', 300, 3600] }, async ({ sb, caller, body }) => {
  if (body.assetId) {
    const asset = await owned(sb, 'assets', body.assetId, caller, 'The file');
    if (asset.type !== 'video' && asset.type !== 'image') throw badRequest('Save a video or an image as the ad creative.');
  }
  if (body.competitorId) await owned(sb, 'competitors', body.competitorId, caller, 'The competitor');
  if (!body.sourceUrl && !body.assetId && !body.headline && !body.body) throw badRequest('Add a link, the creative or the ad copy.');
  const row = check(
    await sb
      .from('inspiration_ads')
      .insert({
        workspace_id: caller.workspaceId,
        brand: body.brand,
        platform: body.platform,
        source_url: body.sourceUrl ?? null,
        asset_id: body.assetId ?? null,
        headline: body.headline ?? null,
        body: body.body ?? null,
        cta: body.cta ?? null,
        tags: [...new Set(body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
        notes: body.notes ?? null,
        competitor_id: body.competitorId ?? null,
        status: 'unknown',
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not save the ad',
  );
  await logActivity(sb, caller, 'inspiration.save', 'inspiration_ad', row.id, { brand: row.brand });
  return (await toInspirationViews(sb, caller.workspaceId, [row]))[0];
});
