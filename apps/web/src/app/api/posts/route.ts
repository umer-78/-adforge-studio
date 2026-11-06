import { asJson, postCreateSchema } from '@adforge/core';
import { enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { carouselAssets, publishableAsset, toPostViews } from '@/lib/server/distribution';
import { cleanHashtags, needsApproval, platformChecks, targetAccounts } from '@/lib/server/posts';

const STATUSES = ['draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'canceled'] as const;

const query = z.object({
  status: z.enum(STATUSES).optional(),
  /** Calendar range: posts scheduled or published in [from, to). */
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  abGroup: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().datetime({ offset: true }).optional(),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('posts').select('*').eq('workspace_id', caller.workspaceId);
  if (q.status) req = req.eq('status', q.status);
  if (q.abGroup) req = req.eq('ab_group', q.abGroup);
  if (q.assetId) req = req.eq('asset_id', q.assetId);
  if (q.from && q.to) req = req.or(`and(scheduled_at.gte."${q.from}",scheduled_at.lt."${q.to}"),and(published_at.gte."${q.from}",published_at.lt."${q.to}")`);
  const calendar = !!(q.from && q.to) || q.status === 'scheduled';
  req = calendar ? req.order('scheduled_at', { ascending: true, nullsFirst: false }).order('published_at', { ascending: true }) : req.order('created_at', { ascending: false });
  if (q.cursor && !calendar) req = req.lt('created_at', q.cursor);
  const rows = check(await req.limit(q.limit + 1), 'Could not load posts');
  const page = rows.slice(0, q.limit);
  return { items: await toPostViews(sb, caller.workspaceId, page), nextCursor: !calendar && rows.length > q.limit ? page[page.length - 1]!.created_at : null };
});

/** Publishes now or at a set time to several accounts, each with its own caption and options. */
export const POST = route({ body: postCreateSchema, scope: 'publish', limit: ['posts', 120, 3600] }, async ({ sb, caller, body }) => {
  const asset = await publishableAsset(sb, caller, body.assetId);
  const carousel = await carouselAssets(sb, caller, asset, body.carouselAssetIds);
  if (body.projectId) await owned(sb, 'projects', body.projectId, caller, 'The project');
  if (body.abGroup && !z.string().uuid().safeParse(body.abGroup).success) throw badRequest('An A/B test group must be a test id.');
  if (body.abVariant && !body.abGroup) throw badRequest('An A/B variant needs a test group.');
  const accounts = await targetAccounts(sb, caller, body.targets);
  const hashtags = cleanHashtags(body.hashtags);
  const checks = platformChecks(asset, { title: body.title, caption: body.caption, hashtags }, body.targets, accounts, carousel);
  const errors = checks.flatMap((c) => c.issues.filter((i) => i.level === 'error').map((i) => i.message));
  if (errors.length) throw badRequest(errors.join(' '), { checks });

  const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (when && when.getTime() < Date.now() - 60_000) throw badRequest('Pick a time in the future, or publish now.');
  if (when && when.getTime() > Date.now() + 366 * 86_400_000) throw badRequest('Schedule at most a year ahead.');
  const scheduled = !!when && when.getTime() > Date.now() + 30_000;
  const approval = await needsApproval(sb, caller);

  const post = check(
    await sb
      .from('posts')
      .insert({
        workspace_id: caller.workspaceId,
        project_id: body.projectId ?? null,
        asset_id: asset.id,
        carousel_asset_ids: carousel ? carousel.map((a) => a.id) : [],
        title: body.title?.trim() || null,
        caption: body.caption,
        first_comment: body.firstComment?.trim() || null,
        hashtags,
        status: approval ? 'pending_approval' : scheduled ? 'scheduled' : 'publishing',
        submitted_by: approval ? caller.userId : null,
        scheduled_at: scheduled ? when.toISOString() : null,
        ab_group: body.abGroup ?? null,
        ab_variant: body.abVariant ?? null,
        ai_generated_label: body.aiLabel,
        rights_acknowledged: body.rightsAcknowledged,
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not create the post',
  );
  const targets = await sb
    .from('post_targets')
    .insert(
      body.targets.map((t) => ({
        post_id: post.id,
        workspace_id: caller.workspaceId,
        social_account_id: t.socialAccountId,
        platform: accounts.get(t.socialAccountId)!.platform,
        caption_override: t.captionOverride?.trim() ? t.captionOverride : null,
        options: asJson(t.options),
        status: 'pending',
      })),
    )
    .select('id');
  if (targets.error) {
    await sb.from('posts').delete().eq('id', post.id);
    check(targets, 'Could not create the post');
  }
  if (!scheduled && !approval) {
    for (const t of targets.data ?? []) {
      const job = await enqueueJob(sb, { type: 'publish.post', payload: { postTargetId: t.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 10, idempotencyKey: `publish.post:${t.id}:now` });
      await sb.from('post_targets').update({ job_id: job.id }).eq('id', t.id);
    }
  }
  await logActivity(sb, caller, approval ? 'post.submitted' : scheduled ? 'post.scheduled' : 'post.publish', 'post', post.id, { platforms: [...new Set([...accounts.values()].map((a) => a.platform))], scheduledAt: post.scheduled_at });
  return (await toPostViews(sb, caller.workspaceId, [post]))[0];
});
