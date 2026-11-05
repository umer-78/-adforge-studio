import { AppError } from '../../utils';
import { env } from '../env';
import { api } from '../social/http';
import { graph, metaAuthError } from '../social/meta';

export interface LibraryAd {
  externalId: string;
  pageId: string | null;
  brand: string;
  body: string | null;
  headline: string | null;
  description: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  active: boolean;
  daysRunning: number | null;
  platforms: string[];
  languages: string[];
  euReach: number | null;
  libraryUrl: string;
}

interface ArchiveRow {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  publisher_platforms?: string[];
  languages?: string[];
  eu_total_reach?: number;
}

const FIELDS = [
  'id',
  'page_id',
  'page_name',
  'ad_creative_bodies',
  'ad_creative_link_titles',
  'ad_creative_link_descriptions',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'publisher_platforms',
  'languages',
  'eu_total_reach',
].join(',');

/**
 * Searches Meta's Ad Library. Commercial ads are only available for ads delivered in the EU/UK,
 * so `countries` must include at least one of those. The token must belong to a user who has
 * confirmed their identity with Meta.
 */
export async function searchAdLibrary(opts: {
  token?: string | null;
  pageIds?: string[];
  terms?: string | null;
  countries: string[];
  activeOnly?: boolean;
  limit?: number;
}): Promise<LibraryAd[]> {
  const token = opts.token ?? env().META_AD_LIBRARY_TOKEN;
  if (!token) throw new AppError('ad_library_not_configured', 'Add META_AD_LIBRARY_TOKEN or connect a Meta ad account to track competitor ads.', 501);
  if (!opts.pageIds?.length && !opts.terms) throw new AppError('invalid_request', 'Give a Facebook Page id or a search term.', 400);
  const params = new URLSearchParams({
    ad_reached_countries: JSON.stringify(opts.countries.map((c) => c.toUpperCase())),
    ad_active_status: opts.activeOnly === false ? 'ALL' : 'ACTIVE',
    ad_type: 'ALL',
    fields: FIELDS,
    limit: '100',
    access_token: token,
  });
  if (opts.pageIds?.length) params.set('search_page_ids', JSON.stringify(opts.pageIds.slice(0, 10)));
  else {
    params.set('search_terms', opts.terms!.slice(0, 100));
    params.set('search_type', 'KEYWORD_UNORDERED');
  }
  const max = opts.limit ?? 200;
  const out: LibraryAd[] = [];
  let next: string | null = `${graph('/ads_archive')}?${params}`;
  while (next && out.length < max) {
    const res: { data: { data: ArchiveRow[]; paging?: { next?: string } } } = await api<{ data: ArchiveRow[]; paging?: { next?: string } }>('meta', next, { retries: 2 }, metaAuthError);
    for (const r of res.data.data) {
      const started = r.ad_delivery_start_time ? new Date(r.ad_delivery_start_time) : null;
      const stopped = r.ad_delivery_stop_time ? new Date(r.ad_delivery_stop_time) : null;
      const end = stopped ?? new Date();
      out.push({
        externalId: r.id,
        pageId: r.page_id ?? null,
        brand: r.page_name ?? 'Unknown',
        body: r.ad_creative_bodies?.[0] ?? null,
        headline: r.ad_creative_link_titles?.[0] ?? null,
        description: r.ad_creative_link_descriptions?.[0] ?? null,
        startedAt: started?.toISOString() ?? null,
        stoppedAt: stopped?.toISOString() ?? null,
        active: !stopped || stopped.getTime() > Date.now(),
        daysRunning: started ? Math.max(0, Math.round((end.getTime() - started.getTime()) / 86400_000)) : null,
        platforms: r.publisher_platforms ?? [],
        languages: r.languages ?? [],
        euReach: r.eu_total_reach ?? null,
        libraryUrl: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(r.id)}`,
      });
      if (out.length >= max) break;
    }
    next = res.data.paging?.next ?? null;
  }
  return out;
}
