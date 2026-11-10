import { enqueueJob } from '@adforge/core/server';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { publishableAsset, toPostViews } from '@/lib/server/distribution';

/** Publishes again to the accounts that failed. */
export const POST = route({ scope: 'publish', limit: ['posts', 120, 3600] }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'posts', params.id!, caller, 'The post');
  if (!['failed', 'partially_published'].includes(row.status)) throw badRequest('Only failed posts can be retried.');
  if (row.asset_id) await publishableAsset(sb, caller, row.asset_id);
  for (const id of (row.carousel_asset_ids ?? []).slice(1)) await publishableAsset(sb, caller, id);
  const { data: failed } = await sb.from('post_targets').select('id').eq('post_id', row.id).eq('status', 'failed');
  if (!failed?.length) throw badRequest('No account failed for this post.');
  check(await sb.from('post_targets').update({ status: 'pending', error: null }).in('id', failed.map((t) => t.id)), 'Could not retry');
  const updated = check(await sb.from('posts').update({ status: 'publishing' }).eq('id', row.id).select('*').single(), 'Could not retry');
  for (const t of failed) {
    const job = await enqueueJob(sb, { type: 'publish.post', payload: { postTargetId: t.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 10, idempotencyKey: `publish.post:${t.id}:retry:${Date.now()}` });
    await sb.from('post_targets').update({ job_id: job.id }).eq('id', t.id);
  }
  return (await toPostViews(sb, caller.workspaceId, [updated]))[0];
});
