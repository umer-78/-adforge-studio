import { isRecord, sleep } from '../../utils';
import { env } from '../env';
import { api, num, PlatformError, tokenSet } from './http';
import { emptyMetrics, type ConnectedAccount, type Connector, type MetricsSnapshot, type Publisher } from './types';

export const graph = (path: string) => `https://graph.facebook.com/${env().META_GRAPH_VERSION}${path}`;

/** Meta error 190 is an expired or revoked token. */
export const metaAuthError = (_status: number, body: unknown) => isRecord(body) && isRecord(body.error) && (body.error.code === 190 || body.error.code === 102);

export async function metaGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const { data } = await api<T>('meta', `${graph(path)}${path.includes('?') ? '&' : '?'}${qs}`, { retries: 2 }, metaAuthError);
  return data;
}

export async function metaPost<T>(path: string, token: string, form: Record<string, string | number | boolean | undefined | null> = {}, host = 'graph'): Promise<T> {
  const base = host === 'graph' ? graph(path) : `https://graph-video.facebook.com/${env().META_GRAPH_VERSION}${path}`;
  const { data } = await api<T>('meta', base, { form: { ...form, access_token: token } }, metaAuthError);
  return data;
}

const SOCIAL_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'read_insights',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
];

export function metaAuthorizeUrl(scopes: string[], state: string, redirectUri: string): string {
  const qs = new URLSearchParams({ client_id: env().META_APP_ID!, redirect_uri: redirectUri, state, response_type: 'code', scope: scopes.join(',') });
  return `https://www.facebook.com/${env().META_GRAPH_VERSION}/dialog/oauth?${qs}`;
}

/** Code → short-lived user token → long-lived (about 60 days) user token. */
export async function metaExchange(code: string, redirectUri: string) {
  const e = env();
  const short = await api<Record<string, unknown>>(
    'meta',
    `${graph('/oauth/access_token')}?${new URLSearchParams({ client_id: e.META_APP_ID!, client_secret: e.META_APP_SECRET!, redirect_uri: redirectUri, code })}`,
  );
  const long = await api<Record<string, unknown>>(
    'meta',
    `${graph('/oauth/access_token')}?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: e.META_APP_ID!, client_secret: e.META_APP_SECRET!, fb_exchange_token: String(short.data.access_token) })}`,
  );
  return tokenSet(long.data);
}

interface PageRow {
  id: string;
  name: string;
  username?: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
}

export const metaConnector: Connector = {
  id: 'meta',
  label: 'Facebook & Instagram',
  platforms: ['facebook', 'instagram'],
  pkce: false,
  configured: () => !!(env().META_APP_ID && env().META_APP_SECRET),
  authorizeUrl: ({ state, redirectUri }) => metaAuthorizeUrl(SOCIAL_SCOPES, state, redirectUri),
  exchange: (code, redirectUri) => metaExchange(code, redirectUri),
  async accounts(token) {
    const out: ConnectedAccount[] = [];
    let next: string | null = graph(
      `/me/accounts?${new URLSearchParams({ fields: 'id,name,username,access_token,picture.type(large){url},instagram_business_account{id,username,name,profile_picture_url}', limit: '100', access_token: token.accessToken })}`,
    );
    for (let page = 0; next && page < 10; page++) {
      const res: { data: { data: PageRow[]; paging?: { next?: string } } } = await api('meta', next, {}, metaAuthError);
      for (const p of res.data.data) {
        // Page tokens fetched with a long-lived user token do not expire.
        const pageToken = { accessToken: p.access_token, refreshToken: null, expiresAt: null, scopes: token.scopes ?? [] };
        out.push({ platform: 'facebook', externalId: p.id, handle: p.username ?? null, displayName: p.name, avatarUrl: p.picture?.data?.url ?? null, meta: {}, token: pageToken });
        const ig = p.instagram_business_account;
        if (ig) {
          out.push({ platform: 'instagram', externalId: ig.id, handle: ig.username ?? null, displayName: ig.name ?? ig.username ?? null, avatarUrl: ig.profile_picture_url ?? null, meta: { pageId: p.id, pageName: p.name }, token: pageToken });
        }
      }
      next = res.data.paging?.next ?? null;
    }
    if (!out.length) throw new PlatformError('meta', 404, 'No Facebook Pages were shared. Reconnect and select at least one Page (and its linked Instagram account).');
    return out;
  },
};

