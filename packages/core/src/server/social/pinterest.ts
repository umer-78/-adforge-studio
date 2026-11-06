import { openAsBlob } from 'node:fs';
import { env } from '../env';
import { api, basicAuth, num, PlatformError, tokenSet } from './http';
import { emptyMetrics, type Connector, type Publisher } from './types';

const API = 'https://api.pinterest.com/v5';
const SCOPES = ['boards:read', 'boards:write', 'pins:read', 'pins:write', 'user_accounts:read'];

const clientAuth = () => basicAuth(env().PINTEREST_APP_ID!, env().PINTEREST_APP_SECRET!);
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export interface PinterestBoard {
  id: string;
  name: string;
  privacy?: string;
}

export async function pinterestBoards(token: string): Promise<PinterestBoard[]> {
  const out: PinterestBoard[] = [];
  let bookmark: string | null = null;
  for (let i = 0; i < 10; i++) {
    const qs: URLSearchParams = new URLSearchParams({ page_size: '100', ...(bookmark ? { bookmark } : {}) });
    const { data }: { data: { items: PinterestBoard[]; bookmark?: string | null } } = await api<{ items: PinterestBoard[]; bookmark?: string | null }>('pinterest', `${API}/boards?${qs}`, { headers: bearer(token) });
    out.push(...data.items.map((b) => ({ id: b.id, name: b.name, privacy: b.privacy })));
    bookmark = data.bookmark ?? null;
    if (!bookmark) break;
  }
  return out;
}

export const pinterestConnector: Connector = {
  id: 'pinterest',
  label: 'Pinterest',
  platforms: ['pinterest'],
  pkce: false,
  configured: () => !!(env().PINTEREST_APP_ID && env().PINTEREST_APP_SECRET),
  authorizeUrl({ state, redirectUri }) {
    const qs = new URLSearchParams({ client_id: env().PINTEREST_APP_ID!, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(','), state });
    return `https://www.pinterest.com/oauth/?${qs}`;
  },
  async exchange(code, redirectUri) {
    const { data } = await api<Record<string, unknown>>('pinterest', `${API}/oauth/token`, {
      headers: { authorization: clientAuth() },
      form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
    });
    return tokenSet(data);
  },
  async refresh(token) {
    if (!token.refreshToken) throw new PlatformError('pinterest', 401, 'Pinterest: reconnect the account to continue.', { authExpired: true });
    const { data } = await api<Record<string, unknown>>(
      'pinterest',
      `${API}/oauth/token`,
      { headers: { authorization: clientAuth() }, form: { grant_type: 'refresh_token', refresh_token: token.refreshToken } },
      (status) => status === 400,
    );
    return tokenSet(data, token);
  },
  async accounts(token) {
    const { data } = await api<{ id?: string; username: string; profile_image?: string; business_name?: string; account_type?: string }>('pinterest', `${API}/user_account`, { headers: bearer(token.accessToken) });
    const boards = await pinterestBoards(token.accessToken).catch(() => []);
    return [
      {
        platform: 'pinterest',
        externalId: data.id ?? data.username,
        handle: data.username,
        displayName: data.business_name ?? data.username,
        avatarUrl: data.profile_image ?? null,
        meta: { accountType: data.account_type ?? null, boards, defaultBoardId: boards[0]?.id ?? null },
        token,
      },
    ];
  },
};

