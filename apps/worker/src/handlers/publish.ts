import path from 'node:path';
import {
  AI_LABEL_TEXT,
  asJson,
  composeCaption,
  isRecord,
  PLATFORM_SPECS,
  SIGNED_URL_TTL,
  SOCIAL_PLATFORMS,
  validateForPlatform,
  type AssetRow,
  type PostRow,
  type PostTargetRow,
  type SocialAccountRow,
  type SocialPlatform,
} from '@adforge/core';
import { PlatformError, recordUsage, social, storage } from '@adforge/core/server';
import { activity } from '../lib/activity';
import { PermanentError, userMessage } from '../lib/errors';
import { downloadAsset, putDerived } from '../lib/files';
import { assertLicensed } from '../lib/licensing';
import { nowIso } from '../lib/util';
import { toJpeg } from '../media/ffmpeg';
import { reschedule, type JobContext, type JobHandler } from '../runner';

/** Platforms whose publisher pushes the file bytes instead of letting the platform pull a URL. */
const PUSH_PLATFORMS = new Set<SocialPlatform>(['youtube', 'tiktok', 'linkedin', 'x', 'pinterest']);
const MAX_PROCESSING_MS = 3 * 3600_000;
const MAX_RENDER_WAIT_MS = 3 * 3600_000;

interface PublishState {
  state: Record<string, unknown>;
  startedAt: string;
}

const isPlatform = (p: string): p is SocialPlatform => (SOCIAL_PLATFORMS as readonly string[]).includes(p);

function publishState(target: PostTargetRow): PublishState | null {
  const o = isRecord(target.options) ? target.options.__publish : null;
  return isRecord(o) && isRecord(o.state) && typeof o.startedAt === 'string' ? { state: o.state, startedAt: o.startedAt } : null;
}

function userOptions(target: PostTargetRow): Record<string, unknown> {
  const { __publish: _, ...rest } = isRecord(target.options) ? target.options : {};
  return rest;
}

/** Recomputes a post's status from its targets. */
async function syncPostStatus(ctx: JobContext, postId: string) {
  const { data: targets } = await ctx.sb.from('post_targets').select('status, published_at').eq('post_id', postId);
  const list = (targets ?? []).filter((t) => t.status !== 'canceled');
  if (!list.length) {
    if (targets?.length) await ctx.sb.from('posts').update({ status: 'canceled' }).eq('id', postId);
    return;
  }
  const open = list.some((t) => ['pending', 'publishing', 'processing'].includes(t.status));
  const published = list.filter((t) => t.status === 'published');
  const status = open ? 'publishing' : published.length === list.length ? 'published' : published.length ? 'partially_published' : 'failed';
  const first = published.map((t) => t.published_at).filter((d): d is string => !!d).sort()[0] ?? null;
  await ctx.sb
    .from('posts')
    .update({ status, ...(first ? { published_at: first } : {}) })
    .eq('id', postId)
    .neq('status', 'canceled');
}

/** The media to publish: the post's file, or its export once rendering finished. */
async function resolveAsset(ctx: JobContext, post: PostRow): Promise<AssetRow | { wait: string }> {
  let assetId = post.asset_id;
  if (!assetId && post.render_id) {
    const { data: render } = await ctx.sb.from('renders').select('status, output_asset_id, error').eq('id', post.render_id).maybeSingle();
    if (!render) throw new PermanentError('The export for this post was deleted.');
    if (render.status === 'failed' || render.status === 'canceled') throw new PermanentError(`The export for this post did not finish${render.error ? `: ${render.error}` : '.'}`);
    if (render.status !== 'succeeded' || !render.output_asset_id) return { wait: 'Waiting for the export to finish' };
    assetId = render.output_asset_id;
    await ctx.sb.from('posts').update({ asset_id: assetId }).eq('id', post.id);
  }
  if (!assetId) throw new PermanentError('This post has no media.');
  const { data: asset } = await ctx.sb.from('assets').select('*').eq('id', assetId).eq('workspace_id', post.workspace_id).maybeSingle();
  if (!asset || asset.deleted_at) throw new PermanentError('The media for this post was deleted.');
  if (asset.status === 'failed') throw new PermanentError('The media for this post could not be processed.');
  if (asset.status !== 'ready') return { wait: 'Waiting for the media to finish processing' };
  return asset;
}

