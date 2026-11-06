import 'server-only';
import { isRecord } from '@adforge/core';
import { enqueueJob, features, randomToken, type ServiceClient } from '@adforge/core/server';

const PAGE = 1000;
/** A second sweep catches files that a job still running at deletion time wrote afterwards. */
const SWEEP_DELAY_MS = 30 * 60_000;

/**
 * Queues removal of a workspace's stored files and Mux copies. The purge job does nothing while the
 * workspace still exists, so it is safe to queue before the rows are deleted.
 */
async function queueStoragePurge(sb: ServiceClient, workspaceId: string) {
  const drivers = new Set<'supabase' | 's3'>([features().storage]);
  const muxAssetIds: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('assets').select('storage_driver, playback').eq('workspace_id', workspaceId).order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not list the workspace's files: ${error.message}`);
    for (const a of data) {
      if (a.storage_driver === 's3' || a.storage_driver === 'supabase') drivers.add(a.storage_driver);
      const playback = isRecord(a.playback) ? a.playback : {};
      if (typeof playback.muxAssetId === 'string') muxAssetIds.push(playback.muxAssetId);
    }
    if (data.length < PAGE) break;
  }
  const now = Date.now();
  for (const [delay, mux] of [
    [60_000, muxAssetIds],
    [SWEEP_DELAY_MS, []],
  ] as const) {
    await enqueueJob(sb, { type: 'storage.purge', workspaceId: null, payload: { workspaceId, drivers: [...drivers], muxAssetIds: [...mux] }, runAt: new Date(now + delay), maxAttempts: 8, priority: 5 });
  }
}

/** Stops the workspace's queued and running jobs so nothing new starts on data that is going away. */
async function cancelJobs(sb: ServiceClient, workspaceId: string) {
  await sb.from('jobs').update({ status: 'canceled', completed_at: new Date().toISOString(), locked_by: null, locked_until: null }).eq('workspace_id', workspaceId).in('status', ['queued', 'running']);
}

/**
 * Permanently deletes an account: every workspace it owns (all rows at once through cascades, stored
 * files by a background job) and then the sign-in itself. Memberships in other people's workspaces
 * end with it.
 */
export async function deleteAccount(sb: ServiceClient, userId: string): Promise<{ workspaces: number }> {
  const { data: owned, error } = await sb.from('workspaces').select('id').eq('owner_id', userId);
  if (error) throw new Error(`Could not load your workspaces: ${error.message}`);
  for (const ws of owned) {
    await queueStoragePurge(sb, ws.id);
    await cancelJobs(sb, ws.id);
  }
  // Workspaces cascade from their owner, so deleting the user removes them and everything in them.
  const { error: authError } = await sb.auth.admin.deleteUser(userId);
  if (authError) throw new Error(`Could not delete the account: ${authError.message}`);
  return { workspaces: owned.length };
}

/**
 * Removes the Facebook Pages, Instagram accounts and Meta ad accounts that a Facebook user connected,
 * with their tokens, in every workspace. Used by Meta's data deletion and deauthorize callbacks.
 */
export async function deleteMetaUserData(sb: ServiceClient, fbUserId: string): Promise<number> {
  const [social, ads] = await Promise.all([
    sb.from('social_accounts').delete({ count: 'exact' }).in('platform', ['facebook', 'instagram']).eq('meta->>fbUserId', fbUserId),
    sb.from('ad_accounts').delete({ count: 'exact' }).eq('platform', 'meta').eq('meta->>fbUserId', fbUserId),
  ]);
  if (social.error) throw new Error(`Could not delete the connected accounts: ${social.error.message}`);
  if (ads.error) throw new Error(`Could not delete the connected ad accounts: ${ads.error.message}`);
  return (social.count ?? 0) + (ads.count ?? 0);
}

const REVOKED_DETAIL = 'Access was removed in Facebook settings. Connect again to keep posting.';

/**
 * Disconnects what a Facebook user connected after they removed the app from their account: tokens
 * are deleted and pending posts canceled, while past results stay readable, as with a disconnect.
 */
export async function revokeMetaUser(sb: ServiceClient, fbUserId: string): Promise<number> {
  const [social, ads] = await Promise.all([
    sb.from('social_accounts').select('id').in('platform', ['facebook', 'instagram']).eq('meta->>fbUserId', fbUserId),
    sb.from('ad_accounts').select('id').eq('platform', 'meta').eq('meta->>fbUserId', fbUserId),
  ]);
  if (social.error || ads.error) throw new Error(`Could not find the connected accounts: ${(social.error ?? ads.error)!.message}`);
  const socialIds = social.data.map((r) => r.id);
  const adIds = ads.data.map((r) => r.id);
  if (socialIds.length) {
    await sb.from('post_targets').update({ status: 'canceled', error: REVOKED_DETAIL }).in('social_account_id', socialIds).eq('status', 'pending');
    await sb.from('social_account_tokens').delete().in('social_account_id', socialIds);
    await sb.from('social_accounts').update({ status: 'revoked', status_detail: REVOKED_DETAIL, token_expires_at: null }).in('id', socialIds);
  }
  if (adIds.length) {
    await sb.from('ad_account_tokens').delete().in('ad_account_id', adIds);
    await sb.from('ad_accounts').update({ status: 'revoked', status_detail: REVOKED_DETAIL, token_expires_at: null }).in('id', adIds);
  }
  return socialIds.length + adIds.length;
}

/** Records a completed Meta data deletion request and returns its confirmation code. */
export async function recordMetaDeletion(sb: ServiceClient, accountsRemoved: number): Promise<string> {
  const code = randomToken(20);
  const { error } = await sb.from('data_deletion_requests').insert({ code, source: 'meta', status: 'completed', accounts_removed: accountsRemoved, completed_at: new Date().toISOString() });
  if (error) throw new Error(`Could not record the deletion request: ${error.message}`);
  return code;
}
