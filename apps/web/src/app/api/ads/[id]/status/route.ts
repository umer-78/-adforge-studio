import { enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, logActivity, owned, route } from '@/lib/server/api';
import { toJobView } from '@/lib/server/workspace';

const body = z.object({
  status: z.enum(['active', 'paused']),
  /** Activating starts spending; the request must say so explicitly. */
  confirm: z.boolean().optional(),
});

/** Activates or pauses one ad on the platform. */
export const POST = route({ body, role: 'admin', scope: 'ads', limit: ['ads-status', 120, 3600] }, async ({ sb, caller, params, body: b }) => {
  const ad = await owned(sb, 'ads', params.id!, caller, 'The ad');
  if (b.status === 'active' && b.confirm !== true) throw badRequest('Confirm that the ad should start spending.');
  if (!ad.external_ad_id) throw badRequest('Launch the campaign before changing this ad.');
  if (ad.status === 'rejected' && b.status === 'active') throw badRequest('The platform rejected this ad. Fix it and launch a new one.');
  const job = await enqueueJob(sb, { type: 'ads.status', payload: { adId: ad.id, status: b.status }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 8, idempotencyKey: `ads.status:${ad.id}:${b.status}:${Math.floor(Date.now() / 10_000)}` });
  await logActivity(sb, caller, b.status === 'active' ? 'ad.activate' : 'ad.pause', 'ad', ad.id, { campaignId: ad.campaign_id });
  return toJobView(job);
});
