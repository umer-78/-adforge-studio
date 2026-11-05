import { enqueueJob } from '@adforge/core/server';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { publishableAsset, toCampaignViews } from '@/lib/server/distribution';

/** Creates a draft campaign on the platform, or resumes one that failed part way. Always paused. */
export const POST = route({ scope: 'ads', limit: ['campaigns', 30, 3600] }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'ad_campaigns', params.id!, caller, 'The campaign');
  if (!['draft', 'failed'].includes(row.status)) throw badRequest(row.status === 'launching' ? 'The campaign is already launching.' : 'The campaign is already on the platform.');
  const { data: adRows } = await sb.from('ads').select('asset_id, external_ad_id, status').eq('campaign_id', row.id);
  const pending = (adRows ?? []).filter((a) => !a.external_ad_id && a.status !== 'archived');
  if (!pending.length) throw badRequest('Add at least one ad to the campaign.');
  for (const a of pending) if (a.asset_id) await publishableAsset(sb, caller, a.asset_id);
  check(await sb.from('ads').update({ status: 'draft', error: null }).eq('campaign_id', row.id).eq('status', 'failed').is('external_ad_id', null), 'Could not reset the ads');
  const updated = check(await sb.from('ad_campaigns').update({ status: 'launching', error: null }).eq('id', row.id).select('*').single(), 'Could not start the launch');
  await enqueueJob(sb, { type: 'ads.launch', payload: { campaignId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 6, idempotencyKey: `ads.launch:${row.id}:${Date.now()}` });
  return (await toCampaignViews(sb, caller.workspaceId, [updated]))[0];
});
