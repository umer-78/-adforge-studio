import { AppError } from '@adforge/core';
import { social } from '@adforge/core/server';
import { oauthRedirectUri } from '@/lib/server/distribution';
import { oauthCallback } from '@/lib/server/oauth';

export const GET = oauthCallback({
  kind: 'social',
  fallback: '/settings/accounts',
  async finish({ sb, id, code, state }) {
    if (!social.isConnectorId(id)) throw new AppError('not_found', 'Unknown connection.', 404);
    const c = social.CONNECTORS[id];
    const token = await c.exchange(code, oauthRedirectUri('social', id), state.code_verifier);
    const accounts = await c.accounts(token);
    const saved = await social.saveSocialAccounts(sb, state.workspace_id, state.user_id, accounts);
    return { connected: saved.length, label: c.label };
  },
});
