import { createHmac, createPrivateKey, sign } from 'node:crypto';
import { AppError } from '../utils';
import { safeEqual } from './crypto';
import { env } from './env';

const API = 'https://api.mux.com/video/v1';

function auth(): string {
  const e = env();
  if (!e.MUX_TOKEN_ID || !e.MUX_TOKEN_SECRET) throw new AppError('mux_not_configured', 'Mux is not configured.', 501);
  return `Basic ${Buffer.from(`${e.MUX_TOKEN_ID}:${e.MUX_TOKEN_SECRET}`).toString('base64')}`;
}

async function mux<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: auth(), 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (!res.ok) throw new AppError('mux_error', `Mux error ${res.status}: ${(await res.text()).slice(0, 300)}`, 502);
  if (res.status === 204) return undefined as T;
  return ((await res.json()) as { data: T }).data;
}

export interface MuxAsset {
  id: string;
  status: 'preparing' | 'ready' | 'errored';
  playback_ids?: { id: string; policy: 'public' | 'signed' }[];
  duration?: number;
  aspect_ratio?: string;
  passthrough?: string;
  errors?: { messages?: string[] };
}

/** Mux pulls the file from a signed URL; signed playback keeps media private. */
export async function muxCreateAsset(url: string, passthrough: string): Promise<MuxAsset> {
  const signed = !!(env().MUX_SIGNING_KEY_ID && env().MUX_SIGNING_KEY_PRIVATE);
  return mux<MuxAsset>('/assets', {
    method: 'POST',
    body: JSON.stringify({
      inputs: [{ url }],
      playback_policies: [signed ? 'signed' : 'public'],
      video_quality: 'basic',
      passthrough,
    }),
  });
}

export const muxGetAsset = (id: string) => mux<MuxAsset>(`/assets/${encodeURIComponent(id)}`);
export const muxDeleteAsset = (id: string) => mux<void>(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);

type Audience = 'v' | 't' | 's' | 'g';

/** RS256 JWT for signed playback ids. */
export function muxToken(playbackId: string, aud: Audience, expiresInS = 3600, params: Record<string, string | number> = {}): string {
  const e = env();
  if (!e.MUX_SIGNING_KEY_ID || !e.MUX_SIGNING_KEY_PRIVATE) throw new AppError('mux_not_configured', 'Mux signing keys are not configured.', 501);
  const header = { alg: 'RS256', typ: 'JWT', kid: e.MUX_SIGNING_KEY_ID };
  const payload = { sub: playbackId, aud, exp: Math.floor(Date.now() / 1000) + expiresInS, kid: e.MUX_SIGNING_KEY_ID, ...params };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${b64(header)}.${b64(payload)}`;
  const pem = Buffer.from(e.MUX_SIGNING_KEY_PRIVATE, 'base64').toString('utf8');
  const signature = sign('RSA-SHA256', Buffer.from(data), createPrivateKey(pem)).toString('base64url');
  return `${data}.${signature}`;
}

export function muxPlayback(playbackId: string, policy: 'signed' | 'public') {
  if (policy === 'public') {
    return {
      hls: `https://stream.mux.com/${playbackId}.m3u8`,
      poster: `https://image.mux.com/${playbackId}/thumbnail.webp?time=1`,
      storyboard: `https://image.mux.com/${playbackId}/storyboard.vtt`,
    };
  }
  return {
    hls: `https://stream.mux.com/${playbackId}.m3u8?token=${muxToken(playbackId, 'v')}`,
    poster: `https://image.mux.com/${playbackId}/thumbnail.webp?token=${muxToken(playbackId, 't', 3600, { time: 1 })}`,
    storyboard: `https://image.mux.com/${playbackId}/storyboard.vtt?token=${muxToken(playbackId, 's')}`,
  };
}

/** Verifies the mux-signature header: t=timestamp,v1=hmac. */
export function verifyMuxWebhook(header: string | null, rawBody: string, toleranceS = 300): boolean {
  const secret = env().MUX_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceS || !parts.v1) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return safeEqual(expected, parts.v1);
}
