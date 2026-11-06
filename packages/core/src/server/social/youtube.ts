import { env } from '../env';
import { api, num, PlatformError, readChunk, tokenSet } from './http';
import { emptyMetrics, type Connector, type Publisher } from './types';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  // Posting the first comment under an upload.
  'https://www.googleapis.com/auth/youtube.force-ssl',
];
const CHUNK = 32 * 256 * 1024; // 8 MB, a multiple of 256 KB as resumable uploads require

export const youtubeConnector: Connector = {
  id: 'youtube',
  label: 'YouTube',
  platforms: ['youtube'],
  pkce: true,
  configured: () => !!(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET),
  authorizeUrl({ state, redirectUri, codeChallenge }) {
    const qs = new URLSearchParams({
      client_id: env().GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: 'S256' } : {}),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
  },
  async exchange(code, redirectUri, verifier) {
    const { data } = await api<Record<string, unknown>>('youtube', 'https://oauth2.googleapis.com/token', {
      form: { code, client_id: env().GOOGLE_CLIENT_ID, client_secret: env().GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier ?? undefined },
    });
    return tokenSet(data);
  },
  async refresh(token) {
    if (!token.refreshToken) throw new PlatformError('youtube', 401, 'YouTube: reconnect the channel to continue.', { authExpired: true });
    const { data } = await api<Record<string, unknown>>(
      'youtube',
      'https://oauth2.googleapis.com/token',
      { form: { client_id: env().GOOGLE_CLIENT_ID, client_secret: env().GOOGLE_CLIENT_SECRET, refresh_token: token.refreshToken, grant_type: 'refresh_token' } },
      (status, body) => status === 400 && JSON.stringify(body).includes('invalid_grant'),
    );
    return tokenSet(data, token);
  },
  async accounts(token) {
    const { data } = await api<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: Record<string, { url: string }> }; statistics?: Record<string, string> }[] }>(
      'youtube',
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      { headers: { authorization: `Bearer ${token.accessToken}` } },
    );
    if (!data.items?.length) throw new PlatformError('youtube', 404, 'YouTube: this Google account has no channel. Create one on YouTube first.');
    return data.items.map((c) => ({
      platform: 'youtube' as const,
      externalId: c.id,
      handle: c.snippet.customUrl ?? null,
      displayName: c.snippet.title,
      avatarUrl: c.snippet.thumbnails?.high?.url ?? c.snippet.thumbnails?.default?.url ?? null,
      meta: { subscribers: num(c.statistics?.subscriberCount) },
      token,
    }));
  },
};

const clean = (s: string) => s.replace(/[<>]/g, '');

export const youtubePublisher: Publisher = {
  platform: 'youtube',
  async publish(ctx) {
    if (ctx.media.kind !== 'video') throw new PlatformError('youtube', 400, 'YouTube only accepts videos.');
    const isShort = (ctx.media.height ?? 0) >= (ctx.media.width ?? 0) && (ctx.media.durationS ?? 999) <= 180;
    const privacy = String(ctx.options.privacy ?? 'public');
    const publishAt = typeof ctx.options.publishAt === 'string' ? ctx.options.publishAt : null;
    const tags: string[] = [];
    let tagChars = 0;
    for (const t of ctx.hashtags.map((h) => h.replace(/^#/, ''))) {
      if (tagChars + t.length + 2 > 480) break;
      tags.push(t);
      tagChars += t.length + 2;
    }
    const resource = {
      snippet: {
        title: clean(ctx.title?.trim() || ctx.caption.split('\n')[0] || 'New video').slice(0, 100),
        description: clean(ctx.caption).slice(0, 5000),
        tags,
        categoryId: String(ctx.options.categoryId ?? '22'),
      },
      status: {
        privacyStatus: publishAt ? 'private' : privacy,
        ...(publishAt ? { publishAt } : {}),
        selfDeclaredMadeForKids: ctx.options.madeForKids === true,
        containsSyntheticMedia: ctx.aiGenerated,
      },
    };
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ctx.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-length': String(ctx.media.sizeBytes),
        'x-upload-content-type': ctx.media.contentType,
      },
      body: JSON.stringify(resource),
    });
    if (!init.ok) {
      const body = await init.json().catch(() => null);
      throw new PlatformError('youtube', init.status, `YouTube: ${(body as { error?: { message?: string } } | null)?.error?.message ?? `upload could not start (${init.status})`}`, { details: body });
    }
    const uploadUrl = init.headers.get('location');
    if (!uploadUrl) throw new PlatformError('youtube', 502, 'YouTube did not return an upload URL.');

    let offset = 0;
    let video: { id?: string } | null = null;
    while (offset < ctx.media.sizeBytes) {
      const chunk = await readChunk(ctx.media.filePath, offset, Math.min(CHUNK, ctx.media.sizeBytes - offset));
      const end = offset + chunk.length - 1;
      let res: Response | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        res = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { authorization: `Bearer ${ctx.accessToken}`, 'content-length': String(chunk.length), 'content-range': `bytes ${offset}-${end}/${ctx.media.sizeBytes}` },
          body: new Uint8Array(chunk),
        }).catch(() => null);
        if (res && res.status < 500) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
      if (!res) throw new PlatformError('youtube', 503, 'YouTube upload was interrupted.', { retryable: true });
      if (res.status === 308) {
        const range = res.headers.get('range');
        offset = range ? Number(range.split('-')[1]) + 1 : offset + chunk.length;
        continue;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new PlatformError('youtube', res.status, `YouTube: ${(body as { error?: { message?: string } } | null)?.error?.message ?? `upload failed (${res.status})`}`, { details: body });
      }
      video = (await res.json()) as { id?: string };
      break;
    }
    if (!video?.id) throw new PlatformError('youtube', 502, 'YouTube did not confirm the upload.');
    return { status: 'published', externalId: video.id, externalUrl: isShort ? `https://www.youtube.com/shorts/${video.id}` : `https://www.youtube.com/watch?v=${video.id}` };
  },
  async comment({ accessToken }, videoId, text) {
    const { data } = await api<{ id?: string }>('youtube', 'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
      headers: { authorization: `Bearer ${accessToken}` },
      json: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text.slice(0, 10_000) } } } },
    });
    return { id: data.id ?? null };
  },
  async metrics({ accessToken }, videoId) {
    const auth = { authorization: `Bearer ${accessToken}` };
    const { data } = await api<{ items?: { statistics?: Record<string, string> }[] }>('youtube', `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}`, { headers: auth, retries: 2 });
    const stats = data.items?.[0]?.statistics;
    if (!stats) return null;
    const out = emptyMetrics({ statistics: stats });
    out.views = num(stats.viewCount);
    out.likes = num(stats.likeCount);
    out.comments = num(stats.commentCount);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: report } = await api<{ columnHeaders?: { name: string }[]; rows?: number[][] }>(
        'youtube',
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=2015-01-01&endDate=${today}&metrics=views,estimatedMinutesWatched,shares,likes,comments&filters=video==${encodeURIComponent(videoId)}`,
        { headers: auth },
      );
      const row = report.rows?.[0];
      if (row && report.columnHeaders) {
        const get = (name: string) => row[report.columnHeaders!.findIndex((h) => h.name === name)] ?? null;
        out.watchTimeS = get('estimatedMinutesWatched') != null ? Number(get('estimatedMinutesWatched')) * 60 : null;
        out.shares = get('shares');
        out.raw.analytics = report;
      }
    } catch {
      // Analytics scope may be missing on older connections; public statistics are enough.
    }
    return out;
  },
};
