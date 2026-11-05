import { ADS_LAUNCH_STATUS, asJson, isRecord, SIGNED_URL_TTL, type AdAccountRow, type AdCampaignRow, type AdPlatform, type AdRow, type Update } from '@adforge/core';
import { ads as adsApi, PlatformError, storage } from '@adforge/core/server';
import { activity } from '../lib/activity';
import { PermanentError, userMessage } from '../lib/errors';
import { assertLicensed } from '../lib/licensing';
import { nowIso } from '../lib/util';
import { reschedule, type JobContext, type JobHandler } from '../runner';

const MAX_MEDIA_WAIT_MS = 3 * 3600_000;

interface Targeting {
  countries: string[];
  ageMin: number;
  ageMax: number;
  landingUrl: string | null;
  cta: string;
}

function readTargeting(campaign: AdCampaignRow, first: AdRow | undefined): Targeting {
  const t = isRecord(campaign.targeting) ? campaign.targeting : {};
  const countries = Array.isArray(t.countries) ? t.countries.filter((c): c is string => typeof c === 'string' && c.length === 2) : [];
  return {
    countries: countries.length ? countries : ['US'],
    ageMin: typeof t.ageMin === 'number' ? t.ageMin : 18,
    ageMax: typeof t.ageMax === 'number' ? t.ageMax : 65,
    landingUrl: typeof t.landingUrl === 'string' ? t.landingUrl : (first?.landing_url ?? null),
    cta: typeof t.cta === 'string' ? t.cta : (first?.cta ?? 'SHOP_NOW'),
  };
}

async function loadCampaign(ctx: JobContext, id: string, workspaceId: string | null) {
  let q = ctx.sb.from('ad_campaigns').select('*').eq('id', id);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data: campaign } = await q.maybeSingle();
  if (!campaign) throw new PermanentError('This campaign no longer exists.');
  const { data: account } = await ctx.sb.from('ad_accounts').select('*').eq('id', campaign.ad_account_id).maybeSingle();
  if (!account) throw new PermanentError('The ad account for this campaign was disconnected.');
  return { campaign, account };
}

function platformFor(account: AdAccountRow) {
  const platform = adsApi.ADS_PLATFORMS[account.platform as AdPlatform];
  if (!platform) throw new PermanentError(`Unsupported ad platform ${account.platform}.`);
  if (!platform.configured()) throw new PermanentError(`${platform.label} is not configured on this server.`, 'ads_not_configured');
  return platform;
}

async function accountToken(ctx: JobContext, account: AdAccountRow) {
  if (account.status !== 'active') throw new PermanentError(`Reconnect the ${account.name ?? 'ad'} account in Settings → Ad accounts.`, 'account_inactive');
  return adsApi.adAccessToken(ctx.sb, account);
}

async function markExpired(ctx: JobContext, account: AdAccountRow, err: unknown) {
  if (err instanceof PlatformError && err.authExpired) await ctx.sb.from('ad_accounts').update({ status: 'expired', status_detail: err.message }).eq('id', account.id);
}

/* ---------------------------------- Launch ---------------------------------- */

