import { sleep } from '../../utils';
import { env } from '../env';
import { num, PlatformError } from '../social/http';
import { emptyInsights, type AdAccountInfo, type AdInsights, type AdsPlatform, type LaunchResult, type ReviewState } from './types';

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

/** TikTok targets countries by GeoNames id. */
export const TIKTOK_COUNTRY_IDS: Record<string, string> = {
  US: '6252001', GB: '2635167', CA: '6251999', AU: '2077456', NZ: '2186224', IE: '2963597', DE: '2921044', FR: '3017382', IT: '3175395', ES: '2510769',
  NL: '2750405', BE: '2802361', AT: '2782113', CH: '2658434', SE: '2661886', NO: '3144096', DK: '2623032', FI: '660013', PL: '798544', PT: '2264397',
  CZ: '3077311', HU: '719819', RO: '798549', GR: '390903', UA: '690791', TR: '298795', IL: '294640', AE: '290557', SA: '102358', QA: '289688',
  KW: '285570', BH: '290291', OM: '286963', EG: '357994', MA: '2542007', ZA: '953987', NG: '2328926', KE: '192950', IN: '1269750', PK: '1168579',
  BD: '1210997', ID: '1643084', MY: '1733045', SG: '1880251', TH: '1605651', VN: '1562822', PH: '1694008', JP: '1861060', KR: '1835841', TW: '1668284',
  HK: '1819730', BR: '3469034', MX: '3996063', AR: '3865483', CL: '3895114', CO: '3686110', PE: '3932488',
};

const AGE_GROUPS: [string, number, number][] = [
  ['AGE_18_24', 18, 24],
  ['AGE_25_34', 25, 34],
  ['AGE_35_44', 35, 44],
  ['AGE_45_54', 45, 54],
  ['AGE_55_100', 55, 100],
];

const CTA: Record<string, string> = {
  SHOP_NOW: 'SHOP_NOW',
  LEARN_MORE: 'LEARN_MORE',
  SIGN_UP: 'SIGN_UP',
  ORDER_NOW: 'ORDER_NOW',
  GET_OFFER: 'LEARN_MORE',
  DOWNLOAD: 'DOWNLOAD_NOW',
  BOOK_NOW: 'BOOK_NOW',
  CONTACT_US: 'CONTACT_US',
  SUBSCRIBE: 'SUBSCRIBE',
  WATCH_MORE: 'WATCH_NOW',
};

interface Envelope<T> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

async function call<T>(path: string, token: string | null, init: { query?: Record<string, unknown>; json?: unknown } = {}): Promise<T> {
  const qs = init.query
    ? `?${new URLSearchParams(Object.fromEntries(Object.entries(init.query).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])))}`
    : '';
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(`${BASE}${path}${qs}`, {
      method: init.json === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { 'access-token': token } : {}), 'content-type': 'application/json' },
      ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    if (res && res.status < 500 && res.status !== 429) break;
    await sleep(1000 * 2 ** attempt);
  }
  if (!res) throw new PlatformError('tiktok_ads', 503, 'TikTok Ads could not be reached.', { retryable: true });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body || body.code !== 0) {
    const code = body?.code ?? res.status;
    const authExpired = code === 40001 || code === 40100 || code === 40104 || code === 40105 || res.status === 401;
    throw new PlatformError('tiktok_ads', res.ok ? 422 : res.status, `TikTok Ads: ${body?.message ?? `request failed (${res.status})`}`, { authExpired, retryable: code === 40100 || code === 50000 || code === 51021, details: body });
  }
  return body.data;
}

function ageGroups(min: number, max: number): string[] {
  return AGE_GROUPS.filter(([, lo, hi]) => hi >= min && lo <= max).map(([id]) => id);
}

const formatTime = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);

