import { enqueueJob } from '@adforge/core/server';
import { badRequest, owned, route } from '@/lib/server/api';
import { toJobView } from '@/lib/server/workspace';

/** Pulls the latest results and review status now instead of waiting for the hourly sync. */
export const POST = route({ scope: 'ads', limit: ['ads-sync', 60, 3600] }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'ad_campaigns', params.id!, caller, 'The campaign');
  if (!row.external_campaign_id) throw badRequest('Launch the campaign first.');
  const job = await enqueueJob(sb, { type: 'ads.sync', payload: { campaignId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 4, idempotencyKey: `ads.sync:${row.id}:${Math.floor(Date.now() / 60_000)}` });
  return toJobView(job);
});