async function buildContext(
  ctx: JobContext,
  input: { post: PostRow; target: PostTargetRow; account: SocialAccountRow; asset: AssetRow; platform: SocialPlatform; accessToken: string; withFile: boolean },
): Promise<social.PublishContext> {
  const { post, target, account, asset, platform } = input;
  const spec = PLATFORM_SPECS[platform];
  const meta = isRecord(asset.meta) ? asset.meta : {};
  const options: Record<string, unknown> = { ...userOptions(target), idempotencyKey: target.id };
  const driver = storage(asset.storage_driver);
  const isVideo = asset.type === 'video';
  if (asset.type !== 'video' && asset.type !== 'image') throw new PermanentError(`${spec.label} needs a video or an image.`);

  let url = await driver.signedReadUrl(asset.storage_key, SIGNED_URL_TTL.publish);
  let contentType = asset.mime_type;
  let filePath = '';
  let sizeBytes = asset.size_bytes ?? 0;
  const needsJpeg = input.withFile && !isVideo && platform === 'instagram' && account.provider !== 'ayrshare' && !/jpe?g/.test(asset.mime_type);
  if ((input.withFile && PUSH_PLATFORMS.has(platform) && account.provider !== 'ayrshare') || needsJpeg) {
    filePath = await downloadAsset(ctx, asset);
    if (needsJpeg) {
      const jpg = path.join(await ctx.tmp(), 'publish.jpg');
      await toJpeg(filePath, jpg, 1440, ctx.signal);
      const derived = await putDerived(asset, 'publish.jpg', jpg, 'image/jpeg');
      url = await driver.signedReadUrl(derived.key, SIGNED_URL_TTL.publish);
      filePath = jpg;
      contentType = 'image/jpeg';
      sizeBytes = derived.bytes;
    }
  }

  let coverUrl: string | null = null;
  if (typeof options.coverAssetId === 'string') {
    const { data: cover } = await ctx.sb.from('assets').select('storage_driver, storage_key, type').eq('id', options.coverAssetId).eq('workspace_id', post.workspace_id).maybeSingle();
    if (cover?.type === 'image') coverUrl = await storage(cover.storage_driver).signedReadUrl(cover.storage_key, SIGNED_URL_TTL.publish);
  }
  if (!coverUrl && isVideo && asset.thumbnail_key) coverUrl = await driver.signedReadUrl(asset.thumbnail_key, SIGNED_URL_TTL.publish);

  const aiGenerated = post.ai_generated_label || asset.is_ai_generated;
  let caption = target.caption_override ?? post.caption;
  // Without a native disclosure flag or a burned-in label, say it in the caption.
  if (post.ai_generated_label && !spec.aiDisclosure && meta.aiLabelBurnedIn !== true && !caption.includes(AI_LABEL_TEXT)) caption = `${caption.trim()}\n\n${AI_LABEL_TEXT}`.trim();
  const hashtags = target.hashtags_override ?? post.hashtags;

  return {
    accessToken: input.accessToken,
    account: { externalId: account.external_id, handle: account.handle, meta: isRecord(account.meta) ? account.meta : {} },
    media: { kind: isVideo ? 'video' : 'image', url, filePath, sizeBytes, contentType, durationS: asset.duration_s, width: asset.width, height: asset.height, coverUrl },
    title: post.title,
    caption: composeCaption(caption, hashtags, spec.captionLimit),
    hashtags,
    options,
    aiGenerated,
    link: typeof options.link === 'string' ? options.link : null,
  };
}

async function loadTarget(ctx: JobContext, id: string) {
  const { data: target } = await ctx.sb.from('post_targets').select('*').eq('id', id).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (!target) throw new PermanentError('This post target no longer exists.');
  const { data: post } = await ctx.sb.from('posts').select('*').eq('id', target.post_id).maybeSingle();
  if (!post) throw new PermanentError('This post no longer exists.');
  return { target, post };
}