async function ensureIdentity(token: string, advertiserId: string, name: string, meta: Record<string, unknown>): Promise<string> {
  if (typeof meta.identityId === 'string' && meta.identityId) return meta.identityId;
  const res = await call<{ identity_id: string }>('/identity/create/', token, { json: { advertiser_id: advertiserId, display_name: name.slice(0, 40) } });
  return res.identity_id;
}

async function uploadVideo(token: string, advertiserId: string, url: string, name: string): Promise<{ videoId: string; coverUrl: string | null }> {
  const res = await call<{ video_id: string; video_cover_url?: string; poster_url?: string }[] | { video_id: string; video_cover_url?: string; poster_url?: string }>('/file/video/ad/upload/', token, {
    json: { advertiser_id: advertiserId, upload_type: 'UPLOAD_BY_URL', video_url: url, file_name: `${name.slice(0, 80)}-${Date.now()}.mp4` },
  });
  const v = Array.isArray(res) ? res[0] : res;
  if (!v?.video_id) throw new PlatformError('tiktok_ads', 502, 'TikTok Ads did not return a video id.');
  return { videoId: v.video_id, coverUrl: v.video_cover_url ?? v.poster_url ?? null };
}

async function uploadImage(token: string, advertiserId: string, url: string): Promise<string> {
  const res = await call<{ image_id: string }>('/file/image/ad/upload/', token, { json: { advertiser_id: advertiserId, upload_type: 'UPLOAD_BY_URL', image_url: url } });
  return res.image_id;
}