export const adsLaunch: JobHandler<'ads.launch'> = {
  async run(ctx, { campaignId }) {
    const { campaign, account } = await loadCampaign(ctx, campaignId, ctx.workspaceId);
    if (!['draft', 'launching', 'failed'].includes(campaign.status)) return { skipped: campaign.status };
    const platform = platformFor(account);
    const { data: rows } = await ctx.sb.from('ads').select('*').eq('campaign_id', campaign.id).order('created_at');
    const pending = (rows ?? []).filter((a) => !a.external_ad_id && a.status !== 'archived');
    if (!pending.length) throw new PermanentError('Add at least one ad to the campaign.');
    const targeting = readTargeting(campaign, pending[0]);
    if (!targeting.landingUrl) throw new PermanentError('Add a landing page URL for the ads.');

    // Every creative must be ready and cleared for commercial use before anything is created.
    const media: adsApi.LaunchAd[] = [];
    for (const ad of pending) {
      if (!ad.asset_id) throw new PermanentError(`Ad “${ad.variant_label ?? ad.headline ?? ad.id}” has no media.`);
      const { data: asset } = await ctx.sb.from('assets').select('*').eq('id', ad.asset_id).eq('workspace_id', campaign.workspace_id).maybeSingle();
      if (!asset || asset.deleted_at) throw new PermanentError('A video for this campaign was deleted.');
      if (asset.status === 'failed') throw new PermanentError(`“${asset.name}” could not be processed.`);
      if (asset.status !== 'ready') {
        if (Date.now() - new Date(ctx.job.created_at).getTime() > MAX_MEDIA_WAIT_MS) throw new PermanentError('The ad media was still processing after 3 hours.');
        await ctx.sb.from('ad_campaigns').update({ status: 'launching', error: null }).eq('id', campaign.id);
        return reschedule(30, 'Waiting for the ad media to finish processing');
      }
      if (asset.type !== 'video' && asset.type !== 'image') throw new PermanentError(`“${asset.name}” is not a video or image.`);
      await assertLicensed(ctx.sb, asset);
      const driver = storage(asset.storage_driver);
      media.push({
        key: ad.id,
        name: `${campaign.name} · ${ad.variant_label ?? asset.name}`.slice(0, 200),
        headline: ad.headline ?? '',
        primaryText: ad.primary_text ?? '',
        media: {
          kind: asset.type,
          url: await driver.signedReadUrl(asset.storage_key, SIGNED_URL_TTL.publish),
          coverUrl: asset.thumbnail_key ? await driver.signedReadUrl(asset.thumbnail_key, SIGNED_URL_TTL.publish) : null,
          width: asset.width,
          height: asset.height,
          durationS: asset.duration_s,
        },
        existing: { videoId: ad.external_video_id, creativeId: ad.external_creative_id, adId: ad.external_ad_id },
      });
    }

    const token = await accountToken(ctx, account);
    await ctx.sb.from('ad_campaigns').update({ status: 'launching', error: null }).eq('id', campaign.id);
    await ctx.sb.from('ads').update({ status: 'uploading', error: null }).in('id', pending.map((a) => a.id));
    ctx.progress(10, `Creating the campaign on ${platform.label}`);

    let done = 0;
    // TikTok creates a custom identity on first launch and writes it into the account meta.
    const ref = adsApi.adAccountRef(account);
    const identityBefore = ref.meta.identityId ?? null;
    try {
      const result = await platform.launch({
        accessToken: token,
        account: ref,
        campaign: {
          name: campaign.name,
          objective: campaign.objective as adsApi.AdObjective,
          dailyBudget: Number(campaign.daily_budget),
          countries: targeting.countries,
          ageMin: targeting.ageMin,
          ageMax: targeting.ageMax,
          landingUrl: targeting.landingUrl,
          cta: targeting.cta,
          existing: { campaignId: campaign.external_campaign_id, adsetId: campaign.external_adset_id },
        },
        ads: media,
        // Saved as soon as each object exists, so a retry resumes instead of duplicating spend objects.
        onCreated: async (kind, key, externalId) => {
          if (kind === 'campaign') await ctx.sb.from('ad_campaigns').update({ external_campaign_id: externalId }).eq('id', campaign.id);
          else if (kind === 'adset') await ctx.sb.from('ad_campaigns').update({ external_adset_id: externalId }).eq('id', campaign.id);
          else if (key) {
            const patch: Update<'ads'> = kind === 'video' ? { external_video_id: externalId } : kind === 'creative' ? { external_creative_id: externalId } : { external_ad_id: externalId };
            await ctx.sb.from('ads').update(patch).eq('id', key);
            if (kind === 'ad') ctx.progress(20 + (++done / media.length) * 75, 'Creating ads');
          }
        },
      });

      for (const r of result.ads) {
        await ctx.sb
          .from('ads')
          .update(r.adId ? { status: ADS_LAUNCH_STATUS, external_ad_id: r.adId, review_status: 'pending_review', error: null } : { status: 'failed', error: r.error ?? 'The platform did not create this ad.' })
          .eq('id', r.key);
      }
      const created = result.ads.filter((r) => r.adId).length;
      const targetingJson = isRecord(campaign.targeting) ? campaign.targeting : {};
      await ctx.sb
        .from('ad_campaigns')
        .update({
          external_campaign_id: result.campaignId,
          external_adset_id: result.adsetId,
          status: created ? ADS_LAUNCH_STATUS : 'failed',
          error: created ? null : (result.ads.find((r) => r.error)?.error ?? 'No ad could be created.'),
          launched_at: created ? nowIso() : null,
          targeting: asJson({ ...targetingJson, launchNotes: result.notes }),
        })
        .eq('id', campaign.id);
      if (created) {
        await activity(ctx.sb, { workspaceId: campaign.workspace_id, actorId: campaign.created_by, verb: 'ads.launched', objectType: 'ad_campaign', objectId: campaign.id, data: { platform: account.platform, ads: created, status: ADS_LAUNCH_STATUS } });
        await ctx.enqueue('ads.sync', { campaignId: campaign.id }, { runAt: new Date(Date.now() + 2 * 3600_000), idempotencyKey: `ads.sync:${campaign.id}:first` });
      }
      return { created, failed: result.ads.length - created, notes: result.notes };
    } catch (err) {
      await markExpired(ctx, account, err);
      throw err;
    } finally {
      if (ref.meta.identityId && ref.meta.identityId !== identityBefore) await ctx.sb.from('ad_accounts').update({ meta: asJson(ref.meta) }).eq('id', account.id);
    }
  },
  async onFailure(ctx, { campaignId }, message) {
    await ctx.sb.from('ad_campaigns').update({ status: 'failed', error: message }).eq('id', campaignId).in('status', ['draft', 'launching']);
    await ctx.sb.from('ads').update({ status: 'failed', error: message }).eq('campaign_id', campaignId).in('status', ['draft', 'uploading']);
  },
};

