import 'server-only';
import {
  AppError,
  isRecord,
  licenseIssueMessage,
  type AdAccountRow,
  type AdCampaignRow,
  type AdRow,
  type AssetRow,
  type LicenseIssue,
  type PostRow,
  type PostTargetRow,
  type SocialAccountRow,
} from '@adforge/core';
import { appUrl, type ServiceClient } from '@adforge/core/server';
import type { Caller } from './api';
import { assetViewMap } from './assets';
import type { AdAccountView, AdMetricsView, AdView, AssetView, CampaignView, PostMetricsView, PostTargetView, PostView, SocialAccountView } from '@/lib/types';

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Where a provider sends the browser back after sign-in. Must be registered in the provider's app settings. */
export const oauthRedirectUri = (kind: 'social' | 'ads', id: string) => appUrl(`/api/${kind === 'social' ? 'social-accounts' : 'ad-accounts'}/callback/${id}`);

/** Only same-app paths are allowed as post-connect destinations. */
export function safeReturnPath(path: string | null | undefined, fallback: string): string {
  return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/api/') ? path : fallback;
}

/* --------------------------------- Licensing -------------------------------- */

/** Blocks media whose audio is not cleared for commercial use, by the same rules the worker applies. */
export async function assertPublishable(sb: ServiceClient, asset: AssetRow) {
  const meta = isRecord(asset.meta) ? asset.meta : {};
  const issues = Array.isArray(meta.licenseIssues) ? (meta.licenseIssues as unknown as LicenseIssue[]) : [];
  if (issues.length) throw new AppError('license_blocked', licenseIssueMessage(issues), 400, { issues });
  if (!asset.license_id) return;
  const { data: license } = await sb.from('licenses').select('commercial_use, expires_at').eq('id', asset.license_id).maybeSingle();
  if (license && !license.commercial_use) throw new AppError('license_blocked', `“${asset.name}” is licensed for non-commercial use only.`, 400);
  if (license?.expires_at && new Date(license.expires_at).getTime() < Date.now()) throw new AppError('license_blocked', `The license for “${asset.name}” has expired.`, 400);
}

/** A video or image of the workspace that can be published: not trashed, not failed. */
export async function publishableAsset(sb: ServiceClient, caller: Caller, id: string): Promise<AssetRow> {
  const { data: asset } = await sb.from('assets').select('*').eq('id', id).eq('workspace_id', caller.workspaceId).maybeSingle();
  if (!asset) throw new AppError('not_found', 'The media was not found.', 404);
  if (asset.deleted_at) throw new AppError('invalid_request', `“${asset.name}” is in the trash.`, 400);
  if (asset.type !== 'video' && asset.type !== 'image') throw new AppError('invalid_request', `“${asset.name}” is not a video or an image.`, 400);
  if (asset.status === 'failed') throw new AppError('invalid_request', `“${asset.name}” could not be processed. Upload it again.`, 400);
  await assertPublishable(sb, asset);
  return asset;
}

/* ---------------------------------- Social ---------------------------------- */

export function toSocialAccountView(r: SocialAccountRow): SocialAccountView {
  return {
    id: r.id,
    platform: r.platform as SocialAccountView['platform'],
    provider: r.provider as SocialAccountView['provider'],
    handle: r.handle,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    status: r.status as SocialAccountView['status'],
    statusDetail: r.status_detail,
    tokenExpiresAt: r.token_expires_at,
    createdAt: r.created_at,
  };
}

export function postMetrics(raw: unknown): PostMetricsView {
  const m = isRecord(raw) ? raw : {};
  return { views: n(m.views), impressions: n(m.impressions), likes: n(m.likes), comments: n(m.comments), shares: n(m.shares), saves: n(m.saves), clicks: n(m.clicks), ctr: n(m.ctr), watchTimeS: n(m.watchTimeS) };
}

/** Sums the given fields; the rest start as null for the caller to derive. */
function sumMetrics<T extends { [K in keyof T]: number | null }>(list: T[], keys: (keyof T)[], empty: T): T {
  const out = { ...empty };
  for (const m of list) {
    for (const k of keys) {
      const v = m[k];
      if (v != null) out[k] = ((out[k] ?? 0) + v) as T[keyof T];
    }
  }
  return out;
}

