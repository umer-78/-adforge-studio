import { env } from '../env';
import { api, num, PlatformError, readChunk, tokenSet } from './http';
import { emptyMetrics, type Connector, type Publisher } from './types';

const BASE = 'https://open.tiktokapis.com/v2';
const SCOPES = ['user.info.basic', 'user.info.profile', 'video.publish', 'video.list'];
const MIN_CHUNK = 5 * 1024 ** 2;
const CHUNK = 10 * 1024 ** 2;

type TikTokEnvelope<T> = { data: T; error: { code: string; message: string; log_id?: string } };

const isAuthError = (_status: number, body: unknown) => /access_token_invalid|scope_not_authorized|token_expired|invalid_grant/.test(JSON.stringify(body ?? ''));

async function call<T>(path: string, token: string, json?: unknown): Promise<T> {
  const { data } = await api<TikTokEnvelope<T>>('tiktok', `${BASE}${path}`, { method: json === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' }, ...(json !== undefined ? { json } : {}) }, isAuthError);
  return data.data;
}

export const tiktokConnector: Connector = {
  id: 'tiktok',
  label: 'TikTok',
  platforms: ['tiktok'],
  pkce: false,
  configured: () => !!(env().TIKTOK_CLIENT_KEY && env().TIKTOK_CLIENT_SECRET),
  authorizeUrl({ state, redirectUri }) {
    const qs = new URLSearchParams({ client_key: env().TIKTOK_CLIENT_KEY!, response_type: 'code', scope: SCOPES.join(','), redirect_uri: redirectUri, state });
    return `https://www.tiktok.com/v2/auth/authorize/?${qs}`;
  },
  async exchange(code, redirectUri) {
    const { data } = await api<Record<string, unknown>>('tiktok', `${BASE}/oauth/token/`, {
      form: { client_key: env().TIKTOK_CLIENT_KEY, client_secret: env().TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirectUri },
    });
    return { ...tokenSet(data), scopes: String(data.scope ?? '').split(',').filter(Boolean) };
  },
  async refresh(token) {
    if (!token.refreshToken) throw new PlatformError('tiktok', 401, 'TikTok: reconnect the account to continue.', { authExpired: true });
    const { data } = await api<Record<string, unknown>>(
      'tiktok',
      `${BASE}/oauth/token/`,
      { form: { client_key: env().TIKTOK_CLIENT_KEY, client_secret: env().TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: token.refreshToken } },
      isAuthError,
    );
    return tokenSet(data, token);
  },
  async accounts(token) {
    const res = await call<{ user: { open_id: string; union_id?: string; avatar_url?: string; display_name?: string; username?: string } }>(
      '/user/info/?fields=open_id,union_id,avatar_url,display_name,username',
      token.accessToken,
    );
    const u = res.user;
    return [{ platform: 'tiktok', externalId: u.open_id, handle: u.username ?? null, displayName: u.display_name ?? null, avatarUrl: u.avatar_url ?? null, meta: { unionId: u.union_id ?? null }, token }];
  },
};

export interface TikTokCreatorInfo {
  creator_username: string;
  creator_nickname: string;
  creator_avatar_url: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

/** Required before every post: the privacy options the creator may pick from right now. */
export const tiktokCreatorInfo = (token: string) => call<TikTokCreatorInfo>('/post/publish/creator_info/query/', token, {});

function chunkPlan(size: number) {
  if (size <= MIN_CHUNK) return { chunkSize: size, count: 1 };
  const count = Math.max(1, Math.floor(size / CHUNK));
  return { chunkSize: CHUNK, count };
}

export const tiktokPublisher: Publisher = {
  platform: 'tiktok',
  async publish(ctx) {
    const info = await tiktokCreatorInfo(ctx.accessToken);
    const requested = typeof ctx.options.privacyLevel === 'string' ? ctx.options.privacyLevel : null;
    const privacy = requested && info.privacy_level_options.includes(requested) ? requested : info.privacy_level_options.includes('SELF_ONLY') ? 'SELF_ONLY' : info.privacy_level_options[0];
    if (!privacy) throw new PlatformError('tiktok', 403, 'TikTok: this account cannot post right now.');
    const brand = {
      brand_content_toggle: ctx.options.brandedContent === true,
      brand_organic_toggle: ctx.options.yourBrand === true,
    };

    if (ctx.media.kind === 'image') {
      const res = await call<{ publish_id: string }>('/post/publish/content/init/', ctx.accessToken, {
        media_type: 'PHOTO',
        post_mode: 'DIRECT_POST',
        post_info: { title: (ctx.title ?? '').slice(0, 90), description: ctx.caption.slice(0, 4000), privacy_level: privacy, disable_comment: ctx.options.disableComment === true, auto_add_music: true, ...brand },
        source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [ctx.media.url] },
      });
      return { status: 'processing', state: { publishId: res.publish_id }, retryAfterS: 10, externalId: res.publish_id };
    }

    if (ctx.media.durationS && ctx.media.durationS > info.max_video_post_duration_sec) {
      throw new PlatformError('tiktok', 400, `TikTok: this account can post videos up to ${info.max_video_post_duration_sec}s.`);
    }
    const { chunkSize, count } = chunkPlan(ctx.media.sizeBytes);
    const init = await call<{ publish_id: string; upload_url: string }>('/post/publish/video/init/', ctx.accessToken, {
      post_info: {
        title: ctx.caption.slice(0, 2200),
        privacy_level: privacy,
        disable_duet: ctx.options.disableDuet === true || info.duet_disabled,
        disable_comment: ctx.options.disableComment === true || info.comment_disabled,
        disable_stitch: ctx.options.disableStitch === true || info.stitch_disabled,
        video_cover_timestamp_ms: Number(ctx.options.coverTimestampMs ?? 1000),
        is_aigc: ctx.aiGenerated,
        ...brand,
      },
      source_info: { source: 'FILE_UPLOAD', video_size: ctx.media.sizeBytes, chunk_size: chunkSize, total_chunk_count: count },
    });
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? ctx.media.sizeBytes - 1 : start + chunkSize - 1;
      const chunk = await readChunk(ctx.media.filePath, start, end - start + 1);
      const res = await fetch(init.upload_url, {
        method: 'PUT',
        headers: { 'content-type': ctx.media.contentType || 'video/mp4', 'content-length': String(chunk.length), 'content-range': `bytes ${start}-${end}/${ctx.media.sizeBytes}` },
        body: new Uint8Array(chunk),
      });
      if (!res.ok && res.status !== 206) throw new PlatformError('tiktok', res.status, `TikTok: upload failed (${res.status}).`, { retryable: res.status >= 500 });
    }
    return { status: 'processing', state: { publishId: init.publish_id }, retryAfterS: 15, externalId: init.publish_id };
  },
  async check(ctx, state) {
    const publishId = String(state.publishId);
    const res = await call<{ status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>('/post/publish/status/fetch/', ctx.accessToken, { publish_id: publishId });
    if (res.status === 'FAILED') throw new PlatformError('tiktok', 422, `TikTok rejected the post: ${res.fail_reason ?? 'unknown reason'}.`);
    if (res.status === 'PUBLISH_COMPLETE') {
      const postId = res.publicaly_available_post_id?.[0];
      const handle = ctx.account.handle;
      return { status: 'published', externalId: postId ? String(postId) : publishId, externalUrl: postId && handle ? `https://www.tiktok.com/@${handle}/video/${postId}` : null };
    }
    if (res.status === 'SEND_TO_USER_INBOX') return { status: 'published', externalId: publishId, externalUrl: null };
    return { status: 'processing', state, retryAfterS: 20, externalId: publishId };
  },
  async metrics({ accessToken }, videoId) {
    if (!/^\d+$/.test(videoId)) return null;
    const res = await call<{ videos?: Record<string, unknown>[] }>('/video/query/?fields=id,view_count,like_count,comment_count,share_count,share_url', accessToken, { filters: { video_ids: [videoId] } });
    const v = res.videos?.[0];
    if (!v) return null;
    const out = emptyMetrics(v);
    out.views = num(v.view_count);
    out.likes = num(v.like_count);
    out.comments = num(v.comment_count);
    out.shares = num(v.share_count);
    return out;
  },
};