/* ---------------------------------- Status ---------------------------------- */

async function campaignStatusFromAds(ctx: JobContext, campaignId: string) {
  const { data } = await ctx.sb.from('ads').select('status').eq('campaign_id', campaignId);
  const list = data ?? [];
  if (!list.length) return;
  const status = list.some((a) => a.status === 'active') ? 'active' : list.every((a) => a.status === 'archived' || a.status === 'failed' || a.status === 'rejected') ? 'completed' : 'paused';
  await ctx.sb.from('ad_campaigns').update({ status }).eq('id', campaignId).in('status', ['paused', 'active', 'completed']);
}

export const adsStatus: JobHandler<'ads.status'> = {
  async run(ctx, { adId, status }) {
    const { data: ad } = await ctx.sb.from('ads').select('*').eq('id', adId).eq('workspace_id', ctx.workspaceId).maybeSingle();
    if (!ad) throw new PermanentError('This ad no longer exists.');
    if (!ad.external_ad_id) throw new PermanentError('Launch the campaign before changing this ad.');
    if (ad.status === 'rejected' && status === 'active') throw new PermanentError('The platform rejected this ad. Fix it and launch a new one.');
    const { campaign, account } = await loadCampaign(ctx, ad.campaign_id, ctx.workspaceId);
    if (!campaign.external_campaign_id) throw new PermanentError('The campaign was not created on the platform.');
    const platform = platformFor(account);
    const token = await accountToken(ctx, account);
    try {
      await platform.setStatus(token, adsApi.adAccountRef(account), { campaignId: campaign.external_campaign_id, adsetId: campaign.external_adset_id, adId: ad.external_ad_id }, status);
    } catch (err) {
      await markExpired(ctx, account, err);
      throw err;
    }
    await ctx.sb.from('ads').update({ status, error: null }).eq('id', ad.id);
    await campaignStatusFromAds(ctx, campaign.id);
    await activity(ctx.sb, { workspaceId: ad.workspace_id, actorId: ctx.job.created_by, verb: status === 'active' ? 'ad.activated' : 'ad.paused', objectType: 'ad', objectId: ad.id, data: { campaignId: campaign.id, platform: account.platform } });
    return { status };
  },
};

/* ----------------------------------- Sync ----------------------------------- */

const REVIEW_TO_STATUS: Record<adsApi.ReviewState['status'], string | null> = {
  active: 'active',
  paused: 'paused',
  pending_review: null,
  rejected: 'rejected',
  archived: 'archived',
  unknown: null,
};

