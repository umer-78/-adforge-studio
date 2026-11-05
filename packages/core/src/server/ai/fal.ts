import { createFalClient, type FalClient } from '@fal-ai/client';
import { AppError } from '../../utils';

const clients = new Map<string, FalClient>();
function client(apiKey: string) {
  let c = clients.get(apiKey);
  if (!c) {
    c = createFalClient({ credentials: apiKey });
    clients.set(apiKey, c);
  }
  return c;
}

export async function falSubmit(apiKey: string, endpoint: string, input: Record<string, unknown>, webhookUrl?: string | null): Promise<{ requestId: string }> {
  try {
    const res = await client(apiKey).queue.submit(endpoint, { input, ...(webhookUrl ? { webhookUrl } : {}) });
    return { requestId: res.request_id };
  } catch (err) {
    throw mapFalError(err);
  }
}

export type FalStatus = { state: 'queued' | 'running'; position?: number; logs?: string[] } | { state: 'completed' } | { state: 'failed'; error: string };

export async function falStatus(apiKey: string, endpoint: string, requestId: string): Promise<FalStatus> {
  try {
    const res = (await client(apiKey).queue.status(endpoint, { requestId, logs: true })) as {
      status: string;
      queue_position?: number;
      logs?: { message: string }[];
      error?: string;
    };
    if (res.status === 'COMPLETED') return res.error ? { state: 'failed', error: String(res.error) } : { state: 'completed' };
    if (res.status === 'IN_PROGRESS') return { state: 'running', logs: (res.logs ?? []).map((l) => l.message).slice(-5) };
    return { state: 'queued', ...(res.queue_position != null ? { position: res.queue_position } : {}) };
  } catch (err) {
    throw mapFalError(err);
  }
}

export async function falResult(apiKey: string, endpoint: string, requestId: string): Promise<unknown> {
  try {
    const res = await client(apiKey).queue.result(endpoint, { requestId });
    return res.data;
  } catch (err) {
    throw mapFalError(err);
  }
}

export async function falCancel(apiKey: string, endpoint: string, requestId: string): Promise<void> {
  await client(apiKey)
    .queue.cancel(endpoint, { requestId })
    .catch(() => undefined);
}

/** Current list prices from fal's pricing API, keyed by endpoint id. */
export async function falPrices(apiKey: string, endpoints: string[]): Promise<Record<string, { unitPrice: number; unit: string }>> {
  const out: Record<string, { unitPrice: number; unit: string }> = {};
  const unique = [...new Set(endpoints)];
  for (let i = 0; i < unique.length; i += 50) {
    const qs = new URLSearchParams();
    for (const e of unique.slice(i, i + 50)) qs.append('endpoint_id', e);
    const res = await fetch(`https://api.fal.ai/v1/models/pricing?${qs}`, { headers: { Authorization: `Key ${apiKey}` } });
    if (!res.ok) continue;
    const body = (await res.json()) as { prices?: { endpoint_id: string; unit_price: number; unit: string }[] };
    for (const p of body.prices ?? []) out[p.endpoint_id] = { unitPrice: p.unit_price, unit: p.unit };
  }
  return out;
}

function mapFalError(err: unknown): Error {
  const e = err as { status?: number; body?: { detail?: unknown }; message?: string };
  const detail = e.body?.detail;
  const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d) => (d as { msg?: string }).msg ?? JSON.stringify(d)).join('; ') : (e.message ?? String(err));
  if (e.status === 401 || e.status === 403) return new AppError('provider_auth', 'The fal API key was rejected. Check Settings → Providers.', 401);
  if (e.status === 422) return new AppError('provider_invalid_input', `fal rejected the input: ${message}`, 422);
  if (e.status === 429) return new AppError('provider_rate_limited', 'fal is rate limiting requests. Try again shortly.', 429);
  return new AppError('provider_error', `fal error: ${message}`, e.status && e.status < 500 ? e.status : 502);
}
