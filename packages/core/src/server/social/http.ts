import { open } from 'node:fs/promises';
import { AppError, isRecord, sleep } from '../../utils';
import type { TokenSet } from './types';

/** A platform API failure. `authExpired` tells the caller to reconnect the account. */
export class PlatformError extends AppError {
  readonly platform: string;
  readonly retryable: boolean;
  readonly authExpired: boolean;
  readonly httpStatus: number;

  constructor(platform: string, httpStatus: number, message: string, opts: { retryable?: boolean; authExpired?: boolean; details?: unknown } = {}) {
    super(opts.authExpired ? 'platform_auth_expired' : 'platform_error', message, httpStatus >= 500 || httpStatus === 429 ? 502 : 422, opts.details);
    this.platform = platform;
    this.httpStatus = httpStatus;
    this.retryable = opts.retryable ?? (httpStatus >= 500 || httpStatus === 429);
    this.authExpired = opts.authExpired ?? httpStatus === 401;
  }
}

/** Pulls a readable message out of the error shapes the platforms use. */
export function errorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return typeof body === 'string' && body ? body.slice(0, 400) : fallback;
  const err = body.error;
  if (isRecord(err)) {
    const parts = [err.error_user_msg, err.message, err.error_user_title].filter((p): p is string => typeof p === 'string' && !!p);
    if (parts.length) return parts[0]!;
  }
  if (typeof err === 'string') return typeof body.error_description === 'string' ? `${err}: ${body.error_description}` : err;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.errors) && isRecord(body.errors[0]) && typeof body.errors[0].message === 'string') return body.errors[0].message;
  if (typeof body.message === 'string') return body.message;
  if (typeof body.title === 'string') return body.title;
  return fallback;
}

export interface ApiInit {
  method?: string;
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string | number | boolean | undefined | null>;
  body?: NonNullable<RequestInit['body']>;
  /** Retries 429/5xx with backoff. Only for idempotent calls. */
  retries?: number;
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export async function api<T = unknown>(platform: string, url: string, init: ApiInit = {}, authCheck?: (status: number, body: unknown) => boolean): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  } else if (init.form) {
    headers.set('content-type', 'application/x-www-form-urlencoded');
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(init.form)) if (v != null) form.set(k, String(v));
    body = form.toString();
  }
  const attempts = (init.retries ?? 0) + 1;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, signal: AbortSignal.timeout(init.timeoutMs ?? 60_000) });
    } catch (err) {
      if (attempt < attempts) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new PlatformError(platform, 503, `Could not reach ${platform}: ${(err as Error).message}`, { retryable: true });
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // keep text
    }
    if (res.ok && !hasErrorBody(parsed)) return { data: parsed as T, status: res.status, headers: res.headers };
    const status = res.ok ? 400 : res.status;
    if ((status === 429 || status >= 500) && attempt < attempts) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    const authExpired = status === 401 || (authCheck?.(status, parsed) ?? false);
    throw new PlatformError(platform, status, `${platformLabel(platform)}: ${errorMessage(parsed, `request failed (${status})`)}`, { authExpired, details: parsed });
  }
}

/** Some APIs answer 200 with an error object; TikTok always sends `error.code: "ok"` on success. */
function hasErrorBody(body: unknown): boolean {
  if (!isRecord(body) || body.error == null) return false;
  const err = body.error;
  if (isRecord(err)) return !(err.code === 'ok' || (err.code == null && !err.message));
  return typeof err === 'string' && err.length > 0;
}

function platformLabel(p: string) {
  return { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', facebook: 'Facebook', meta: 'Meta', linkedin: 'LinkedIn', x: 'X', pinterest: 'Pinterest', ayrshare: 'Ayrshare', tiktok_ads: 'TikTok Ads' }[p] ?? p;
}

export async function readChunk(filePath: string, start: number, length: number): Promise<Buffer> {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Standard OAuth token response to a TokenSet. */
export function tokenSet(body: Record<string, unknown>, previous?: TokenSet): TokenSet {
  const access = body.access_token;
  if (typeof access !== 'string' || !access) throw new AppError('oauth_failed', 'The platform did not return an access token.', 502);
  const expiresIn = Number(body.expires_in);
  const scope = typeof body.scope === 'string' ? body.scope.split(/[\s,]+/).filter(Boolean) : previous?.scopes;
  return {
    accessToken: access,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : (previous?.refreshToken ?? null),
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    scopes: scope ?? [],
  };
}

export const basicAuth = (id: string, secret: string) => `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64')}`;

export const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
