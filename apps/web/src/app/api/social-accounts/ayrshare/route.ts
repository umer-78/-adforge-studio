import { asJson } from '@adforge/core';
import { requireProviderKey, social } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, route } from '@/lib/server/api';
import { toSocialAccountView } from '@/lib/server/distribution';

/**
 * Imports the accounts linked in Ayrshare (publishing through one Ayrshare key instead of each
 * platform's own app). A Business plan profile key picks one of several Ayrshare profiles.
 */
export const POST = route({ body: z.object({ profileKey: z.string().trim().max(200).optional() }), role: 'admin', limit: ['oauth', 30, 600] }, async ({ sb, caller, body }) => {
  const key = await requireProviderKey(caller.workspaceId, 'ayrshare');
  const linked = await social.ayrshareAccounts(key, body.profileKey || null);
  if (!linked.length) throw badRequest('No accounts are linked in Ayrshare yet. Link them in the Ayrshare dashboard, then import again.');
  const suffix = body.profileKey ? `:${body.profileKey.slice(-8)}` : '';
  const rows = check(
    await sb
      .from('social_accounts')
      .upsert(
        linked.map((a) => ({
          workspace_id: caller.workspaceId,
          platform: a.platform,
          provider: 'ayrshare',
          external_id: `ayrshare:${a.platform}${suffix}`,
          handle: a.username,
          display_name: a.displayName,
          avatar_url: a.avatarUrl,
          meta: asJson({ profileUrl: a.profileUrl, ...(body.profileKey ? { profileKey: body.profileKey } : {}) }),
          status: 'active',
          status_detail: null,
          connected_by: caller.userId,
        })),
        { onConflict: 'workspace_id,platform,external_id' },
      )
      .select('*'),
    'Could not save the accounts',
  );
  await logActivity(sb, caller, 'social.connected', 'social_account', null, { provider: 'ayrshare', accounts: rows.length });
  return { items: rows.map(toSocialAccountView) };
});
