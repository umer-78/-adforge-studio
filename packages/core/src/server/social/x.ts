import { env } from '../env';
import { api, basicAuth, num, PlatformError, readChunk, tokenSet } from './http';
import { emptyMetrics, type Connector, type Publisher } from './types';

const API = 'https://api.x.com/2';
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'];
const SEGMENT = 4 * 1024 ** 2;

const clientAuth = () => basicAuth(env().X_CLIENT_ID!, env().X_CLIENT_SECRET!);
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export const xConnector: Connector = {
  id: 'x',
  label: 'X',
  platforms: ['x'],
  pkce: true,
  configured: () => !!(env().X_CLIENT_ID && env().X_CLIENT_SECRET),
  authorizeUrl({ state, redirectUri, codeChallenge }) {
    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: env().X_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      state,
      code_challenge: codeChallenge ?? '',
      code_challenge_method: 'S256',
    });
    return `https://x.com/i/oauth2/authorize?${qs}`;
  },
  async exchange(code, redirectUri, verifier) {
    const { data } = await api<Record<string, unknown>>('x', `${API}/oauth2/token`, {
      headers: { authorization: clientAuth() },
      form: { code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: verifier ?? '', client_id: env().X_CLIENT_ID },
    });
    return tokenSet(data);
  },
  async refresh(token) {
    if (!token.refreshToken) throw new PlatformError('x', 401, 'X: reconnect the account to continue.', { authExpired: true });
    const { data } = await api<Record<string, unknown>>(
      'x',
      `${API}/oauth2/token`,
      { headers: { authorization: clientAuth() }, form: { grant_type: 'refresh_token', refresh_token: token.refreshToken, client_id: env().X_CLIENT_ID } },
      (status) => status === 400,
    );
    return tokenSet(data, token);
  },
  async accounts(token) {
    const { data } = await api<{ data: { id: string; name: string; username: string; profile_image_url?: string; verified_type?: string } }>(
      'x',
      `${API}/users/me?user.fields=profile_image_url,verified_type`,
      { headers: bearer(token.accessToken) },
    );
    const u = data.data;
    return [{ platform: 'x', externalId: u.id, handle: u.username, displayName: u.name, avatarUrl: u.profile_image_url ?? null, meta: { verifiedType: u.verified_type ?? null, maxChars: u.verified_type && u.verified_type !== 'none' ? 25_000 : 280 }, token }];
  },
};

type ProcessingInfo = { state: 'pending' | 'in_progress' | 'succeeded' | 'failed'; check_after_secs?: number; error?: { message?: string } };

async function postTweet(token: string, text: string, mediaId: string, handle: string | null) {
  const { data } = await api<{ data: { id: string } }>('x', `${API}/tweets`, { headers: bearer(token), json: { text, media: { media_ids: [mediaId] } } });
  return { status: 'published' as const, externalId: data.data.id, externalUrl: `https://x.com/${handle ?? 'i'}/status/${data.data.id}` };
}

export const xPublisher: Publisher = {
  platform: 'x',
  async publish(ctx) {
    const isVideo = ctx.media.kind === 'video';
    const init = await api<{ data: { id: string } }>('x', `${API}/media/upload/initialize`, {
      headers: bearer(ctx.accessToken),
      json: { media_type: ctx.media.contentType, total_bytes: ctx.media.sizeBytes, media_category: isVideo ? 'tweet_video' : 'tweet_image' },
    });
    const mediaId = init.data.data.id;
    for (let offset = 0, index = 0; offset < ctx.media.sizeBytes; offset += SEGMENT, index++) {
      const chunk = await readChunk(ctx.media.filePath, offset, Math.min(SEGMENT, ctx.media.sizeBytes - offset));
      const form = new FormData();
      form.set('segment_index', String(index));
      form.set('media', new Blob([new Uint8Array(chunk)]), 'chunk');
      await api('x', `${API}/media/upload/${mediaId}/append`, { headers: bearer(ctx.accessToken), body: form, method: 'POST', retries: 2 });
    }
    const fin = await api<{ data: { id: string; processing_info?: ProcessingInfo } }>('x', `${API}/media/upload/${mediaId}/finalize`, { headers: bearer(ctx.accessToken), method: 'POST' });
    const info = fin.data.data.processing_info;
    const text = ctx.caption.slice(0, Number(ctx.account.meta.maxChars ?? 280));
    if (info && info.state !== 'succeeded') return { status: 'processing', state: { mediaId, text }, retryAfterS: Math.max(info.check_after_secs ?? 5, 2) };
    return postTweet(ctx.accessToken, text, mediaId, ctx.account.handle);
  },
  async check(ctx, state) {
    const mediaId = String(state.mediaId);
    const { data } = await api<{ data: { processing_info?: ProcessingInfo } }>('x', `${API}/media/upload?media_id=${encodeURIComponent(mediaId)}&command=STATUS`, { headers: bearer(ctx.accessToken), retries: 2 });
    const info = data.data.processing_info;
    if (info?.state === 'failed') throw new PlatformError('x', 422, `X could not process the media: ${info.error?.message ?? 'unknown error'}.`);
    if (info && info.state !== 'succeeded') return { status: 'processing', state, retryAfterS: Math.max(info.check_after_secs ?? 5, 2) };
    return postTweet(ctx.accessToken, String(state.text), mediaId, ctx.account.handle);
  },
  async metrics({ accessToken }, tweetId) {
    const { data } = await api<{ data?: { public_metrics?: Record<string, number>; non_public_metrics?: Record<string, number>; organic_metrics?: Record<string, number> } }>(
      'x',
      `${API}/tweets/${encodeURIComponent(tweetId)}?tweet.fields=public_metrics,non_public_metrics,organic_metrics`,
      { headers: bearer(accessToken) },
    ).catch(() => api<{ data?: { public_metrics?: Record<string, number> } }>('x', `${API}/tweets/${encodeURIComponent(tweetId)}?tweet.fields=public_metrics`, { headers: bearer(accessToken) }));
    const m = data.data?.public_metrics;
    if (!m) return null;
    const np = (data.data as { non_public_metrics?: Record<string, number> }).non_public_metrics;
    const out = emptyMetrics(data.data as Record<string, unknown>);
    out.views = num(m.impression_count);
    out.impressions = num(m.impression_count);
    out.likes = num(m.like_count);
    out.comments = num(m.reply_count);
    out.shares = (num(m.retweet_count) ?? 0) + (num(m.quote_count) ?? 0);
    out.saves = num(m.bookmark_count);
    out.clicks = num(np?.url_link_clicks ?? np?.user_profile_clicks);
    return out;
  },
};
