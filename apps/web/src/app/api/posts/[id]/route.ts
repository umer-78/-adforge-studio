import { asJson, isRecord } from '@adforge/core';
import { enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toPostViews } from '@/lib/server/distribution';
import { cleanHashtags } from '@/lib/server/posts';

const patch = z.object({
  title: z.string().max(200).nullish(),
  caption: z.string().max(5000).optional(),
  firstComment: z.string().trim().max(2200).nullish(),
  hashtags: z.array(z.string().max(80)).max(30).optional(),
  /** A new time, or null to publish now. */
  scheduledAt: z.string().datetime({ offset: true }).nullish(),
  targets: z.array(z.object({ id: z.string().uuid(), captionOverride: z.string().max(5000).nullish(), options: z.record(z.string(), z.unknown()).optional() })).max(14).optional(),
  status: z.literal('canceled').optional(),
});

export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'posts', params.id!, caller, 'The post');
  return (await toPostViews(sb, caller.workspaceId, [row]))[0];
});

/** Edits, reschedules, publishes now or cancels a post that has not gone out yet. */
export const PATCH = route({ body: patch, scope: 'publish' }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'posts', params.id!, caller, 'The post');
  if (!['draft', 'scheduled'].includes(row.status)) throw badRequest(row.status === 'publishing' ? 'This post is being published right now.' : 'This post already went out; change it on the platform.');

  if (body.status === 'canceled') {
    check(await sb.from('post_targets').update({ status: 'canceled' }).eq('post_id', row.id).eq('status', 'pending'), 'Could not cancel the post');
    const updated = check(await sb.from('posts').update({ status: 'canceled' }).eq('id', row.id).in('status', ['draft', 'scheduled']).select('*').maybeSingle(), 'Could not cancel the post');
    if (!updated) throw badRequest('This post just started publishing.');
    await logActivity(sb, caller, 'post.canceled', 'post', row.id);
    return (await toPostViews(sb, caller.workspaceId, [updated]))[0];
  }

  for (const t of body.targets ?? []) {
    const { data: target } = await sb.from('post_targets').select('id, options').eq('id', t.id).eq('post_id', row.id).maybeSingle();
    if (!target) throw badRequest('One of the accounts is not part of this post.');
    check(
      await sb
        .from('post_targets')
        .update({
          ...(t.captionOverride !== undefined ? { caption_override: t.captionOverride?.trim() ? t.captionOverride : null } : {}),
          ...(t.options ? { options: asJson({ ...t.options, ...(isRecord(target.options) && target.options.__publish ? { __publish: target.options.__publish } : {}) }) } : {}),
        })
        .eq('id', t.id),
      'Could not save the post',
    );
  }

  let status = row.status;
  let scheduledAt = row.scheduled_at;
  if (body.scheduledAt !== undefined) {
    const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (when && when.getTime() < Date.now() - 60_000) throw badRequest('Pick a time in the future, or publish now.');
    const later = !!when && when.getTime() > Date.now() + 30_000;
    status = later ? 'scheduled' : 'publishing';
    scheduledAt = later ? when.toISOString() : null;
  }
  // The status guard keeps the scheduler and this edit from both publishing the post.
  const updated = check(
    await sb
      .from('posts')
      .update({
        ...(body.title !== undefined ? { title: body.title?.trim() || null } : {}),
        ...(body.caption !== undefined ? { caption: body.caption } : {}),
        ...(body.firstComment !== undefined ? { first_comment: body.firstComment || null } : {}),
        ...(body.hashtags ? { hashtags: cleanHashtags(body.hashtags) } : {}),
        status,
        scheduled_at: scheduledAt,
      })
      .eq('id', row.id)
      .eq('status', row.status)
      .select('*')
      .maybeSingle(),
    'Could not save the post',
  );
  if (!updated) throw badRequest('This post just started publishing.');
  if (status === 'publishing') {
    const { data: targets } = await sb.from('post_targets').select('id').eq('post_id', row.id).eq('status', 'pending');
    for (const t of targets ?? []) {
      const job = await enqueueJob(sb, { type: 'publish.post', payload: { postTargetId: t.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 10, idempotencyKey: `publish.post:${t.id}:now:${Date.now()}` });
      await sb.from('post_targets').update({ job_id: job.id }).eq('id', t.id);
    }
  }
  return (await toPostViews(sb, caller.workspaceId, [updated]))[0];
});

/** Removes the post from AdForge. Anything already published stays on the platforms. */
export const DELETE = route({ scope: 'publish' }, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'posts', params.id!, caller, 'The post');
  if (row.status === 'publishing') throw badRequest('This post is being published right now. Wait for it to finish.');
  check(await sb.from('posts').delete().eq('id', row.id), 'Could not delete the post');
});
