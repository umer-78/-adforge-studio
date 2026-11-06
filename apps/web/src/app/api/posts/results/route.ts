import { isRecord } from '@adforge/core';
import { route } from '@/lib/server/api';

/** How published posts did, by when they went out: the input for best times to post. */
export const GET = route({}, async ({ sb, caller }) => {
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const { data, error } = await sb
    .from('post_targets')
    .select('platform, social_account_id, published_at, metrics')
    .eq('workspace_id', caller.workspaceId)
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return {
    items: (data ?? [])
      .filter((r) => r.published_at)
      .map((r) => ({ platform: r.platform, accountId: r.social_account_id, publishedAt: r.published_at!, metrics: isRecord(r.metrics) ? r.metrics : {} })),
  };
});