export const pinterestPublisher: Publisher = {
  platform: 'pinterest',
  async publish(ctx) {
    const boardId = String(ctx.options.boardId ?? ctx.account.meta.defaultBoardId ?? '');
    if (!boardId) throw new PlatformError('pinterest', 400, 'Pinterest: pick a board for this pin in Settings → Social accounts.');
    const title = (ctx.title ?? ctx.caption.split('\n')[0] ?? '').slice(0, 100);
    if (ctx.items && ctx.items.length > 1) {
      if (ctx.items.some((m) => m.kind !== 'image')) throw new PlatformError('pinterest', 400, 'Pinterest: carousel pins take photos only.');
      const { data } = await api<{ id: string }>('pinterest', `${API}/pins`, {
        headers: bearer(ctx.accessToken),
        json: {
          board_id: boardId,
          title,
          description: ctx.caption.slice(0, 500),
          ...(ctx.link ? { link: ctx.link } : {}),
          media_source: { source_type: 'multiple_image_urls', items: ctx.items.map((m) => ({ url: m.url, ...(ctx.link ? { link: ctx.link } : {}) })) },
        },
      });
      return { status: 'published', externalId: data.id, externalUrl: `https://www.pinterest.com/pin/${data.id}/` };
    }
    if (ctx.media.kind === 'image') {
      const { data } = await api<{ id: string }>('pinterest', `${API}/pins`, {
        headers: bearer(ctx.accessToken),
        json: { board_id: boardId, title, description: ctx.caption.slice(0, 500), ...(ctx.link ? { link: ctx.link } : {}), media_source: { source_type: 'image_url', url: ctx.media.url } },
      });
      return { status: 'published', externalId: data.id, externalUrl: `https://www.pinterest.com/pin/${data.id}/` };
    }
    const reg = await api<{ media_id: string; upload_url: string; upload_parameters: Record<string, string> | { key: string; value: string }[] }>('pinterest', `${API}/media`, {
      headers: bearer(ctx.accessToken),
      json: { media_type: 'video' },
    });
    const form = new FormData();
    const params = reg.data.upload_parameters;
    for (const [k, v] of Array.isArray(params) ? params.map((p) => [p.key, p.value] as const) : Object.entries(params)) form.set(k, v);
    form.set('file', await openAsBlob(ctx.media.filePath, { type: ctx.media.contentType || 'video/mp4' }), 'video.mp4');
    const up = await fetch(reg.data.upload_url, { method: 'POST', body: form });
    if (!up.ok) throw new PlatformError('pinterest', up.status, `Pinterest: video upload failed (${up.status}).`, { retryable: up.status >= 500 });
    return { status: 'processing', state: { mediaId: reg.data.media_id, boardId, title }, retryAfterS: 10 };
  },
  async check(ctx, state) {
    const mediaId = String(state.mediaId);
    const { data } = await api<{ status: 'registered' | 'processing' | 'succeeded' | 'failed' }>('pinterest', `${API}/media/${encodeURIComponent(mediaId)}`, { headers: bearer(ctx.accessToken), retries: 2 });
    if (data.status === 'failed') throw new PlatformError('pinterest', 422, 'Pinterest could not process the video.');
    if (data.status !== 'succeeded') return { status: 'processing', state, retryAfterS: 15 };
    if (!ctx.media.coverUrl) throw new PlatformError('pinterest', 400, 'Pinterest needs a cover image for video pins.');
    const { data: pin } = await api<{ id: string }>('pinterest', `${API}/pins`, {
      headers: bearer(ctx.accessToken),
      json: {
        board_id: String(state.boardId),
        title: String(state.title ?? ''),
        description: ctx.caption.slice(0, 500),
        ...(ctx.link ? { link: ctx.link } : {}),
        media_source: { source_type: 'video_id', media_id: mediaId, cover_image_url: ctx.media.coverUrl },
      },
    });
    return { status: 'published', externalId: pin.id, externalUrl: `https://www.pinterest.com/pin/${pin.id}/` };
  },
  async metrics({ accessToken }, pinId) {
    const end = new Date();
    const start = new Date(end.getTime() - 89 * 86400_000);
    const qs = new URLSearchParams({
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      metric_types: 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,VIDEO_MRC_VIEW,VIDEO_AVG_WATCH_TIME,TOTAL_COMMENTS,TOTAL_REACTIONS',
    });
    try {
      const { data } = await api<{ all?: { summary_metrics?: Record<string, number>; lifetime_metrics?: Record<string, number> } }>('pinterest', `${API}/pins/${encodeURIComponent(pinId)}/analytics?${qs}`, { headers: bearer(accessToken) });
      const m = data.all?.lifetime_metrics ?? data.all?.summary_metrics;
      if (!m) return null;
      const out = emptyMetrics(data as Record<string, unknown>);
      out.impressions = num(m.IMPRESSION);
      out.views = num(m.VIDEO_MRC_VIEW) ?? out.impressions;
      out.saves = num(m.SAVE);
      out.clicks = (num(m.PIN_CLICK) ?? 0) + (num(m.OUTBOUND_CLICK) ?? 0);
      out.likes = num(m.TOTAL_REACTIONS);
      out.comments = num(m.TOTAL_COMMENTS);
      out.ctr = out.impressions ? (out.clicks ?? 0) / out.impressions : null;
      return out;
    } catch {
      return null;
    }
  },
};
