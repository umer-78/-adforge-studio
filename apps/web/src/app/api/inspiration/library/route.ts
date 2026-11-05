import { asJson } from '@adforge/core';
import { ads } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toInspirationViews } from '@/lib/server/growth';
import type { LibraryAdView } from '@/lib/types';

const query = z.object({
  q: z.string().trim().max(100).optional(),
  pageId: z.string().regex(/^[0-9]{1,40}$/, 'A Facebook Page id is a number.').optional(),
  countries: z
    .string()
    .regex(/^[A-Za-z]{2}(,[A-Za-z]{2})*$/, 'Countries are 2-letter codes separated by commas.')
    .default('DE,FR,IE')
    .transform((v) => v.toUpperCase().split(',')),
  active: z.enum(['1', '0']).default('1'),
});

/** Live search of Meta's Ad Library (EU-delivered ads), marking results already saved. */
export const GET = route({ query, limit: ['ad-library', 60, 3600] }, async ({ sb, caller, query: q }) => {
  if (!q.q && !q.pageId) throw badRequest('Search for a brand or keyword, or give a Facebook Page id.');
  const found = await ads.searchWorkspaceAdLibrary(sb, caller.workspaceId, { ...(q.pageId ? { pageIds: [q.pageId] } : { terms: q.q! }), countries: q.countries, activeOnly: q.active === '1', limit: 60 });
  const ids = found.map((a) => a.externalId);
  const { data: saved } = ids.length ? await sb.from('inspiration_ads').select('id, external_id').eq('workspace_id', caller.workspaceId).eq('platform', 'meta').in('external_id', ids) : { data: [] };
  const savedBy = new Map((saved ?? []).map((r) => [r.external_id, r.id]));
  const items: LibraryAdView[] = found.map((a) => ({ ...a, savedId: savedBy.get(a.externalId) ?? null }));
  return { items };
});

const libraryAd = z.object({
  externalId: z.string().regex(/^[0-9]{1,40}$/),
  pageId: z.string().max(40).nullable(),
  brand: z.string().min(1).max(200),
  body: z.string().max(5000).nullable(),
  headline: z.string().max(500).nullable(),
  description: z.string().max(2000).nullable(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  stoppedAt: z.string().datetime({ offset: true }).nullable(),
  active: z.boolean(),
  daysRunning: z.number().int().min(0).nullable(),
  platforms: z.array(z.string().max(40)).max(10),
  languages: z.array(z.string().max(10)).max(20),
  euReach: z.number().min(0).nullable(),
  libraryUrl: z.string().url().max(500),
});

/** Saves Ad Library results to the swipe file; saving again refreshes them. */
export const POST = route({ body: z.object({ ads: z.array(libraryAd).min(1).max(50), competitorId: z.string().uuid().nullish(), tags: z.array(z.string().max(60)).max(10).default([]) }) }, async ({ sb, caller, body }) => {
  if (body.competitorId) await owned(sb, 'competitors', body.competitorId, caller, 'The competitor');
  const now = new Date().toISOString();
  const tags = body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  // Saving again refreshes what the library reports but keeps the tags and owner already there.
  const { data: existing } = await sb
    .from('inspiration_ads')
    .select('external_id, tags, created_by')
    .eq('workspace_id', caller.workspaceId)
    .eq('platform', 'meta')
    .in('external_id', body.ads.map((a) => a.externalId));
  const before = new Map((existing ?? []).map((r) => [r.external_id, r]));
  const rows = body.ads.map((a) => ({
    workspace_id: caller.workspaceId,
    platform: 'meta',
    external_id: a.externalId,
    brand: a.brand,
    headline: a.headline,
    body: a.body,
    source_url: a.libraryUrl.startsWith('https://www.facebook.com/ads/library/') ? a.libraryUrl : `https://www.facebook.com/ads/library/?id=${a.externalId}`,
    started_at: a.startedAt,
    stopped_at: a.stoppedAt,
    status: a.active ? 'active' : 'inactive',
    last_seen_at: now,
    last_checked_at: now,
    tags: [...new Set([...(before.get(a.externalId)?.tags ?? []), ...tags])],
    metrics: asJson({ daysRunning: a.daysRunning, euReach: a.euReach, platforms: a.platforms, languages: a.languages, description: a.description, pageId: a.pageId }),
    ...(body.competitorId ? { competitor_id: body.competitorId } : {}),
    created_by: before.has(a.externalId) ? (before.get(a.externalId)!.created_by ?? null) : caller.userId,
  }));
  const saved = check(await sb.from('inspiration_ads').upsert(rows, { onConflict: 'workspace_id,platform,external_id' }).select('*'), 'Could not save the ads');
  await logActivity(sb, caller, 'inspiration.save', 'inspiration_ad', null, { count: saved.length, source: 'ad_library' });
  return { items: await toInspirationViews(sb, caller.workspaceId, saved) };
});
