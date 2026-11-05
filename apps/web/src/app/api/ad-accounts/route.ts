import { ads, features } from '@adforge/core/server';
import { check, route } from '@/lib/server/api';
import { toAdAccountView } from '@/lib/server/distribution';
import type { AdsSetupView } from '@/lib/types';

/** Connected ad accounts and which ad platforms this server can connect. */
export const GET = route({}, async ({ sb, caller }): Promise<AdsSetupView> => {
  const rows = check(await sb.from('ad_accounts').select('*').eq('workspace_id', caller.workspaceId).neq('status', 'revoked').order('platform').order('name'), 'Could not load ad accounts');
  return { platforms: ads.adsStatus(), accounts: rows.map(toAdAccountView), adLibrary: features().adLibrary };
});
