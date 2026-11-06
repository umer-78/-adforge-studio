import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toPostViews } from '@/lib/server/distribution';
import { enqueuePendingTargets } from '@/lib/server/posts';
import { requireSession } from '@/lib/server/providers';

const body = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(1000).optional() });

/** An admin approves a post (it is scheduled or goes out now) or sends it back with a note. */
export const POST = route({ body, role: 'admin', scope: 'publish' }, async ({ sb, caller, params, body: b }) => {
  requireSession(caller, 'Approvals');
  const row = await owned(sb, 'posts', params.id!, caller, 'The post');
  if (row.status !== 'pending_approval') throw badRequest('This post is not waiting for approval.');
  const reviewed = { reviewed_by: caller.userId, reviewed_at: new Date().toISOString(), review_note: b.note || null };
  if (b.decision === 'reject') {
    if (!b.note) throw badRequest('Say what to change, so the author knows.');
    const updated = check(await sb.from('posts').update({ status: 'draft', ...reviewed }).eq('id', row.id).eq('status', 'pending_approval').select('*').maybeSingle(), 'Could not save the review');
    if (!updated) throw badRequest('Someone else just reviewed this post.');
    await logActivity(sb, caller, 'post.rejected', 'post', row.id, { note: b.note });
    return (await toPostViews(sb, caller.workspaceId, [updated]))[0];
  }
  const later = !!row.scheduled_at && new Date(row.scheduled_at).getTime() > Date.now() + 30_000;
  const updated = check(
    await sb
      .from('posts')
      .update({ status: later ? 'scheduled' : 'publishing', scheduled_at: later ? row.scheduled_at : null, ...reviewed })
      .eq('id', row.id)
      .eq('status', 'pending_approval')
      .select('*')
      .maybeSingle(),
    'Could not save the review',
  );
  if (!updated) throw badRequest('Someone else just reviewed this post.');
  if (!later) await enqueuePendingTargets(sb, caller, row.id, 'approved');
  await logActivity(sb, caller, 'post.approved', 'post', row.id, { scheduledAt: updated.scheduled_at });
  return (await toPostViews(sb, caller.workspaceId, [updated]))[0];
});
