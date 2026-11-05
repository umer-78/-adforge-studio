import { enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, logActivity, owned, route } from '@/lib/server/api';

const body = z.object({
  status: z.enum(['active', 'paused']),
  /** Activating starts spending the daily budget; the request must say so explicitly. */
  confirm: z.boolean().optional(),
});

/** Activates or pauses every launched ad of the campaign. */
export const POST = route({ body, role: 'admin', scope: 'ads', limit: ['ads-status', 120, 3600] }, async ({ sb, caller, params, body: b }) => {
  const row = await owned(sb, 'ad_campaigns', params.id!, caller, 'The campaign');
  if (b.status === 'active' && b.confirm !== true) throw badRequest('Confirm that the ads should start spending.');
  if (!row.external_campaign_id) throw badRequest('Launch the campaign first.');
  const { data: adRows } = await sb.from('ads').select('id, status, external_ad_id').eq('campaign_id', row.id).not('external_ad_id', 'is', null);
  const targets = (adRows ?? []).filter((a) => a.status !== b.status && !['rejected', 'archived', 'failed'].includes(a.status));
  if (!targets.length) throw badRequest(b.status === 'active' ? 'No ad can be activated.' : 'No ad is running.');
  const bucket = Math.floor(Date.now() / 10_000);
  for (const a of targets) await enqueueJob(sb, { type: 'ads.status', payload: { adId: a.id, status: b.status }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 8, idempotencyKey: `ads.status:${a.id}:${b.status}:${bucket}` });
  await logActivity(sb, caller, b.status === 'active' ? 'campaign.activate' : 'campaign.pause', 'ad_campaign', row.id, { ads: targets.length, dailyBudget: Number(row.daily_budget), currency: row.currency });
  return { queued: targets.length };
});