export const publishPost: JobHandler<'publish.post'> = {
  async run(ctx, { postTargetId }) {
    const { target, post } = await loadTarget(ctx, postTargetId);
    if (target.status === 'published' || target.status === 'canceled') return { skipped: target.status };
    if (post.status === 'canceled') {
      await ctx.sb.from('post_targets').update({ status: 'canceled' }).eq('id', target.id);
      return { skipped: 'canceled' };
    }
    if (!isPlatform(target.platform)) throw new PermanentError(`Unknown platform ${target.platform}.`);
    const platform = target.platform;
    const spec = PLATFORM_SPECS[platform];
    if (!post.rights_acknowledged) throw new PermanentError('Confirm you have the rights to this media before publishing.', 'rights_required');

    const { data: account } = await ctx.sb.from('social_accounts').select('*').eq('id', target.social_account_id).maybeSingle();
    if (!account) throw new PermanentError(`The ${spec.label} account was disconnected.`);
    if (account.status !== 'active') throw new PermanentError(`Reconnect your ${spec.label} account in Settings → Accounts, then retry.`, 'account_inactive');

    const resolved = await resolveAsset(ctx, post);
    if ('wait' in resolved) {
      if (Date.now() - new Date(ctx.job.created_at).getTime() > MAX_RENDER_WAIT_MS) throw new PermanentError('The media was still not ready after 3 hours. Check the export and publish again.');
      await ctx.sb.from('post_targets').update({ status: 'publishing', job_id: ctx.job.id }).eq('id', target.id);
      return reschedule(30, resolved.wait);
    }
    const asset = resolved;
    await assertLicensed(ctx.sb, asset);

    const caption = target.caption_override ?? post.caption;
    const hashtags = target.hashtags_override ?? post.hashtags;
    const errors = validateForPlatform(platform, { durationS: asset.duration_s, sizeBytes: asset.size_bytes, width: asset.width, height: asset.height, type: asset.type }, { caption, hashtags, title: post.title }).filter((i) => i.level === 'error');
    if (errors.length) throw new PermanentError(errors.map((e) => e.message).join(' '), 'platform_rules');

    const pending = publishState(target);
    try {
      const accessToken = await social.socialAccessToken(ctx.sb, account);
      if (!pending) {
        await ctx.sb.from('post_targets').update({ status: 'publishing', attempts: target.attempts + 1, job_id: ctx.job.id, error: null }).eq('id', target.id);
        await ctx.sb.from('posts').update({ status: 'publishing' }).eq('id', post.id).in('status', ['draft', 'scheduled', 'failed', 'partially_published']);
      }
      ctx.progress(pending ? 70 : 10, pending ? `Waiting for ${spec.label} to process the upload` : `Uploading to ${spec.label}`);
      const pctx = await buildContext(ctx, { post, target, account, asset, platform, accessToken, withFile: !pending });
      ctx.checkAborted();

      let outcome: social.PublishOutcome;
      if (account.provider === 'ayrshare') outcome = await social.ayrsharePublish(platform, pctx);
      else {
        const publisher = social.PUBLISHERS[platform];
        if (pending) {
          if (!publisher.check) throw new PermanentError(`${spec.label} cannot resume this upload. Publish again.`);
          if (Date.now() - new Date(pending.startedAt).getTime() > MAX_PROCESSING_MS) throw new PermanentError(`${spec.label} was still processing the video after 3 hours. Check the account and publish again.`);
          outcome = await publisher.check(pctx, pending.state);
        } else outcome = await publisher.publish(pctx);
      }

      if (outcome.status === 'processing') {
        const state: PublishState = { state: outcome.state, startedAt: pending?.startedAt ?? nowIso() };
        await ctx.sb
          .from('post_targets')
          .update({ status: 'processing', options: asJson({ ...userOptions(target), __publish: state }), ...(outcome.externalId ? { external_id: outcome.externalId } : {}) })
          .eq('id', target.id);
        return reschedule(Math.max(3, Math.min(120, outcome.retryAfterS)), `${spec.label} is processing the upload`, 80);
      }

      const publishedAt = nowIso();
      await ctx.sb
        .from('post_targets')
        .update({ status: 'published', external_id: outcome.externalId, external_url: outcome.externalUrl, published_at: publishedAt, error: null, options: asJson(userOptions(target)) })
        .eq('id', target.id);
      await syncPostStatus(ctx, post.id);
      await recordUsage(ctx.sb, { workspaceId: post.workspace_id, userId: ctx.job.created_by, kind: 'publish', provider: account.provider === 'ayrshare' ? 'ayrshare' : platform, units: 1, unit: 'post', costUsd: 0, jobId: ctx.job.id, meta: { platform, postId: post.id } });
      await activity(ctx.sb, { workspaceId: post.workspace_id, actorId: post.created_by, verb: 'post.published', objectType: 'post', objectId: post.id, data: { platform, url: outcome.externalUrl } });
      await ctx.enqueue('publish.metrics', { postTargetId: target.id }, { runAt: new Date(Date.now() + 3600_000), idempotencyKey: `publish.metrics:${target.id}:first` });
      return { platform, externalId: outcome.externalId, url: outcome.externalUrl };
    } catch (err) {
      if (err instanceof PlatformError && err.authExpired) await social.markSocialAccount(ctx.sb, account.id, 'expired', err.message);
      throw err;
    }
  },
  async onFailure(ctx, { postTargetId }, message) {
    const { data } = await ctx.sb.from('post_targets').update({ status: 'failed', error: message }).eq('id', postTargetId).neq('status', 'published').select('post_id').maybeSingle();
    if (data) await syncPostStatus(ctx, data.post_id);
  },
  async onCancel(ctx, { postTargetId }) {
    const { data } = await ctx.sb.from('post_targets').update({ status: 'canceled' }).eq('id', postTargetId).in('status', ['pending', 'publishing', 'processing']).select('post_id').maybeSingle();
    if (data) await syncPostStatus(ctx, data.post_id);
  },
};

