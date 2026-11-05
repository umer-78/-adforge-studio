import { AppError } from '../../utils';
import { env } from '../env';

/** Agnes AI (agnes-ai.com): OpenAI-style image endpoint and async video tasks. */
const base = () => env().AGNES_BASE_URL.replace(/\/+$/, '');
const origin = () => new URL(base()).origin;

function mapAgnesError(status: number, body: unknown): AppError {
  const b = body as { error?: { message?: string } | string; message?: string; detail?: string } | null;
  const message = (typeof b?.error === 'string' ? b.error : b?.error?.message) ?? b?.message ?? b?.detail ?? `HTTP ${status}`;
  if (status === 401 || status === 403) return new AppError('provider_auth', 'The Agnes API key was rejected. Check Settings → Providers.', 401);
  if (status === 400 || status === 422) return new AppError('provider_invalid_input', `Agnes rejected the request: ${message}`, 422);
  if (status === 429) return new AppError('provider_rate_limited', 'Agnes is rate limiting requests (video allows about 1 request per minute on the free plan). Try again shortly.', 429);
  return new AppError('provider_unavailable', `Agnes error: ${message}`, status >= 500 ? 502 : status);
}

async function call<T>(apiKey: string, url: string, init: { method: 'GET' | 'POST'; body?: unknown; timeoutMs: number }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: { authorization: `Bearer ${apiKey}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs),
    });
  } catch (err) {
    const name = (err as Error).name;
    throw new AppError(name === 'TimeoutError' ? 'fetch_timeout' : 'fetch_failed', `Could not reach Agnes: ${(err as Error).message}`, 504);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 300) };
  }
  if (!res.ok) throw mapAgnesError(res.status, data);
  return data as T;
}

/** Text-to-image, editing and multi-image composition. Returns the raw OpenAI-style response. */
export function agnesImage(apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  return call(apiKey, `${base()}/images/generations`, { method: 'POST', body, timeoutMs: 360_000 });
}

export async function agnesVideoCreate(apiKey: string, body: Record<string, unknown>): Promise<{ videoId: string; status: string }> {
  const res = await call<{ video_id?: string; id?: string; task_id?: string; status?: string }>(apiKey, `${base()}/videos`, { method: 'POST', body, timeoutMs: 60_000 });
  const videoId = res.video_id ?? res.id ?? res.task_id;
  if (!videoId) throw new AppError('provider_error', 'Agnes did not return a video id.', 502);
  return { videoId, status: res.status ?? 'queued' };
}

export interface AgnesVideoStatus {
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  url: string | null;
  error: string | null;
  raw: unknown;
}

export async function agnesVideoStatus(apiKey: string, videoId: string, modelName: string): Promise<AgnesVideoStatus> {
  const q = new URLSearchParams({ video_id: videoId, model_name: modelName });
  const res = await call<Record<string, unknown>>(apiKey, `${origin()}/agnesapi?${q}`, { method: 'GET', timeoutMs: 30_000 });
  const data = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>;
  const status = String(data.status ?? 'queued') as AgnesVideoStatus['status'];
  const err = data.error as { message?: string } | string | null | undefined;
  return {
    status: ['queued', 'in_progress', 'completed', 'failed'].includes(status) ? status : 'in_progress',
    progress: Number(data.progress ?? 0) || 0,
    url: typeof data.url === 'string' ? data.url : null,
    error: err ? (typeof err === 'string' ? err : (err.message ?? 'Generation failed')) : null,
    raw: data,
  };
}