export async function syncCampaign(ctx: JobContext, campaign: AdCampaignRow, account: AdAccountRow) {
  const platform = platformFor(account);
  const { data: rows } = await ctx.sb.from('ads').select('*').eq('campaign_id', campaign.id).not('external_ad_id', 'is', null);
  const list = rows ?? [];
  if (!list.length) return { ads: 0 };
  const token = await accountToken(ctx, account);
  const ref = adsApi.adAccountRef(account);
  const ids = list.map((a) => a.external_ad_id!);
  try {
    const [insights, review] = await Promise.all([platform.insights(token, ref, ids), platform.review(token, ref, ids)]);
    const now = nowIso();
    const metricRows = list.flatMap((ad) => {
      const m = insights[ad.external_ad_id!];
      if (!m) return [];
      return [
        {
          ad_id: ad.id,
          workspace_id: ad.workspace_id,
          impressions: m.impressions,
          clicks: m.clicks,
          spend: m.spend,
          ctr: m.ctr,
          cpc: m.cpc,
          cpm: m.cpm,
          conversions: m.conversions,
          cpa: m.cpa,
          roas: m.roas,
          video_views: m.videoViews,
          thruplays: m.thruplays,
          raw: asJson(m.raw),
        },
      ];
    });
    if (metricRows.length) {
      const { error } = await ctx.sb.from('ad_metrics').insert(metricRows);
      if (error) throw new Error(`Could not save ad results: ${error.message}`);
    }
    for (const ad of list) {
      const m = insights[ad.external_ad_id!];
      const r = review[ad.external_ad_id!];
      const status = r ? REVIEW_TO_STATUS[r.status] : null;
      const patch: Update<'ads'> = {};
      if (m) {
        const { raw: _, ...summary } = m;
        patch.metrics = asJson(summary);
        patch.metrics_updated_at = now;
      }
      if (r) {
        patch.review_status = r.detail ? `${r.status}: ${r.detail}`.slice(0, 500) : r.status;
        if (status && status !== ad.status) patch.status = status;
        if (r.status === 'rejected') patch.error = r.detail ?? 'Rejected by the platform review.';
      }
      if (Object.keys(patch).length) await ctx.sb.from('ads').update(patch).eq('id', ad.id);
    }
    await campaignStatusFromAds(ctx, campaign.id);
    return { ads: list.length, withResults: metricRows.length };
  } catch (err) {
    await markExpired(ctx, account, err);
    throw err;
  }
}

export const adsSync: JobHandler<'ads.sync'> = {
  async run(ctx, { campaignId }) {
    if (campaignId) {
      const { campaign, account } = await loadCampaign(ctx, campaignId, ctx.job.workspace_id);
      if (!campaign.external_campaign_id) return { skipped: 'not_launched' };
      return syncCampaign(ctx, campaign, account);
    }
    // Scheduled sweep: campaigns launched in the last 60 days.
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    let q = ctx.sb.from('ad_campaigns').select('*').in('status', ['paused', 'active']).gte('launched_at', since).order('updated_at', { ascending: true }).limit(50);
    if (ctx.job.workspace_id) q = q.eq('workspace_id', ctx.job.workspace_id);
    const { data: campaigns, error } = await q;
    if (error) throw new Error(`Could not load campaigns: ${error.message}`);
    let synced = 0;
    let failed = 0;
    for (const [i, campaign] of (campaigns ?? []).entries()) {
      ctx.checkAborted();
      ctx.progress((i / (campaigns?.length || 1)) * 100, 'Syncing ad results');
      try {
        const { data: account } = await ctx.sb.from('ad_accounts').select('*').eq('id', campaign.ad_account_id).maybeSingle();
        if (!account || account.status !== 'active') continue;
        await syncCampaign(ctx, campaign, account);
        synced++;
      } catch (err) {
        if ((err as { name?: string }).name === 'JobAborted') throw err;
        failed++;
        ctx.log.warn({ campaignId: campaign.id, err: userMessage(err) }, 'ad sync failed');
      }
    }
    return { synced, failed };
  },
};