/* ---------------------------------- Instagram ---------------------------------- */

export const instagramPublisher: Publisher = {
  platform: 'instagram',
  async publish(ctx) {
    const igId = ctx.account.externalId;
    const isVideo = ctx.media.kind === 'video';
    if (!isVideo && !/jpe?g/.test(ctx.media.contentType)) throw new PlatformError('instagram', 400, 'Instagram: images must be JPEG.');
    const container = await metaPost<{ id: string }>(`/${igId}/media`, ctx.accessToken, {
      ...(isVideo
        ? { media_type: 'REELS', video_url: ctx.media.url, share_to_feed: ctx.options.shareToFeed !== false, ...(ctx.media.coverUrl ? { cover_url: ctx.media.coverUrl } : { thumb_offset: Number(ctx.options.thumbOffsetMs ?? 1000) }) }
        : { image_url: ctx.media.url }),
      caption: ctx.caption.slice(0, 2200),
    });
    return { status: 'processing', state: { containerId: container.id }, retryAfterS: isVideo ? 15 : 3 };
  },
  async check(ctx, state) {
    const containerId = String(state.containerId);
    const status = await metaGet<{ status_code?: string; status?: string }>(`/${containerId}`, ctx.accessToken, { fields: 'status_code,status' });
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new PlatformError('instagram', 422, `Instagram could not process the media: ${status.status ?? status.status_code}.`);
    }
    if (status.status_code !== 'FINISHED' && status.status_code !== 'PUBLISHED') return { status: 'processing', state, retryAfterS: 15 };
    const published = await metaPost<{ id: string }>(`/${ctx.account.externalId}/media_publish`, ctx.accessToken, { creation_id: containerId });
    const media = await metaGet<{ permalink?: string }>(`/${published.id}`, ctx.accessToken, { fields: 'permalink' }).catch(() => ({ permalink: undefined }));
    return { status: 'published', externalId: published.id, externalUrl: media.permalink ?? null };
  },
  async metrics({ accessToken }, mediaId) {
    const base = await metaGet<{ like_count?: number; comments_count?: number; media_product_type?: string }>(`/${mediaId}`, accessToken, { fields: 'like_count,comments_count,media_product_type' });
    const reel = base.media_product_type === 'REELS';
    const metrics = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', ...(reel ? ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'] : [])];
    const out = emptyMetrics({ media: base });
    out.likes = base.like_count ?? null;
    out.comments = base.comments_count ?? null;
    try {
      const insights = await metaGet<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`/${mediaId}/insights`, accessToken, { metric: metrics.join(',') });
      const get = (n: string) => {
        const row = insights.data.find((d) => d.name === n);
        return row ? (row.total_value?.value ?? row.values?.[0]?.value ?? null) : null;
      };
      out.views = get('views');
      out.impressions = get('reach');
      out.likes = get('likes') ?? out.likes;
      out.comments = get('comments') ?? out.comments;
      out.shares = get('shares');
      out.saves = get('saved');
      const totalMs = get('ig_reels_video_view_total_time');
      out.watchTimeS = totalMs != null ? totalMs / 1000 : null;
      out.raw.insights = insights.data;
    } catch {
      // Insights need instagram_manage_insights; basic counts are still useful.
    }
    return out;
  },
};

/* ---------------------------------- Facebook ---------------------------------- */

const isReelShape = (m: { width: number | null; height: number | null; durationS: number | null }) =>
  !!m.width && !!m.height && m.height > m.width * 1.5 && (m.durationS ?? 0) >= 3 && (m.durationS ?? 999) <= 90;