export const tiktokAds: AdsPlatform = {
  id: 'tiktok',
  label: 'TikTok Ads',
  configured: () => !!(env().TIKTOK_ADS_APP_ID && env().TIKTOK_ADS_SECRET),
  authorizeUrl({ state, redirectUri }) {
    const qs = new URLSearchParams({ app_id: env().TIKTOK_ADS_APP_ID!, state, redirect_uri: redirectUri });
    return `https://business-api.tiktok.com/portal/auth?${qs}`;
  },
  async exchange(code) {
    const data = await call<{ access_token: string; advertiser_ids?: string[]; scope?: number[] }>('/oauth2/access_token/', null, {
      json: { app_id: env().TIKTOK_ADS_APP_ID, secret: env().TIKTOK_ADS_SECRET, auth_code: code },
    });
    // Business API tokens do not expire unless the advertiser revokes access.
    return { accessToken: data.access_token, refreshToken: null, expiresAt: null, scopes: (data.scope ?? []).map(String), advertiserIds: data.advertiser_ids ?? [] };
  },
  async accounts(token) {
    const ids = token.advertiserIds ?? [];
    if (!ids.length) return [];
    const out: AdAccountInfo[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const res = await call<{ list: { advertiser_id: string; name: string; currency: string; timezone: string; status: string }[] }>('/advertiser/info/', token.accessToken, {
        query: { advertiser_ids: ids.slice(i, i + 100), fields: ['advertiser_id', 'name', 'currency', 'timezone', 'status'] },
      });
      for (const a of res.list) {
        const ok = a.status === 'STATUS_ENABLE';
        out.push({ externalId: a.advertiser_id, name: a.name, currency: a.currency, timezone: a.timezone, status: ok ? 'active' : 'error', statusDetail: ok ? null : `Advertiser status: ${a.status}`, meta: { identityId: null } });
      }
    }
    return out;
  },

  async launch(input): Promise<LaunchResult> {
    const { accessToken: token, account, campaign: c } = input;
    const advertiserId = account.externalId;
    const notes: string[] = [];
    if (c.objective !== 'traffic' && c.objective !== 'awareness') notes.push('TikTok campaigns from AdForge run as Traffic (website clicks). Set up a TikTok pixel in Ads Manager for conversion campaigns.');
    const reach = c.objective === 'awareness';
    const locations = c.countries.map((x) => TIKTOK_COUNTRY_IDS[x.toUpperCase()]);
    const missing = c.countries.filter((_, i) => !locations[i]);
    if (missing.length) throw new PlatformError('tiktok_ads', 400, `TikTok targeting is not available here for: ${missing.join(', ')}.`);
    if (c.dailyBudget < 20 && (account.currency ?? 'USD') === 'USD') throw new PlatformError('tiktok_ads', 400, 'TikTok needs a daily budget of at least $20 per ad group.');

    let campaignId = c.existing?.campaignId ?? null;
    if (!campaignId) {
      const res = await call<{ campaign_id: string }>('/campaign/create/', token, {
        json: { advertiser_id: advertiserId, campaign_name: c.name.slice(0, 512), objective_type: reach ? 'REACH' : 'TRAFFIC', budget_mode: 'BUDGET_MODE_INFINITE', operation_status: 'DISABLE' },
      });
      campaignId = res.campaign_id;
      await input.onCreated?.('campaign', null, campaignId);
    }

    let adsetId = c.existing?.adsetId ?? null;
    if (!adsetId) {
      const res = await call<{ adgroup_id: string }>('/adgroup/create/', token, {
        json: {
          advertiser_id: advertiserId,
          campaign_id: campaignId,
          adgroup_name: `${c.name} · ad group`.slice(0, 512),
          promotion_type: 'WEBSITE',
          placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
          location_ids: locations,
          age_groups: ageGroups(c.ageMin, c.ageMax),
          gender: 'GENDER_UNLIMITED',
          budget_mode: 'BUDGET_MODE_DAY',
          budget: Number(c.dailyBudget.toFixed(2)),
          schedule_type: 'SCHEDULE_FROM_NOW',
          schedule_start_time: formatTime(new Date(Date.now() + 10 * 60_000)),
          optimization_goal: reach ? 'REACH' : 'CLICK',
          billing_event: reach ? 'CPM' : 'CPC',
          bid_type: 'BID_TYPE_NO_BID',
          pacing: 'PACING_MODE_SMOOTH',
          operation_status: 'DISABLE',
        },
      });
      adsetId = res.adgroup_id;
      await input.onCreated?.('adset', null, adsetId);
    }

    const identityId = await ensureIdentity(token, advertiserId, account.name ?? 'Brand', account.meta);
    account.meta.identityId = identityId;
    const results: LaunchResult['ads'] = [];
    for (const ad of input.ads) {
      const r = { key: ad.key, adId: ad.existing?.adId ?? null, creativeId: null as string | null, videoId: ad.existing?.videoId ?? null, error: null as string | null };
      try {
        if (r.adId) {
          results.push(r);
          continue;
        }
        if (ad.media.kind !== 'video') throw new PlatformError('tiktok_ads', 400, 'TikTok ads from AdForge need a video.');
        let cover = ad.media.coverUrl ?? null;
        if (!r.videoId) {
          const up = await uploadVideo(token, advertiserId, ad.media.url, ad.name);
          r.videoId = up.videoId;
          cover = cover ?? up.coverUrl;
          await input.onCreated?.('video', ad.key, up.videoId);
        }
        if (!cover) {
          const info = await call<{ list: { video_cover_url?: string; poster_url?: string }[] }>('/file/video/ad/info/', token, { query: { advertiser_id: advertiserId, video_ids: [r.videoId] } });
          cover = info.list[0]?.video_cover_url ?? info.list[0]?.poster_url ?? null;
        }
        if (!cover) throw new PlatformError('tiktok_ads', 422, 'TikTok has not produced a cover for this video yet. Try again shortly.', { retryable: true });
        const imageId = await uploadImage(token, advertiserId, cover);
        const created = await call<{ ad_ids: string[] }>('/ad/create/', token, {
          json: {
            advertiser_id: advertiserId,
            adgroup_id: adsetId,
            creatives: [
              {
                ad_name: ad.name.slice(0, 512),
                identity_type: 'CUSTOMIZED_USER',
                identity_id: identityId,
                ad_format: 'SINGLE_VIDEO',
                video_id: r.videoId,
                image_ids: [imageId],
                ad_text: (ad.primaryText || ad.headline).replace(/\p{Extended_Pictographic}/gu, '').slice(0, 100),
                call_to_action: CTA[c.cta] ?? 'LEARN_MORE',
                landing_page_url: c.landingUrl,
              },
            ],
          },
        });
        r.adId = created.ad_ids[0] ?? null;
        if (!r.adId) throw new PlatformError('tiktok_ads', 502, 'TikTok Ads did not return the ad id.');
        await call('/ad/status/update/', token, { json: { advertiser_id: advertiserId, ad_ids: [r.adId], operation_status: 'DISABLE' } });
        await input.onCreated?.('ad', ad.key, r.adId);
      } catch (err) {
        r.error = (err as Error).message;
        if (err instanceof PlatformError && err.authExpired) throw err;
      }
      results.push(r);
    }
    return { campaignId, adsetId, ads: results, notes };
  },

  async setStatus(token, account, ids, status) {
    const op = status === 'active' ? 'ENABLE' : 'DISABLE';
    const advertiser_id = account.externalId;
    if (status === 'active') {
      await call('/campaign/status/update/', token, { json: { advertiser_id, campaign_ids: [ids.campaignId], operation_status: 'ENABLE' } });
      if (ids.adsetId) await call('/adgroup/status/update/', token, { json: { advertiser_id, adgroup_ids: [ids.adsetId], operation_status: 'ENABLE' } });
    }
    await call('/ad/status/update/', token, { json: { advertiser_id, ad_ids: [ids.adId], operation_status: op } });
  },

  async insights(token, account, adIds) {
    if (!adIds.length) return {};
    const res = await call<{ list: { dimensions: { ad_id: string }; metrics: Record<string, string> }[] }>('/report/integrated/get/', token, {
      query: {
        advertiser_id: account.externalId,
        report_type: 'BASIC',
        data_level: 'AUCTION_AD',
        dimensions: ['ad_id'],
        metrics: ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'conversion', 'cost_per_conversion', 'video_play_actions', 'video_watched_6s', 'complete_payment_roas'],
        filtering: [{ field_name: 'ad_ids', filter_type: 'IN', filter_value: JSON.stringify(adIds) }],
        query_lifetime: true,
        page_size: 1000,
      },
    });
    const out: Record<string, AdInsights> = {};
    for (const row of res.list) {
      const m = row.metrics;
      const o = emptyInsights(m);
      o.spend = num(m.spend);
      o.impressions = num(m.impressions);
      o.clicks = num(m.clicks);
      // TikTok reports CTR in percent, like Meta.
      o.ctr = num(m.ctr);
      o.cpc = num(m.cpc);
      o.cpm = num(m.cpm);
      o.conversions = num(m.conversion);
      o.cpa = num(m.cost_per_conversion);
      o.videoViews = num(m.video_play_actions);
      o.thruplays = num(m.video_watched_6s);
      o.roas = num(m.complete_payment_roas);
      out[row.dimensions.ad_id] = o;
    }
    return out;
  },

  async review(token, account, adIds) {
    if (!adIds.length) return {};
    const res = await call<{ list: { ad_id: string; operation_status: string; secondary_status: string }[] }>('/ad/get/', token, {
      query: { advertiser_id: account.externalId, filtering: { ad_ids: adIds }, fields: ['ad_id', 'operation_status', 'secondary_status'], page_size: 100 },
    });
    const out: Record<string, ReviewState> = {};
    for (const ad of res.list) {
      const s = ad.secondary_status ?? '';
      out[ad.ad_id] = {
        status: /NOT_APPROVE|REJECT/.test(s) ? 'rejected' : /AUDIT|REVIEW/.test(s) ? 'pending_review' : /DELETE/.test(s) ? 'archived' : ad.operation_status === 'DISABLE' || /DISABLE/.test(s) ? 'paused' : /DELIVERY_OK|ENABLE/.test(s) ? 'active' : 'unknown',
        detail: s || null,
      };
    }
    return out;
  },
};
