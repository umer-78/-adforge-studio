import { JOB_PAYLOADS, type JobPayload, type JobType } from '../jobs';
import type { Json } from '../db/database.types';
import type { JobRow } from '../db';
import type { AnyClient } from './supabase';

export interface EnqueueOptions<T extends JobType> {
  type: T;
  payload: JobPayload<T>;
  workspaceId: string | null;
  createdBy?: string | null;
  priority?: number;
  runAt?: Date;
  idempotencyKey?: string;
  maxAttempts?: number;
  parentJobId?: string | null;
}

/** Inserts a job. With an idempotency key, an existing job with the same key is returned instead. */
export async function enqueueJob<T extends JobType>(sb: AnyClient, opts: EnqueueOptions<T>): Promise<JobRow> {
  const payload = JOB_PAYLOADS[opts.type].parse(opts.payload);
  const row = {
    type: opts.type,
    payload: payload as Json,
    workspace_id: opts.workspaceId,
    created_by: opts.createdBy ?? null,
    priority: opts.priority ?? 0,
    run_at: (opts.runAt ?? new Date()).toISOString(),
    max_attempts: opts.maxAttempts ?? 3,
    parent_job_id: opts.parentJobId ?? null,
    idempotency_key: opts.idempotencyKey ?? null,
  };
  if (opts.idempotencyKey) {
    const { data: existing } = await sb.from('jobs').select('*').eq('idempotency_key', opts.idempotencyKey).maybeSingle();
    if (existing) return existing;
  }
  const { data, error } = await sb.from('jobs').insert(row).select('*').single();
  if (error) {
    if (error.code === '23505' && opts.idempotencyKey) {
      const { data: existing } = await sb.from('jobs').select('*').eq('idempotency_key', opts.idempotencyKey).single();
      if (existing) return existing;
    }
    throw new Error(`Could not queue ${opts.type}: ${error.message}`);
  }
  return data;
}

export async function cancelJob(sb: AnyClient, jobId: string) {
  await sb.from('jobs').update({ status: 'canceled', completed_at: new Date().toISOString(), locked_by: null, locked_until: null }).eq('id', jobId).in('status', ['queued', 'running']);
}