const POST_SUM_KEYS: (keyof PostMetricsView)[] = ['views', 'impressions', 'likes', 'comments', 'shares', 'saves', 'clicks', 'watchTimeS'];

/** Totals across post targets, with the click-through rate (a fraction) recomputed from the sums. */
export function totalPostMetrics(list: PostMetricsView[]): PostMetricsView {
  const t = sumMetrics(list, POST_SUM_KEYS, postMetrics({}));
  t.ctr = t.impressions && t.clicks != null ? t.clicks / t.impressions : null;
  return t;
}

export async function toPostViews(sb: ServiceClient, workspaceId: string, rows: PostRow[]): Promise<PostView[]> {
  if (!rows.length) return [];
  const { data: targetRows, error } = await sb.from('post_targets').select('*').in('post_id', rows.map((r) => r.id)).order('created_at');
  if (error) throw new Error(`Could not load post targets: ${error.message}`);
  const targets = targetRows ?? [];
  const accountIds = [...new Set(targets.map((t) => t.social_account_id))];
  const [assets, accounts] = await Promise.all([
    assetViewMap(sb, workspaceId, rows.map((r) => r.asset_id)),
    accountIds.length ? sb.from('social_accounts').select('id, handle, display_name, avatar_url, provider').in('id', accountIds).then((r) => r.data ?? []) : [],
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const byPost = new Map<string, PostTargetRow[]>();
  for (const t of targets) byPost.set(t.post_id, [...(byPost.get(t.post_id) ?? []), t]);
  return rows.map((r) => {
    const views: PostTargetView[] = (byPost.get(r.id) ?? []).map((t) => {
      const a = accountById.get(t.social_account_id);
      const { __publish: _, ...options } = isRecord(t.options) ? t.options : {};
      return {
        id: t.id,
        socialAccountId: t.social_account_id,
        platform: t.platform as PostTargetView['platform'],
        account: a ? { handle: a.handle, displayName: a.display_name, avatarUrl: a.avatar_url, provider: a.provider as 'native' | 'ayrshare' } : null,
        captionOverride: t.caption_override,
        options,
        status: t.status as PostTargetView['status'],
        externalUrl: t.external_url,
        error: t.error,
        attempts: t.attempts,
        publishedAt: t.published_at,
        metrics: postMetrics(t.metrics),
        metricsUpdatedAt: t.metrics_updated_at,
      };
    });
    const totals = totalPostMetrics(views.filter((t) => t.status === 'published').map((t) => t.metrics));
    return {
      id: r.id,
      title: r.title,
      caption: r.caption,
      hashtags: r.hashtags,
      status: r.status as PostView['status'],
      scheduledAt: r.scheduled_at,
      publishedAt: r.published_at,
      abGroup: r.ab_group,
      abVariant: r.ab_variant as PostView['abVariant'],
      aiLabel: r.ai_generated_label,
      asset: r.asset_id ? (assets[r.asset_id] ?? null) : null,
      platforms: [...new Set(views.map((t) => t.platform))],
      targets: views,
      totals,
      projectId: r.project_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

/* ------------------------------------ Ads ----------------------------------- */

export function toAdAccountView(r: AdAccountRow): AdAccountView {
  const meta = isRecord(r.meta) ? r.meta : {};
  const identities = Array.isArray(meta.identities)
    ? meta.identities.flatMap((i) =>
        isRecord(i) && typeof i.pageId === 'string'
          ? [{ pageId: i.pageId, pageName: str(i.pageName) ?? i.pageId, instagramUserId: str(i.instagramUserId), instagramUsername: str(i.instagramUsername) }]
          : [],
      )
    : [];
  return {
    id: r.id,
    platform: r.platform as AdAccountView['platform'],
    externalId: r.external_id,
    name: r.name,
    currency: r.currency,
    timezone: r.timezone,
    status: r.status as AdAccountView['status'],
    statusDetail: r.status_detail,
    identities,
    pageId: str(meta.pageId),
    instagramUserId: str(meta.instagramUserId),
    pixelId: str(meta.pixelId),
    identityId: str(meta.identityId),
    tokenExpiresAt: r.token_expires_at,
    createdAt: r.created_at,
  };
}

const AD_SUM_KEYS: (keyof AdMetricsView)[] = ['impressions', 'clicks', 'spend', 'conversions', 'videoViews', 'thruplays'];

export function adMetrics(raw: unknown): AdMetricsView {
  const m = isRecord(raw) ? raw : {};
  return { impressions: n(m.impressions), clicks: n(m.clicks), spend: n(m.spend), ctr: n(m.ctr), cpc: n(m.cpc), cpm: n(m.cpm), conversions: n(m.conversions), cpa: n(m.cpa), roas: n(m.roas), videoViews: n(m.videoViews), thruplays: n(m.thruplays) };
}

/** Totals across ads, with rates recomputed from the sums (averaging rates would be wrong). */
export function totalAdMetrics(list: AdMetricsView[]): AdMetricsView {
  const t = sumMetrics(list, AD_SUM_KEYS, adMetrics({}));
  const revenue = list.reduce((sum, m) => (m.roas != null && m.spend != null ? sum + m.roas * m.spend : sum), 0);
  t.ctr = t.impressions && t.clicks != null ? (t.clicks / t.impressions) * 100 : null;
  t.cpc = t.clicks && t.spend != null ? t.spend / t.clicks : null;
  t.cpm = t.impressions && t.spend != null ? (t.spend / t.impressions) * 1000 : null;
  t.cpa = t.conversions && t.spend != null ? t.spend / t.conversions : null;
  t.roas = t.spend && revenue ? revenue / t.spend : null;
  return t;
}

export function toAdView(r: AdRow, assets: Record<string, AssetView>): AdView {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    asset: r.asset_id ? (assets[r.asset_id] ?? null) : null,
    variantLabel: r.variant_label,
    headline: r.headline,
    primaryText: r.primary_text,
    cta: r.cta,
    landingUrl: r.landing_url,
    status: r.status as AdView['status'],
    reviewStatus: r.review_status,
    isWinner: r.is_winner,
    launched: !!r.external_ad_id,
    metrics: adMetrics(r.metrics),
    metricsUpdatedAt: r.metrics_updated_at,
    error: r.error,
    createdAt: r.created_at,
  };
}

export async function toCampaignViews(sb: ServiceClient, workspaceId: string, rows: AdCampaignRow[]): Promise<CampaignView[]> {
  if (!rows.length) return [];
  const accountIds = [...new Set(rows.map((r) => r.ad_account_id))];
  const [{ data: adRows, error }, { data: accounts }] = await Promise.all([
    sb.from('ads').select('*').eq('workspace_id', workspaceId).in('campaign_id', rows.map((r) => r.id)).order('created_at'),
    sb.from('ad_accounts').select('id, platform, name, currency, status').in('id', accountIds),
  ]);
  if (error) throw new Error(`Could not load ads: ${error.message}`);
  const assets = await assetViewMap(sb, workspaceId, (adRows ?? []).map((a) => a.asset_id));
  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const adsByCampaign = new Map<string, AdView[]>();
  for (const a of adRows ?? []) adsByCampaign.set(a.campaign_id, [...(adsByCampaign.get(a.campaign_id) ?? []), toAdView(a, assets)]);
  return rows.map((r) => {
    const t = isRecord(r.targeting) ? r.targeting : {};
    const account = accountById.get(r.ad_account_id);
    const list = adsByCampaign.get(r.id) ?? [];
    return {
      id: r.id,
      adAccountId: r.ad_account_id,
      account: account ? { platform: account.platform as 'meta' | 'tiktok', name: account.name, currency: account.currency, status: account.status as AdAccountView['status'] } : null,
      name: r.name,
      objective: r.objective,
      dailyBudget: Number(r.daily_budget),
      currency: r.currency,
      countries: Array.isArray(t.countries) ? t.countries.filter((c): c is string => typeof c === 'string') : [],
      ageMin: n(t.ageMin) ?? 18,
      ageMax: n(t.ageMax) ?? 65,
      landingUrl: str(t.landingUrl),
      cta: str(t.cta) ?? 'SHOP_NOW',
      notes: Array.isArray(t.launchNotes) ? t.launchNotes.filter((x): x is string => typeof x === 'string') : [],
      status: r.status as CampaignView['status'],
      error: r.error,
      variantBatchId: r.variant_batch_id,
      launchedAt: r.launched_at,
      ads: list,
      totals: totalAdMetrics(list.map((a) => a.metrics)),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}