export const facebookPublisher: Publisher = {
  platform: 'facebook',
  async publish(ctx) {
    const pageId = ctx.account.externalId;
    if (ctx.media.kind === 'image') {
      const res = await metaPost<{ id: string; post_id?: string }>(`/${pageId}/photos`, ctx.accessToken, { url: ctx.media.url, caption: ctx.caption, published: true });
      const postId = res.post_id ?? res.id;
      return { status: 'published', externalId: postId, externalUrl: `https://www.facebook.com/${postId}` };
    }
    const asReel = ctx.options.format === 'reel' || (ctx.options.format !== 'video' && isReelShape(ctx.media));
    if (asReel) {
      const start = await metaPost<{ video_id: string; upload_url: string }>(`/${pageId}/video_reels`, ctx.accessToken, { upload_phase: 'start' });
      const up = await fetch(`https://rupload.facebook.com/video-upload/${env().META_GRAPH_VERSION}/${start.video_id}`, {
        method: 'POST',
        headers: { authorization: `OAuth ${ctx.accessToken}`, file_url: ctx.media.url },
      });
      if (!up.ok) throw new PlatformError('facebook', up.status, `Facebook: reel upload failed (${up.status}): ${(await up.text()).slice(0, 200)}`);
      // Wait for the transfer before finishing; Meta pulls the file from the signed URL.
      for (let i = 0; i < 20; i++) {
        const s = await metaGet<{ status?: { video_status?: string; uploading_phase?: { status?: string } } }>(`/${start.video_id}`, ctx.accessToken, { fields: 'status' });
        const phase = s.status?.uploading_phase?.status;
        if (phase === 'complete' || s.status?.video_status === 'upload_complete' || s.status?.video_status === 'ready' || s.status?.video_status === 'processing') break;
        if (s.status?.video_status === 'error' || s.status?.video_status === 'upload_failed') throw new PlatformError('facebook', 422, 'Facebook could not fetch the video.');
        await sleep(3000);
      }
      await metaPost(`/${pageId}/video_reels`, ctx.accessToken, {
        upload_phase: 'finish',
        video_id: start.video_id,
        video_state: 'PUBLISHED',
        description: ctx.caption,
        ...(ctx.title ? { title: ctx.title } : {}),
        is_ai_generated: ctx.aiGenerated,
      });
      return { status: 'processing', state: { videoId: start.video_id }, retryAfterS: 15, externalId: start.video_id };
    }
    const res = await metaPost<{ id: string }>(
      `/${pageId}/videos`,
      ctx.accessToken,
      { file_url: ctx.media.url, description: ctx.caption, ...(ctx.title ? { title: ctx.title } : {}), published: true },
      'video',
    );
    return { status: 'processing', state: { videoId: res.id }, retryAfterS: 20, externalId: res.id };
  },
  async check(ctx, state) {
    const videoId = String(state.videoId);
    const v = await metaGet<{ permalink_url?: string; status?: { video_status?: string; processing_phase?: { status?: string; error?: { message?: string } }; publishing_phase?: { status?: string; publish_status?: string; error?: { message?: string } } } }>(
      `/${videoId}`,
      ctx.accessToken,
      { fields: 'status,permalink_url' },
    );
    const s = v.status;
    if (s?.video_status === 'error' || s?.processing_phase?.status === 'error' || s?.publishing_phase?.status === 'error') {
      throw new PlatformError('facebook', 422, `Facebook could not publish the video: ${s?.publishing_phase?.error?.message ?? s?.processing_phase?.error?.message ?? 'processing error'}.`);
    }
    const done = s?.video_status === 'ready' && (s.publishing_phase?.status == null || s.publishing_phase.status === 'complete' || s.publishing_phase.publish_status === 'published');
    if (!done) return { status: 'processing', state, retryAfterS: 20, externalId: videoId };
    const url = v.permalink_url ? (v.permalink_url.startsWith('http') ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`) : null;
    return { status: 'published', externalId: videoId, externalUrl: url };
  },
  async metrics({ accessToken }, id): Promise<MetricsSnapshot | null> {
    const out = emptyMetrics();
    try {
      const v = await metaGet<Record<string, unknown>>(`/${id}`, accessToken, { fields: 'likes.summary(true).limit(0),comments.summary(true).limit(0)' });
      out.likes = num((v.likes as { summary?: { total_count?: number } } | undefined)?.summary?.total_count);
      out.comments = num((v.comments as { summary?: { total_count?: number } } | undefined)?.summary?.total_count);
      out.raw.object = v;
    } catch {
      // Photo posts and videos expose different edges.
    }
    try {
      const ins = await metaGet<{ data: { name: string; values?: { value: unknown }[] }[] }>(`/${id}/video_insights`, accessToken, { metric: 'total_video_views,total_video_impressions,total_video_avg_time_watched,total_video_view_total_time' });
      const get = (n: string) => num(ins.data.find((d) => d.name === n)?.values?.[0]?.value);
      out.views = get('total_video_views');
      out.impressions = get('total_video_impressions');
      const totalMs = get('total_video_view_total_time');
      out.watchTimeS = totalMs != null ? totalMs / 1000 : null;
      out.raw.insights = ins.data;
    } catch {
      // Not a video, or insights not available yet.
    }
    return out;
  },
};
