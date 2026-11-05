import * as z from 'zod';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { toCampaignViews } from '@/lib/server/distribution';

export const GET = route({ scope: 'ads' }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'ad_campaigns', params.id!, caller, 'The campaign');
  return (await toCampaignViews(sb, caller.workspaceId, [row]))[0];
});

/** Renames the campaign here; the name on the platform is set when it launches. */
export const PATCH = route({ body: z.object({ name: z.string().trim().min(1).max(200) }), scope: 'ads' }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'ad_campaigns', params.id!, caller, 'The campaign');
  const updated = check(await sb.from('ad_campaigns').update({ name: body.name }).eq('id', row.id).select('*').single(), 'Could not rename the campaign');
  return (await toCampaignViews(sb, caller.workspaceId, [updated]))[0];
});

/** Deletes a campaign that never reached the platform. Launched ones stay for their results. */
export const DELETE = route({ scope: 'ads' }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'ad_campaigns', params.id!, caller, 'The campaign');
  if (row.external_campaign_id || row.status === 'launching') throw badRequest('This campaign exists on the ad platform. Pause its ads instead; it stays here for its results.');
  check(await sb.from('ad_campaigns').delete().eq('id', row.id), 'Could not delete the campaign');
});
