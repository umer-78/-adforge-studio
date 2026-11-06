import { sleep } from '../../utils';
import { env } from '../env';
import { api, num, PlatformError } from '../social/http';
import { graph, metaAuthError, metaAuthorizeUrl, metaExchange, metaGet, metaPost, metaUserId } from '../social/meta';
import { emptyInsights, type AdAccountInfo, type AdInsights, type AdObjective, type AdsPlatform, type LaunchResult, type ReviewState } from './types';

const ADS_SCOPES = ['ads_management', 'ads_read', 'business_management', 'pages_show_list', 'pages_read_engagement', 'instagram_basic'];

/** Currencies Meta bills in whole units; all others use cents. */
const ZERO_DECIMAL = new Set(['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND']);
export const toMinorUnits = (amount: number, currency: string | null) => Math.round(amount * (ZERO_DECIMAL.has((currency ?? 'USD').toUpperCase()) ? 1 : 100));

interface ObjectiveSpec {
  objective: string;
  goal: (hasPixel: boolean) => string;
  destination?: string;
  event?: string;
}

const OBJECTIVES: Record<AdObjective, ObjectiveSpec> = {
  traffic: { objective: 'OUTCOME_TRAFFIC', goal: () => 'LINK_CLICKS', destination: 'WEBSITE' },
  sales: { objective: 'OUTCOME_SALES', goal: (pixel) => (pixel ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS'), destination: 'WEBSITE', event: 'PURCHASE' },
  leads: { objective: 'OUTCOME_LEADS', goal: (pixel) => (pixel ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS'), destination: 'WEBSITE', event: 'LEAD' },
  engagement: { objective: 'OUTCOME_ENGAGEMENT', goal: () => 'POST_ENGAGEMENT', destination: 'ON_POST' },
  awareness: { objective: 'OUTCOME_AWARENESS', goal: () => 'REACH' },
  video_views: { objective: 'OUTCOME_ENGAGEMENT', goal: () => 'THRUPLAY', destination: 'ON_VIDEO' },
};

const ACCOUNT_STATUS: Record<number, string> = { 1: 'active', 2: 'disabled', 3: 'unsettled', 7: 'pending risk review', 8: 'pending settlement', 9: 'in grace period', 100: 'pending closure', 101: 'closed', 201: 'any active', 202: 'any closed' };

async function waitForVideo(token: string, videoId: string) {
  for (let i = 0; i < 60; i++) {
    const v = await metaGet<{ status?: { video_status?: string; processing_progress?: number } }>(`/${videoId}`, token, { fields: 'status' });
    const s = v.status?.video_status;
    if (s === 'ready') return;
    if (s === 'error') throw new PlatformError('meta', 422, 'Meta could not process the ad video.');
    await sleep(5000);
  }
  throw new PlatformError('meta', 504, 'Meta is still processing the ad video. Try launching again in a few minutes.', { retryable: true });
}

async function videoThumbnail(token: string, videoId: string): Promise<string | null> {
  const res = await metaGet<{ data: { uri: string; is_preferred: boolean }[] }>(`/${videoId}/thumbnails`, token, { fields: 'uri,is_preferred' }).catch(() => ({ data: [] }));
  return (res.data.find((t) => t.is_preferred) ?? res.data[0])?.uri ?? null;
}

async function uploadImage(token: string, accountId: string, url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new PlatformError('meta', 422, 'Could not read the ad image.');
  const bytes = Buffer.from(await res.arrayBuffer()).toString('base64');
  const out = await metaPost<{ images: Record<string, { hash: string }> }>(`/${accountId}/adimages`, token, { bytes });
  const hash = Object.values(out.images)[0]?.hash;
  if (!hash) throw new PlatformError('meta', 502, 'Meta did not return an image hash.');
  return hash;
}

function insightsFrom(row: Record<string, unknown>): AdInsights {
  const actions = (row.actions as { action_type: string; value: string }[] | undefined) ?? [];
  const action = (...types: string[]) => {
    for (const t of types) {
      const a = actions.find((x) => x.action_type === t);
      if (a) return Number(a.value);
    }
    return null;
  };
  const conversions = action('purchase', 'offsite_conversion.fb_pixel_purchase', 'lead', 'offsite_conversion.fb_pixel_lead', 'complete_registration');
  const spend = num(row.spend);
  const roas = (row.purchase_roas as { value: string }[] | undefined)?.[0]?.value;
  const thru = (row.video_thruplay_watched_actions as { value: string }[] | undefined)?.[0]?.value;
  const plays = (row.video_play_actions as { value: string }[] | undefined)?.[0]?.value;
  const out = emptyInsights(row);
  out.impressions = num(row.impressions);
  out.clicks = num(row.inline_link_clicks) ?? num(row.clicks);
  out.spend = spend;
  out.ctr = num(row.inline_link_click_ctr) ?? num(row.ctr);
  out.cpc = num(row.cost_per_inline_link_click) ?? num(row.cpc);
  out.cpm = num(row.cpm);
  out.conversions = conversions;
  out.cpa = conversions && spend != null ? spend / conversions : null;
  out.roas = roas != null ? Number(roas) : null;
  out.videoViews = plays != null ? Number(plays) : null;
  out.thruplays = thru != null ? Number(thru) : null;
  return out;
}

export const metaAds: AdsPlatform = {
  id: 'meta',
  label: 'Meta Ads',
  configured: () => !!(env().META_APP_ID && env().META_APP_SECRET),
  authorizeUrl: ({ state, redirectUri }) => metaAuthorizeUrl(ADS_SCOPES, state, redirectUri),
  exchange: (code, redirectUri) => metaExchange(code, redirectUri),
  async accounts(token) {
    const [accounts, pages, fbUserId] = await Promise.all([
      metaGet<{ data: { id: string; name: string; currency: string; timezone_name: string; account_status: number; disable_reason?: number }[] }>('/me/adaccounts', token.accessToken, {
        fields: 'id,name,currency,timezone_name,account_status,disable_reason',
        limit: '100',
      }),
      metaGet<{ data: { id: string; name: string; instagram_business_account?: { id: string; username?: string } }[] }>('/me/accounts', token.accessToken, {
        fields: 'id,name,instagram_business_account{id,username}',
        limit: '100',
      }).catch(() => ({ data: [] })),
      metaUserId(token.accessToken),
    ]);
    const identities = pages.data.map((p) => ({ pageId: p.id, pageName: p.name, instagramUserId: p.instagram_business_account?.id ?? null, instagramUsername: p.instagram_business_account?.username ?? null }));
    return accounts.data.map(
      (a): AdAccountInfo => ({
        externalId: a.id,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone_name,
        status: a.account_status === 1 ? 'active' : 'error',
        statusDetail: a.account_status === 1 ? null : `Ad account is ${ACCOUNT_STATUS[a.account_status] ?? 'unavailable'}.`,
        meta: { identities, pageId: identities[0]?.pageId ?? null, instagramUserId: identities[0]?.instagramUserId ?? null, pixelId: null, fbUserId },
      }),
    );
  },

  async launch(input): Promise<LaunchResult> {
    const { accessToken: token, account, campaign: c } = input;
    const act = account.externalId.startsWith('act_') ? account.externalId : `act_${account.externalId}`;
    const pageId = typeof account.meta.pageId === 'string' ? account.meta.pageId : null;
    if (!pageId) throw new PlatformError('meta', 400, 'Pick the Facebook Page your ads run as (Settings → Ad accounts).');
    const igUserId = typeof account.meta.instagramUserId === 'string' ? account.meta.instagramUserId : null;
    const pixelId = typeof account.meta.pixelId === 'string' && account.meta.pixelId ? account.meta.pixelId : null;
    const spec = OBJECTIVES[c.objective];
    const notes: string[] = [];
    if ((c.objective === 'sales' || c.objective === 'leads') && !pixelId) notes.push('No Meta pixel is set for this ad account, so the ad set optimizes for link clicks.');

    let campaignId = c.existing?.campaignId ?? null;
    if (!campaignId) {
      const res = await metaPost<{ id: string }>(`/${act}/campaigns`, token, {
        name: c.name,
        objective: spec.objective,
        status: 'PAUSED',
        special_ad_categories: '[]',
        is_adset_budget_sharing_enabled: 'False',
      });
      campaignId = res.id;
      await input.onCreated?.('campaign', null, campaignId);
    }

    let adsetId = c.existing?.adsetId ?? null;
    if (!adsetId) {
      const broad = c.ageMin <= 18 && c.ageMax >= 65;
      const targeting = {
        geo_locations: { countries: c.countries.map((x) => x.toUpperCase()) },
        age_min: c.ageMin,
        age_max: c.ageMax,
        targeting_automation: { advantage_audience: broad ? 1 : 0 },
      };
      const goal = spec.goal(!!pixelId);
      const res = await metaPost<{ id: string }>(`/${act}/adsets`, token, {
        name: `${c.name} · ad set`,
        campaign_id: campaignId,
        daily_budget: toMinorUnits(c.dailyBudget, account.currency),
        billing_event: 'IMPRESSIONS',
        optimization_goal: goal,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        ...(spec.destination ? { destination_type: spec.destination } : {}),
        ...(goal === 'OFFSITE_CONVERSIONS' && pixelId ? { promoted_object: JSON.stringify({ pixel_id: pixelId, custom_event_type: spec.event }) } : {}),
        targeting: JSON.stringify(targeting),
        status: 'PAUSED',
      });
      adsetId = res.id;
      await input.onCreated?.('adset', null, adsetId);
    }

    const results: LaunchResult['ads'] = [];
    for (const ad of input.ads) {
      const r = { key: ad.key, adId: ad.existing?.adId ?? null, creativeId: ad.existing?.creativeId ?? null, videoId: ad.existing?.videoId ?? null, error: null as string | null };
      try {
        if (r.adId) {
          results.push(r);
          continue;
        }
        const cta = { type: c.cta, value: { link: c.landingUrl } };
        if (!r.creativeId) {
          let storySpec: Record<string, unknown>;
          if (ad.media.kind === 'video') {
            if (!r.videoId) {
              const up = await metaPost<{ id: string }>(`/${act}/advideos`, token, { file_url: ad.media.url, name: ad.name }, 'video');
              r.videoId = up.id;
              await input.onCreated?.('video', ad.key, up.id);
            }
            await waitForVideo(token, r.videoId);
            const thumb = ad.media.coverUrl ?? (await videoThumbnail(token, r.videoId));
            storySpec = { video_data: { video_id: r.videoId, ...(thumb ? { image_url: thumb } : {}), title: ad.headline, message: ad.primaryText, call_to_action: cta } };
          } else {
            const hash = await uploadImage(token, act, ad.media.url);
            storySpec = { link_data: { image_hash: hash, link: c.landingUrl, message: ad.primaryText, name: ad.headline, call_to_action: cta } };
          }
          const creative = await metaPost<{ id: string }>(`/${act}/adcreatives`, token, {
            name: `${ad.name} · creative`,
            object_story_spec: JSON.stringify({ page_id: pageId, ...(igUserId ? { instagram_user_id: igUserId } : {}), ...storySpec }),
          });
          r.creativeId = creative.id;
          await input.onCreated?.('creative', ad.key, creative.id);
        }
        const created = await metaPost<{ id: string }>(`/${act}/ads`, token, { name: ad.name, adset_id: adsetId, creative: JSON.stringify({ creative_id: r.creativeId }), status: 'PAUSED' });
        r.adId = created.id;
        await input.onCreated?.('ad', ad.key, created.id);
      } catch (err) {
        r.error = (err as Error).message;
        if (err instanceof PlatformError && err.authExpired) throw err;
      }
      results.push(r);
    }
    return { campaignId, adsetId, ads: results, notes };
  },

  async setStatus(token, _account, ids, status) {
    const value = status === 'active' ? 'ACTIVE' : 'PAUSED';
    if (status === 'active') {
      // An active ad only delivers when its ad set and campaign are active too.
      await metaPost(`/${ids.campaignId}`, token, { status: 'ACTIVE' });
      if (ids.adsetId) await metaPost(`/${ids.adsetId}`, token, { status: 'ACTIVE' });
    }
    await metaPost(`/${ids.adId}`, token, { status: value });
  },

  async insights(token, account, adIds) {
    if (!adIds.length) return {};
    const act = account.externalId.startsWith('act_') ? account.externalId : `act_${account.externalId}`;
    const out: Record<string, AdInsights> = {};
    let next: string | null = `${graph(`/${act}/insights`)}?${new URLSearchParams({
      level: 'ad',
      date_preset: 'maximum',
      fields: 'ad_id,impressions,clicks,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,spend,ctr,cpc,cpm,actions,purchase_roas,video_play_actions,video_thruplay_watched_actions',
      filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: adIds }]),
      limit: '200',
      access_token: token,
    })}`;
    for (let page = 0; next && page < 20; page++) {
      const res: { data: { data: Record<string, unknown>[]; paging?: { next?: string } } } = await api<{ data: Record<string, unknown>[]; paging?: { next?: string } }>('meta', next, { retries: 2 }, metaAuthError);
      for (const row of res.data.data) out[String(row.ad_id)] = insightsFrom(row);
      next = res.data.paging?.next ?? null;
    }
    return out;
  },

  async review(token, account, adIds) {
    if (!adIds.length) return {};
    const act = account.externalId.startsWith('act_') ? account.externalId : `act_${account.externalId}`;
    const res = await metaGet<{ data: { id: string; effective_status: string; ad_review_feedback?: { global?: Record<string, string> } }[] }>(`/${act}/ads`, token, {
      fields: 'id,effective_status,ad_review_feedback',
      filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: adIds }]),
      limit: '200',
    });
    const out: Record<string, ReviewState> = {};
    for (const ad of res.data) {
      const s = ad.effective_status;
      const feedback = ad.ad_review_feedback?.global ? Object.entries(ad.ad_review_feedback.global).map(([k, v]) => `${k}: ${v}`).join('; ') : null;
      out[ad.id] = {
        status:
          s === 'ACTIVE'
            ? 'active'
            : s === 'DISAPPROVED' || s === 'WITH_ISSUES'
              ? 'rejected'
              : s === 'PENDING_REVIEW' || s === 'IN_PROCESS' || s === 'PREAPPROVED'
                ? 'pending_review'
                : s === 'ARCHIVED' || s === 'DELETED'
                  ? 'archived'
                  : s.includes('PAUSED')
                    ? 'paused'
                    : 'unknown',
        detail: feedback,
      };
    }
    return out;
  },
};