/* ---------------------------------- Metrics --------------------------------- */

/** How long to wait between metric refreshes, by post age. */
function refreshIntervalMs(publishedAt: string): number {
  const age = Date.now() - new Date(publishedAt).getTime();
  if (age < 2 * 86400_000) return 3 * 3600_000;
  if (age < 7 * 86400_000) return 12 * 3600_000;
  return 48 * 3600_000;
}

async function refreshTarget(ctx: JobContext, target: PostTargetRow): Promise<boolean> {
  if (target.status !== 'published' || !target.external_id || !isPlatform(target.platform)) return false;
  const { data: account } = await ctx.sb.from('social_accounts').select('*').eq('id', target.social_account_id).maybeSingle();
  if (!account || account.status !== 'active') return false;
  const platform = target.platform;
  const token = await social.socialAccessToken(ctx.sb, account);
  const accountRef = { externalId: account.external_id, handle: account.handle, meta: isRecord(account.meta) ? account.meta : {} };
  const metrics =
    account.provider === 'ayrshare'
      ? await social.ayrshareMetrics(token, platform, target.external_id, typeof accountRef.meta.profileKey === 'string' ? accountRef.meta.profileKey : null)
      : await social.PUBLISHERS[platform].metrics?.({ accessToken: token, account: accountRef }, target.external_id);
  const now = nowIso();
  if (!metrics) {
    await ctx.sb.from('post_targets').update({ metrics_updated_at: now }).eq('id', target.id);
    return false;
  }
  const { error } = await ctx.sb.from('post_metrics').insert({
    post_target_id: target.id,
    workspace_id: target.workspace_id,
    views: metrics.views,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    saves: metrics.saves,
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    watch_time_s: metrics.watchTimeS,
    ctr: metrics.ctr,
    raw: asJson(metrics.raw),
  });
  if (error) throw new Error(`Could not save metrics: ${error.message}`);
  const { raw: _, ...summary } = metrics;
  await ctx.sb.from('post_targets').update({ metrics: asJson(summary), metrics_updated_at: now }).eq('id', target.id);
  return true;
}

export const publishMetrics: JobHandler<'publish.metrics'> = {
  async run(ctx, { postTargetId }) {
    if (postTargetId) {
      const { data: target } = await ctx.sb.from('post_targets').select('*').eq('id', postTargetId).maybeSingle();
      if (!target) return { skipped: 'missing' };
      return { updated: await refreshTarget(ctx, target) };
    }
    // Scheduled sweep: posts from the last 30 days, refreshed less often as they age.
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    let q = ctx.sb.from('post_targets').select('*').eq('status', 'published').not('external_id', 'is', null).gte('published_at', since).order('metrics_updated_at', { ascending: true, nullsFirst: true }).limit(200);
    if (ctx.job.workspace_id) q = q.eq('workspace_id', ctx.job.workspace_id);
    const { data: targets, error } = await q;
    if (error) throw new Error(`Could not load posts: ${error.message}`);
    const due = (targets ?? []).filter((t) => !t.metrics_updated_at || Date.now() - new Date(t.metrics_updated_at).getTime() >= refreshIntervalMs(t.published_at!)).slice(0, 60);
    let updated = 0;
    let failed = 0;
    for (const [i, t] of due.entries()) {
      ctx.checkAborted();
      ctx.progress((i / due.length) * 100, 'Syncing post metrics');
      try {
        if (await refreshTarget(ctx, t)) updated++;
      } catch (err) {
        if ((err as { name?: string }).name === 'JobAborted') throw err;
        failed++;
        // Stamp the attempt so one broken post does not block the queue.
        await ctx.sb.from('post_targets').update({ metrics_updated_at: nowIso() }).eq('id', t.id);
        ctx.log.warn({ postTargetId: t.id, err: userMessage(err) }, 'metrics sync failed');
      }
    }
    return { checked: due.length, updated, failed };
  },
};
