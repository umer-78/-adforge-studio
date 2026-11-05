import * as z from 'zod';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { toAdView } from '@/lib/server/distribution';
import { assetViewMap } from '@/lib/server/assets';

const patch = z.object({
  isWinner: z.boolean().optional(),
  headline: z.string().max(255).optional(),
  primaryText: z.string().max(2200).optional(),
});

/** Marks winners; copy can change only before the ad is created on the platform. */
export const PATCH = route({ body: patch, scope: 'ads' }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'ads', params.id!, caller, 'The ad');
  if ((body.headline !== undefined || body.primaryText !== undefined) && row.external_ad_id) throw badRequest('This ad is already on the platform; its copy is fixed there.');
  const updated = check(
    await sb
      .from('ads')
      .update({
        ...(body.isWinner !== undefined ? { is_winner: body.isWinner } : {}),
        ...(body.headline !== undefined ? { headline: body.headline } : {}),
        ...(body.primaryText !== undefined ? { primary_text: body.primaryText } : {}),
      })
      .eq('id', row.id)
      .select('*')
      .single(),
    'Could not save the ad',
  );
  return toAdView(updated, await assetViewMap(sb, caller.workspaceId, [updated.asset_id]));
});
