import { check, logActivity, owned, route } from '@/lib/server/api';

/**
 * Disconnects the account. Its stored tokens are deleted; an account with post history is kept as
 * disconnected so past results stay readable, and connecting it again restores it.
 */
export const DELETE = route({ role: 'admin' }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'social_accounts', params.id!, caller, 'The account');
  const { count } = await sb.from('post_targets').select('id', { count: 'exact', head: true }).eq('social_account_id', row.id);
  if (count) {
    check(await sb.from('post_targets').update({ status: 'canceled', error: 'The account was disconnected.' }).eq('social_account_id', row.id).eq('status', 'pending'), 'Could not cancel pending posts');
    check(await sb.from('social_account_tokens').delete().eq('social_account_id', row.id), 'Could not remove the tokens');
    check(await sb.from('social_accounts').update({ status: 'revoked', status_detail: 'Disconnected.', token_expires_at: null }).eq('id', row.id), 'Could not disconnect the account');
  } else check(await sb.from('social_accounts').delete().eq('id', row.id), 'Could not disconnect the account');
  await logActivity(sb, caller, 'social.disconnected', 'social_account', row.id, { platform: row.platform, handle: row.handle });
});
