import 'server-only';
import { enqueueJob, type ServiceClient } from '@adforge/core/server';
import { json } from './api';

/** Acknowledges a webhook. Providers retry on non-2xx, so anything not for us is still a 200. */
export const ack = (data: Record<string, unknown> = {}) => json({ ok: true, ...data });
export const rejectSignature = () => json({ error: { code: 'invalid_signature', message: 'The webhook signature did not match.' } }, 401);

/**
 * A provider says a generation finished: run its poll now instead of at the next scheduled check.
 * The poll reads the result from the provider, so the webhook body never decides the outcome.
 */
export async function wakeGeneration(sb: ServiceClient, generationId: string, providerRequestId: string | null, provider: 'fal' | 'replicate') {
  const { data: gen } = await sb.from('generations').select('id, workspace_id, created_by, status, provider, provider_request_id').eq('id', generationId).maybeSingle();
  if (!gen || gen.provider !== provider || !providerRequestId || gen.provider_request_id !== providerRequestId) return { ignored: 'unknown generation' };
  if (gen.status !== 'running') return { ignored: gen.status };
  const now = new Date().toISOString();
  const { data: woke } = await sb.from('jobs').update({ run_at: now }).eq('type', 'ai.poll').eq('status', 'queued').eq('payload->>generationId', gen.id).select('id');
  if (woke?.length) return { woke: woke.length };
  const { data: running } = await sb.from('jobs').select('id').eq('type', 'ai.poll').eq('status', 'running').eq('payload->>generationId', gen.id).limit(1);
  if (running?.length) return { running: true };
  await enqueueJob(sb, { type: 'ai.poll', payload: { generationId: gen.id }, workspaceId: gen.workspace_id, createdBy: gen.created_by, priority: 5, idempotencyKey: `ai.poll:${gen.id}:webhook:${Date.now()}` });
  return { queued: true };
}
