import 'server-only';
import { AppError, parseBioTheme, SIGNED_URL_TTL, type BioPageSave } from '@adforge/core';
import { storage, type ServiceClient } from '@adforge/core/server';
import type { BioPageView, BioStats } from '@/lib/types';

/** A square-ish preview of the avatar, signed for an hour. */
async function avatarUrls(sb: ServiceClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data } = await sb.from('assets').select('id, storage_driver, storage_key, thumbnail_key, type').in('id', ids).is('deleted_at', null);
  await Promise.all(
    (data ?? [])
      .filter((a) => a.type === 'image')
      .map(async (a) => {
        const url = await storage(a.storage_driver)
          .signedReadUrl(a.thumbnail_key ?? a.storage_key, SIGNED_URL_TTL.preview)
          .catch(() => null);
        if (url) out.set(a.id, url);
      }),
  );
  return out;
}

type PageRow = { id: string; slug: string; title: string; bio: string; avatar_asset_id: string | null; theme: unknown; published: boolean; views: number; created_at: string };

export async function toBioViews(sb: ServiceClient, pages: PageRow[], opts: { onlyEnabled?: boolean } = {}): Promise<BioPageView[]> {
  if (!pages.length) return [];
  let q = sb.from('bio_links').select('id, page_id, label, url, enabled, clicks, position').in('page_id', pages.map((p) => p.id)).order('position').order('created_at');
  if (opts.onlyEnabled) q = q.eq('enabled', true);
  const [{ data: links, error }, avatars] = await Promise.all([q, avatarUrls(sb, pages.map((p) => p.avatar_asset_id).filter((x): x is string => !!x))]);
  if (error) throw new Error(`Could not load the links: ${error.message}`);
  return pages.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    bio: p.bio,
    avatarAssetId: p.avatar_asset_id,
    avatarUrl: p.avatar_asset_id ? (avatars.get(p.avatar_asset_id) ?? null) : null,
    theme: parseBioTheme(p.theme),
    published: p.published,
    views: Number(p.views),
    links: (links ?? []).filter((l) => l.page_id === p.id).map((l) => ({ id: l.id, label: l.label, url: l.url, enabled: l.enabled, clicks: Number(l.clicks) })),
    createdAt: p.created_at,
  }));
}

/** The published page behind a handle, or null. */
export async function publishedBioPage(sb: ServiceClient, slug: string): Promise<BioPageView | null> {
  const { data } = await sb.from('bio_pages').select('*').eq('slug', slug.toLowerCase()).eq('published', true).maybeSingle();
  if (!data) return null;
  return (await toBioViews(sb, [data], { onlyEnabled: true }))[0] ?? null;
}

/** Replaces a page's links with the given list, keeping click counts on the ones that stay. */
export async function saveBioLinks(sb: ServiceClient, page: { id: string; workspace_id: string }, links: BioPageSave['links']) {
  const { data: existing, error } = await sb.from('bio_links').select('id').eq('page_id', page.id);
  if (error) throw new Error(`Could not load the links: ${error.message}`);
  const known = new Set((existing ?? []).map((l) => l.id));
  const keep = new Set(links.map((l) => l.id).filter((id): id is string => !!id && known.has(id)));
  const removed = [...known].filter((id) => !keep.has(id));
  if (removed.length) {
    const { error: e } = await sb.from('bio_links').delete().eq('page_id', page.id).in('id', removed);
    if (e) throw new Error(`Could not remove links: ${e.message}`);
  }
  const rows = links.map((l, position) => ({ page_id: page.id, workspace_id: page.workspace_id, label: l.label, url: l.url, enabled: l.enabled, position }));
  const updates = links.flatMap((l, i) => (l.id && keep.has(l.id) ? [{ ...rows[i]!, id: l.id }] : []));
  const inserts = links.flatMap((l, i) => (l.id && keep.has(l.id) ? [] : [rows[i]!]));
  if (updates.length) {
    const { error: e } = await sb.from('bio_links').upsert(updates, { onConflict: 'id' });
    if (e) throw new Error(`Could not save links: ${e.message}`);
  }
  if (inserts.length) {
    const { error: e } = await sb.from('bio_links').insert(inserts);
    if (e) throw new Error(`Could not add links: ${e.message}`);
  }
}

/** The avatar must be a photo in the same workspace. */
export async function checkBioAvatar(sb: ServiceClient, workspaceId: string, assetId: string | null | undefined) {
  if (!assetId) return;
  const { data } = await sb.from('assets').select('type').eq('id', assetId).eq('workspace_id', workspaceId).is('deleted_at', null).maybeSingle();
  if (!data || data.type !== 'image') throw new AppError('invalid_request', 'Pick a photo from the library for the profile picture.', 400);
}

/** Views and clicks per day over the last `days` days, oldest first, with empty days filled in. */
export async function bioStats(sb: ServiceClient, pageId: string, days = 30): Promise<BioStats> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await sb.from('bio_daily').select('link_id, day, count').eq('page_id', pageId).gte('day', since);
  if (error) throw new Error(`Could not load the stats: ${error.message}`);
  const byDay = new Map<string, { views: number; clicks: number }>();
  const linkClicks: Record<string, number> = {};
  for (const r of data ?? []) {
    const d = byDay.get(r.day) ?? { views: 0, clicks: 0 };
    if (r.link_id) {
      d.clicks += r.count;
      linkClicks[r.link_id] = (linkClicks[r.link_id] ?? 0) + r.count;
    } else d.views += r.count;
    byDay.set(r.day, d);
  }
  const out: BioStats['days'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day, ...(byDay.get(day) ?? { views: 0, clicks: 0 }) });
  }
  return { days: out, linkClicks };
}
