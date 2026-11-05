import { asJson, type CompetitorRow } from '@adforge/core';
import { ads } from '@adforge/core/server';
import { activity } from '../lib/activity';
import { PermanentError, userMessage } from '../lib/errors';
import { nowIso } from '../lib/util';
import type { JobContext, JobHandler } from '../runner';

const STALE_MS = 20 * 3600_000;
const SWEEP_LIMIT = 20;

/** Most common page among results whose page name matches the competitor's name. */
function matchBrand(found: ads.LibraryAd[], name: string): { matches: ads.LibraryAd[]; pageId: string | null } {
  const target = name.trim().toLowerCase();
  let matches = found.filter((a) => a.brand.trim().toLowerCase() === target);
  if (!matches.length) matches = found.filter((a) => a.brand.toLowerCase().includes(target));
  const counts = new Map<string, number>();
  for (const a of matches) if (a.pageId) counts.set(a.pageId, (counts.get(a.pageId) ?? 0) + 1);
  const pageId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { matches: pageId ? matches.filter((a) => a.pageId === pageId) : matches, pageId };
}

async function syncCompetitor(ctx: JobContext, c: CompetitorRow) {
  const query = c.meta_page_id ? { pageIds: [c.meta_page_id] } : { terms: c.name };
  const found = await ads.searchWorkspaceAdLibrary(ctx.sb, c.workspace_id, { ...query, countries: c.countries, activeOnly: false, limit: 200 });
  // A keyword search returns any ad that mentions the name; keep the brand's own page and remember it.
  const { matches, pageId } = c.meta_page_id ? { matches: found, pageId: c.meta_page_id } : matchBrand(found, c.name);

  const existing = new Set<string>();
  const ids = matches.map((a) => a.externalId);
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await ctx.sb.from('inspiration_ads').select('external_id').eq('workspace_id', c.workspace_id).eq('platform', 'meta').in('external_id', ids.slice(i, i + 100));
    for (const r of data ?? []) if (r.external_id) existing.add(r.external_id);
  }

  const now = nowIso();
  const rows = matches.map((a) => ({
    workspace_id: c.workspace_id,
    competitor_id: c.id,
    platform: 'meta',
    external_id: a.externalId,
    brand: a.brand.slice(0, 200),
    headline: a.headline,
    body: a.body,
    source_url: a.libraryUrl,
    started_at: a.startedAt,
    stopped_at: a.stoppedAt,
    status: a.active ? 'active' : 'inactive',
    last_seen_at: now,
    last_checked_at: now,
    metrics: asJson({ daysRunning: a.daysRunning, euReach: a.euReach, platforms: a.platforms, languages: a.languages, description: a.description }),
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await ctx.sb.from('inspiration_ads').upsert(rows.slice(i, i + 100), { onConflict: 'workspace_id,platform,external_id' });
    if (error) throw new Error(`Could not save competitor ads: ${error.message}`);
  }

  const [{ count: total }, { count: active }] = await Promise.all([
    ctx.sb.from('inspiration_ads').select('id', { count: 'exact', head: true }).eq('competitor_id', c.id),
    ctx.sb.from('inspiration_ads').select('id', { count: 'exact', head: true }).eq('competitor_id', c.id).eq('status', 'active'),
  ]);
  await ctx.sb
    .from('competitors')
    .update({ ad_count: total ?? 0, active_ad_count: active ?? 0, last_synced_at: now, last_error: null, ...(pageId && !c.meta_page_id ? { meta_page_id: pageId } : {}) })
    .eq('id', c.id);

  const added = matches.filter((a) => !existing.has(a.externalId));
  // The first sync imports history; later syncs report what is new.
  if (c.last_synced_at && added.length) {
    await activity(ctx.sb, {
      workspaceId: c.workspace_id,
      verb: 'competitor.new_ads',
      objectType: 'competitor',
      objectId: c.id,
      data: { name: c.name, count: added.length, active: added.filter((a) => a.active).length },
    });
  }
  return { found: matches.length, added: added.length, active: active ?? 0 };
}

export const competitorsSync: JobHandler<'competitors.sync'> = {
  async run(ctx, { competitorId }) {
    if (competitorId) {
      let q = ctx.sb.from('competitors').select('*').eq('id', competitorId);
      if (ctx.job.workspace_id) q = q.eq('workspace_id', ctx.job.workspace_id);
      const { data: competitor } = await q.maybeSingle();
      if (!competitor) throw new PermanentError('This competitor no longer exists.');
      ctx.progress(10, `Checking ${competitor.name}`);
      return syncCompetitor(ctx, competitor);
    }

    // Scheduled sweep over competitors not checked in the last day.
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    let q = ctx.sb
      .from('competitors')
      .select('*')
      .eq('is_active', true)
      .or(`last_synced_at.is.null,last_synced_at.lt."${cutoff}"`)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(SWEEP_LIMIT);
    if (ctx.job.workspace_id) q = q.eq('workspace_id', ctx.job.workspace_id);
    const { data: list, error } = await q;
    if (error) throw new Error(`Could not load competitors: ${error.message}`);
    let synced = 0;
    let failed = 0;
    for (const [i, c] of (list ?? []).entries()) {
      ctx.checkAborted();
      ctx.progress((i / (list?.length || 1)) * 100, `Checking ${c.name}`);
      try {
        await syncCompetitor(ctx, c);
        synced++;
      } catch (err) {
        if ((err as { name?: string }).name === 'JobAborted') throw err;
        failed++;
        await ctx.sb.from('competitors').update({ last_error: userMessage(err), last_synced_at: nowIso() }).eq('id', c.id);
        ctx.log.warn({ competitorId: c.id, err: userMessage(err) }, 'competitor sync failed');
      }
    }
    return { synced, failed };
  },
  async onFailure(ctx, { competitorId }, message) {
    if (competitorId) await ctx.sb.from('competitors').update({ last_error: message }).eq('id', competitorId);
  },
};
