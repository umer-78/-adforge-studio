import { social } from '@adforge/core/server';
import { check, route } from '@/lib/server/api';
import { toSocialAccountView } from '@/lib/server/distribution';
import { providerStatus } from '@/lib/server/workspace';
import type { ConnectorView, SocialAccountsView } from '@/lib/types';

/** Connected publishing accounts and which sign-ins this server can offer. */
export const GET = route({}, async ({ sb, caller }): Promise<SocialAccountsView> => {
  const [rows, providers] = await Promise.all([
    sb.from('social_accounts').select('*').eq('workspace_id', caller.workspaceId).neq('status', 'revoked').order('platform').order('created_at').then((r) => check(r, 'Could not load accounts')),
    providerStatus(sb, caller.workspaceId),
  ]);
  return { accounts: rows.map(toSocialAccountView), connectors: social.connectorStatus() as ConnectorView[], ayrshare: providers.ayrshare };
});
