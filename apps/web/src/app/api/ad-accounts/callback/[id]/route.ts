import { AD_PLATFORMS, AppError, type AdPlatform } from '@adforge/core';
import { ads } from '@adforge/core/server';
import { oauthRedirectUri } from '@/lib/server/distribution';
import { oauthCallback } from '@/lib/server/oauth';

export const GET = oauthCallback({
  kind: 'ads',
  fallback: '/settings/ad-accounts',
  async finish({ sb, id, code, state }) {
    if (!(AD_PLATFORMS as readonly string[]).includes(id)) throw new AppError('not_found', 'Unknown ad platform.', 404);
    const p = ads.ADS_PLATFORMS[id as AdPlatform];
    const token = await p.exchange(code, oauthRedirectUri('ads', id));
    const accounts = await p.accounts(token);
    if (!accounts.length) throw new AppError('no_ad_accounts', `${p.label}: this login has no ad accounts. Create one in the platform's ads manager, then connect again.`, 400);
    const saved = await ads.saveAdAccounts(sb, state.workspace_id, state.user_id, id as AdPlatform, token, accounts);
    return { connected: saved.length, label: p.label };
  },
});
