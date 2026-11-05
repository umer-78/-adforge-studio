import { sleep } from '../../utils';
import { env } from '../env';
import { api, num, PlatformError, readChunk, tokenSet } from './http';
import { emptyMetrics, type Connector, type Publisher } from './types';

const REST = 'https://api.linkedin.com/rest';
const SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

function headers(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'linkedin-version': env().LINKEDIN_API_VERSION, 'x-restli-protocol-version': '2.0.0' };
}

/**
 * Posts use LinkedIn's "little text" format: reserved characters must be escaped, and hashtags
 * are written as templates so they stay clickable.
 */
export function linkedinCommentary(text: string): string {
  const escaped = text.replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`);
  return escaped.replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, (_m, pre: string, tag: string) => `${pre}{hashtag|\\#|${tag}}`);
}

export const linkedinConnector: Connector = {
  id: 'linkedin',
  label: 'LinkedIn',
  platforms: ['linkedin'],
  pkce: false,
  configured: () => !!(env().LINKEDIN_CLIENT_ID && env().LINKEDIN_CLIENT_SECRET),
  authorizeUrl({ state, redirectUri }) {
    const qs = new URLSearchParams({ response_type: 'code', client_id: env().LINKEDIN_CLIENT_ID!, redirect_uri: redirectUri, state, scope: SCOPES.join(' ') });
    return `https://www.linkedin.com/oauth/v2/authorization?${qs}`;
  },
  async exchange(code, redirectUri) {
    const { data } = await api<Record<string, unknown>>('linkedin', 'https://www.linkedin.com/oauth/v2/accessToken', {
      form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: env().LINKEDIN_CLIENT_ID, client_secret: env().LINKEDIN_CLIENT_SECRET },
    });
    return tokenSet(data);
  },
  async refresh(token) {
    // Refresh tokens are only issued to approved partner apps; others reconnect every 60 days.
    if (!token.refreshToken) throw new PlatformError('linkedin', 401, 'LinkedIn: the connection expired. Reconnect your account.', { authExpired: true });
    const { data } = await api<Record<string, unknown>>('linkedin', 'https://www.linkedin.com/oauth/v2/accessToken', {
      form: { grant_type: 'refresh_token', refresh_token: token.refreshToken, client_id: env().LINKEDIN_CLIENT_ID, client_secret: env().LINKEDIN_CLIENT_SECRET },
    });
    return tokenSet(data, token);
  },
  async accounts(token) {
    const { data } = await api<{ sub: string; name?: string; picture?: string; email?: string }>('linkedin', 'https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${token.accessToken}` } });
    return [{ platform: 'linkedin', externalId: data.sub, handle: data.email ?? null, displayName: data.name ?? null, avatarUrl: data.picture ?? null, meta: { authorUrn: `urn:li:person:${data.sub}` }, token }];
  },
};

async function uploadVideo(token: string, owner: string, filePath: string, size: number): Promise<string> {
  const { data } = await api<{ value: { video: string; uploadToken?: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } }>(
    'linkedin',
    `${REST}/videos?action=initializeUpload`,
    { headers: headers(token), json: { initializeUploadRequest: { owner, fileSizeBytes: size, uploadCaptions: false, uploadThumbnail: false } } },
  );
  const etags: string[] = [];
  for (const part of data.value.uploadInstructions) {
    const chunk = await readChunk(filePath, part.firstByte, part.lastByte - part.firstByte + 1);
    const res = await fetch(part.uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array(chunk) });
    if (!res.ok) throw new PlatformError('linkedin', res.status, `LinkedIn: video upload failed (${res.status}).`, { retryable: res.status >= 500 });
    const etag = res.headers.get('etag');
    if (!etag) throw new PlatformError('linkedin', 502, 'LinkedIn: upload part returned no ETag.');
    etags.push(etag);
  }
  await api('linkedin', `${REST}/videos?action=finalizeUpload`, {
    headers: headers(token),
    json: { finalizeUploadRequest: { video: data.value.video, uploadToken: data.value.uploadToken ?? '', uploadedPartIds: etags } },
  });
  return data.value.video;
}

async function uploadImage(token: string, owner: string, filePath: string, size: number, contentType: string): Promise<string> {
  const { data } = await api<{ value: { uploadUrl: string; image: string } }>('linkedin', `${REST}/images?action=initializeUpload`, {
    headers: headers(token),
    json: { initializeUploadRequest: { owner } },
  });
  const bytes = await readChunk(filePath, 0, size);
  const res = await fetch(data.value.uploadUrl, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, body: new Uint8Array(bytes) });
  if (!res.ok) throw new PlatformError('linkedin', res.status, `LinkedIn: image upload failed (${res.status}).`);
  return data.value.image;
}

async function createPost(token: string, author: string, commentary: string, mediaUrn: string, title: string | null) {
  const res = await api<unknown>('linkedin', `${REST}/posts`, {
    headers: headers(token),
    json: {
      author,
      commentary: linkedinCommentary(commentary).slice(0, 3000),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: mediaUrn, ...(title ? { title: title.slice(0, 200) } : {}) } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    },
  });
  const urn = res.headers.get('x-restli-id');
  if (!urn) throw new PlatformError('linkedin', 502, 'LinkedIn did not return the post id.');
  return { status: 'published' as const, externalId: urn, externalUrl: `https://www.linkedin.com/feed/update/${urn}/` };
}

export const linkedinPublisher: Publisher = {
  platform: 'linkedin',
  async publish(ctx) {
    const author = String(ctx.account.meta.authorUrn ?? `urn:li:person:${ctx.account.externalId}`);
    if (ctx.media.kind === 'image') {
      const image = await uploadImage(ctx.accessToken, author, ctx.media.filePath, ctx.media.sizeBytes, ctx.media.contentType);
      return createPost(ctx.accessToken, author, ctx.caption, image, ctx.title);
    }
    const video = await uploadVideo(ctx.accessToken, author, ctx.media.filePath, ctx.media.sizeBytes);
    return { status: 'processing', state: { video, author }, retryAfterS: 10 };
  },
  async check(ctx, state) {
    const video = String(state.video);
    const { data } = await api<{ status?: string; processingFailureReason?: string }>('linkedin', `${REST}/videos/${encodeURIComponent(video)}`, { headers: headers(ctx.accessToken), retries: 2 });
    if (data.status === 'PROCESSING_FAILED') throw new PlatformError('linkedin', 422, `LinkedIn could not process the video: ${data.processingFailureReason ?? 'unknown reason'}.`);
    if (data.status !== 'AVAILABLE') return { status: 'processing', state, retryAfterS: 15 };
    await sleep(500);
    return createPost(ctx.accessToken, String(state.author), ctx.caption, video, ctx.title);
  },
  async metrics({ accessToken }, urn) {
    try {
      const { data } = await api<{ likesSummary?: { totalLikes?: number }; commentsSummary?: { aggregatedTotalComments?: number; totalFirstLevelComments?: number } }>(
        'linkedin',
        `${REST}/socialActions/${encodeURIComponent(urn)}`,
        { headers: headers(accessToken) },
      );
      const out = emptyMetrics(data as Record<string, unknown>);
      out.likes = num(data.likesSummary?.totalLikes);
      out.comments = num(data.commentsSummary?.aggregatedTotalComments ?? data.commentsSummary?.totalFirstLevelComments);
      return out;
    } catch {
      // Member post analytics need extra LinkedIn permissions.
      return null;
    }
  },
};
