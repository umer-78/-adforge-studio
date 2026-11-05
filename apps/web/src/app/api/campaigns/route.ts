import { asJson, campaignCreateSchema, type AdPlatform } from '@adforge/core';
import { ads as adsApi, enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { publishableAsset, toAdAccountView, toCampaignViews } from '@/lib/server/distribution';

const query = z.object({
  status: z.enum(['draft', 'launching', 'paused', 'active', 'completed', 'failed']).optional(),
  adAccountId: z.string().uuid().optional(),
  variantBatchId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().datetime({ offset: true }).optional(),
});

export const GET = route({ query, scope: 'ads' }, async ({ sb, caller, query: q }) => {
  let req = sb.from('ad_campaigns').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(q.limit + 1);
  if (q.status) req = req.eq('status', q.status);
  if (q.adAccountId) req = req.eq('ad_account_id', q.adAccountId);
  if (q.variantBatchId) req = req.eq('variant_batch_id', q.variantBatchId);
  if (q.cursor) req = req.lt('created_at', q.cursor);
  const rows = check(await req, 'Could not load campaigns');
  const page = rows.slice(0, q.limit);
  return { items: await toCampaignViews(sb, caller.workspaceId, page), nextCursor: rows.length > q.limit ? page[page.length - 1]!.created_at : null };
});

/**
 * Creates a campaign, one ad set and an ad per creative. Everything is created PAUSED on the
 * platform: nothing spends until an ad is activated explicitly.
 */
export const POST = route({ body: campaignCreateSchema.extend({ launch: z.boolean().default(true) }), scope: 'ads', limit: ['campaigns', 30, 3600] }, async ({ sb, caller, body }) => {
  const account = await owned(sb, 'ad_accounts', body.adAccountId, caller, 'The ad account');
  if (account.status !== 'active') throw badRequest(`Reconnect ${account.name ?? 'this ad account'} in Settings → Ad accounts first.`);
  const platform = adsApi.ADS_PLATFORMS[account.platform as AdPlatform];
  if (!platform?.configured()) throw badRequest(`${platform?.label ?? 'This ad platform'} is not set up on this server.`);
  if (account.platform === 'meta' && !toAdAccountView(account).pageId) throw badRequest('Pick the Facebook Page your ads run as in Settings → Ad accounts.');
  const countries = [...new Set(body.countries.map((c) => c.toUpperCase()))];
  if (account.platform === 'tiktok') {
    const unsupported = countries.filter((c) => !adsApi.TIKTOK_COUNTRY_IDS[c]);
    if (unsupported.length) throw badRequest(`TikTok Ads cannot target ${unsupported.join(', ')} from here yet.`);
  }
  if (body.ageMin > body.ageMax) throw badRequest('The minimum age is above the maximum age.');
  if (body.variantBatchId) await owned(sb, 'variant_batches', body.variantBatchId, caller, 'The variants');
  for (const ad of body.ads) {
    const asset = await publishableAsset(sb, caller, ad.assetId);
    if (account.platform === 'tiktok' && asset.type !== 'video') throw badRequest('TikTok ads need a video.');
  }

  const campaign = check(
    await sb
      .from('ad_campaigns')
      .insert({
        workspace_id: caller.workspaceId,
        ad_account_id: account.id,
        name: body.name,
        objective: body.objective,
        daily_budget: body.dailyBudget,
        currency: account.currency,
        targeting: asJson({ countries, ageMin: body.ageMin, ageMax: body.ageMax, landingUrl: body.landingUrl, cta: body.cta }),
        status: body.launch ? 'launching' : 'draft',
        variant_batch_id: body.variantBatchId ?? null,
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not create the campaign',
  );
  const inserted = await sb.from('ads').insert(
    body.ads.map((a) => ({
      workspace_id: caller.workspaceId,
      campaign_id: campaign.id,
      asset_id: a.assetId,
      variant_label: a.variantLabel ?? null,
      headline: a.headline,
      primary_text: a.primaryText,
      cta: body.cta,
      landing_url: body.landingUrl,
      status: 'draft',
    })),
  );
  if (inserted.error) {
    await sb.from('ad_campaigns').delete().eq('id', campaign.id);
    check(inserted, 'Could not create the ads');
  }
  if (body.launch) await enqueueJob(sb, { type: 'ads.launch', payload: { campaignId: campaign.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 6, idempotencyKey: `ads.launch:${campaign.id}` });
  await logActivity(sb, caller, 'campaign.create', 'ad_campaign', campaign.id, { platform: account.platform, ads: body.ads.length, launched: body.launch });
  return (await toCampaignViews(sb, caller.workspaceId, [campaign]))[0];
});
