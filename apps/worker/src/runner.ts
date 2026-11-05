import { randomUUID } from 'node:crypto';
import { asJson, parseJobPayload, type JobPayload, type JobRow, type JobType, type Json } from '@adforge/core';
import { enqueueJob, type EnqueueOptions, type ServiceClient } from '@adforge/core/server';
import { isRetryable, JobAborted, userMessage } from './lib/errors';
import type { Logger } from './lib/log';
import { inSeconds, makeTmpDir, nowIso, removeDir, throttle } from './lib/util';

export interface Reschedule {
  reschedule: { delayS: number; message?: string; progress?: number };
}

export type HandlerResult = void | Json | Reschedule;

export interface JobContext {
  job: JobRow;
  sb: ServiceClient;
  log: Logger;
  signal: AbortSignal;
  /** The job's workspace; throws for system jobs. */
  workspaceId: string;
  /** Throttled progress update (0–100) shown in the jobs tray. */
  progress(pct: number, message?: string): void;
  /** A per-job scratch directory, removed when the job ends. */
  tmp(): Promise<string>;
  enqueue<T extends JobType>(type: T, payload: JobPayload<T>, opts?: Partial<Omit<EnqueueOptions<T>, 'type' | 'payload'>>): Promise<JobRow>;
  /** Throws JobAborted when the job was canceled. */
  checkAborted(): void;
}

export interface JobHandler<T extends JobType = JobType> {
  run(ctx: JobContext, payload: JobPayload<T>): Promise<HandlerResult>;
  /** Marks the job's subject (asset, render, generation…) as failed once retries are exhausted. */
  onFailure?(ctx: JobContext, payload: JobPayload<T>, message: string): Promise<void>;
  /** Stops provider-side work when the user cancels. */
  onCancel?(ctx: JobContext, payload: JobPayload<T>): Promise<void>;
}

export type HandlerMap = { [T in JobType]: JobHandler<T> };

export const reschedule = (delayS: number, message?: string, progress?: number): Reschedule => ({
  reschedule: { delayS, ...(message ? { message } : {}), ...(progress != null ? { progress } : {}) },
});

const isReschedule = (v: unknown): v is Reschedule => typeof v === 'object' && v !== null && 'reschedule' in v;

export interface PoolDef {
  name: string;
  types: JobType[];
  concurrency: number;
  leaseS: number;
}

interface Running {
  job: JobRow;
  controller: AbortController;
  promise: Promise<void>;
}

const POLL_MIN_MS = 1_000;
const POLL_MAX_MS = 5_000;

/** Claims jobs of a set of types and runs them with a concurrency limit, keeping leases alive. */
export class Pool {
  private readonly active = new Map<string, Running>();
  private stopping = false;
  private wakeUp: (() => void) | null = null;
  private loopPromise: Promise<void> | null = null;
  readonly workerId: string;
  processed = 0;
  failed = 0;
  lastClaimAt: string | null = null;
  /** Updated on every pass of the claim loop, busy or not; used by the health check. */
  lastLoopAt: string | null = null;

  constructor(
    readonly def: PoolDef,
    private readonly handlers: HandlerMap,
    private readonly sb: ServiceClient,
    private readonly log: Logger,
    workerId: string,
  ) {
    this.workerId = `${workerId}:${def.name}:${randomUUID().slice(0, 8)}`;
  }

  start() {
    this.loopPromise = this.loop();
  }

  get busy() {
    return this.active.size;
  }

  /** Wakes the claim loop early, e.g. after a job finished. */
  poke() {
    this.wakeUp?.();
  }

  private async loop() {
    let idle = POLL_MIN_MS;
    while (!this.stopping) {
      this.lastLoopAt = nowIso();
      const free = this.def.concurrency - this.active.size;
      if (free > 0) {
        try {
          const { data, error } = await this.sb.rpc('claim_jobs', { p_worker: this.workerId, p_types: this.def.types, p_limit: free, p_lease_seconds: this.def.leaseS });
          if (error) throw new Error(error.message);
          this.lastClaimAt = nowIso();
          for (const job of data ?? []) this.launch(job);
          if (data?.length) {
            idle = POLL_MIN_MS;
            continue;
          }
        } catch (err) {
          this.log.warn({ err: userMessage(err), pool: this.def.name }, 'claim failed');
          idle = POLL_MAX_MS;
        }
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, idle);
        this.wakeUp = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.wakeUp = null;
      idle = Math.min(POLL_MAX_MS, Math.round(idle * 1.5));
    }
  }

  private launch(job: JobRow) {
    const controller = new AbortController();
    const promise = this.execute(job, controller)
      .catch((err) => this.log.error({ err: userMessage(err), jobId: job.id }, 'job bookkeeping failed'))
      .finally(() => {
        this.active.delete(job.id);
        this.poke();
      });
    this.active.set(job.id, { job, controller, promise });
  }

  private async execute(job: JobRow, controller: AbortController) {
    const type = job.type as JobType;
    const handler = this.handlers[type] as JobHandler | undefined;
    const log = this.log.child({ jobId: job.id, type, attempt: job.attempts, workspaceId: job.workspace_id });
    const started = Date.now();
    let tmpDir: string | null = null;

    const progress = throttle(async (pct: number, message?: string) => {
      const { error } = await this.sb
        .from('jobs')
        .update({ progress: Math.max(0, Math.min(100, Math.round(pct * 100) / 100)), ...(message ? { progress_message: message.slice(0, 300) } : {}) })
        .eq('id', job.id)
        .eq('status', 'running');
      if (error) log.debug({ err: error.message }, 'progress update failed');
    }, 1500);

    const ctx: JobContext = {
      job,
      sb: this.sb,
      log,
      signal: controller.signal,
      get workspaceId() {
        if (!job.workspace_id) throw new Error(`${type} needs a workspace`);
        return job.workspace_id;
      },
      progress: (pct, message) => progress(pct, message),
      tmp: async () => (tmpDir ??= await makeTmpDir(`job-${job.id}`)),
      enqueue: (t, payload, opts = {}) =>
        enqueueJob(this.sb, { type: t, payload, workspaceId: job.workspace_id, createdBy: job.created_by, parentJobId: job.id, ...opts } as EnqueueOptions<typeof t>),
      checkAborted: () => {
        if (controller.signal.aborted) throw controller.signal.reason instanceof JobAborted ? controller.signal.reason : new JobAborted('canceled');
      },
    };

    // Heartbeat: extends the lease and notices cancellation.
    const beatMs = Math.max(5_000, Math.min(60_000, (this.def.leaseS * 1000) / 3));
    const heartbeat = setInterval(async () => {
      const { data, error } = await this.sb
        .from('jobs')
        .update({ locked_until: inSeconds(this.def.leaseS) })
        .eq('id', job.id)
        .eq('locked_by', this.workerId)
        .eq('status', 'running')
        .select('id');
      if (error) return log.warn({ err: error.message }, 'heartbeat failed');
      if (!data?.length) {
        const { data: row } = await this.sb.from('jobs').select('status').eq('id', job.id).maybeSingle();
        controller.abort(new JobAborted(row?.status === 'canceled' ? 'canceled' : 'lease_lost'));
      }
    }, beatMs);
    heartbeat.unref();

    let payload: JobPayload<JobType>;
    try {
      if (!handler) throw new Error(`No handler for job type ${type}`);
      payload = parseJobPayload(type, job.payload);
    } catch (err) {
      clearInterval(heartbeat);
      await this.finish(job, { status: 'failed', error: `Invalid job: ${userMessage(err)}` });
      return;
    }

    log.info('job started');
    try {
      const result = await handler.run(ctx, payload as never);
      await progress.flush();
      if (isReschedule(result)) {
        await this.release(job, result.reschedule.delayS, result.reschedule.message, result.reschedule.progress);
        log.info({ delayS: result.reschedule.delayS }, 'job rescheduled');
      } else {
        await this.finish(job, { status: 'succeeded', result: result === undefined ? null : asJson(result) });
        this.processed++;
        log.info({ ms: Date.now() - started }, 'job succeeded');
      }
    } catch (err) {
      await progress.flush().catch(() => undefined);
      const aborted = err instanceof JobAborted ? err : controller.signal.aborted && controller.signal.reason instanceof JobAborted ? controller.signal.reason : null;
      if (aborted?.reason === 'canceled') {
        log.info('job canceled');
        await handler.onCancel?.(ctx, payload as never).catch((e) => log.warn({ err: userMessage(e) }, 'cancel hook failed'));
      } else if (aborted?.reason === 'shutdown') {
        // Hand the job back without using up an attempt.
        await this.release(job, 0, 'Waiting for a worker');
        log.info('job released for shutdown');
      } else if (aborted?.reason === 'lease_lost') {
        log.warn('lease lost; another worker owns the job now');
      } else {
        const message = userMessage(err);
        const retry = isRetryable(err) && job.attempts < job.max_attempts;
        this.failed++;
        if (retry) {
          const delay = Math.min(900, 15 * 4 ** (job.attempts - 1)) + Math.round(Math.random() * 10);
          await this.sb
            .from('jobs')
            .update({ status: 'queued', run_at: inSeconds(delay), error: message, progress_message: `Retrying in ${delay}s: ${message}`.slice(0, 300), locked_by: null, locked_until: null })
            .eq('id', job.id)
            .eq('locked_by', this.workerId)
            .eq('status', 'running');
          log.warn({ err: message, delay }, 'job failed; will retry');
        } else {
          await this.finish(job, { status: 'failed', error: message });
          log.error({ err: message, stack: err instanceof Error ? err.stack : undefined }, 'job failed');
          await handler.onFailure?.(ctx, payload as never, message).catch((e) => log.error({ err: userMessage(e) }, 'failure hook failed'));
        }
      }
    } finally {
      clearInterval(heartbeat);
      if (tmpDir) await removeDir(tmpDir);
    }
  }

  private async finish(job: JobRow, patch: { status: 'succeeded' | 'failed'; result?: Json | null; error?: string }) {
    const { error } = await this.sb
      .from('jobs')
      .update({
        status: patch.status,
        ...(patch.status === 'succeeded' ? { progress: 100, progress_message: null, error: null } : {}),
        ...(patch.result !== undefined ? { result: patch.result } : {}),
        ...(patch.error ? { error: patch.error } : {}),
        completed_at: nowIso(),
        locked_by: null,
        locked_until: null,
      })
      .eq('id', job.id)
      .eq('locked_by', this.workerId)
      .eq('status', 'running');
    if (error) this.log.error({ err: error.message, jobId: job.id }, 'could not complete job');
  }

  /** Puts a running job back in the queue without counting the attempt. */
  private async release(job: JobRow, delayS: number, message?: string, progress?: number) {
    await this.sb
      .from('jobs')
      .update({
        status: 'queued',
        run_at: inSeconds(delayS),
        attempts: Math.max(0, job.attempts - 1),
        locked_by: null,
        locked_until: null,
        ...(message ? { progress_message: message.slice(0, 300) } : {}),
        ...(progress != null ? { progress } : {}),
      })
      .eq('id', job.id)
      .eq('locked_by', this.workerId)
      .eq('status', 'running');
  }

  /** Stops claiming, waits for running jobs, then aborts and releases what is left. */
  async stop(graceMs: number) {
    this.stopping = true;
    this.poke();
    await this.loopPromise;
    const running = [...this.active.values()];
    if (!running.length) return;
    const all = Promise.all(running.map((r) => r.promise));
    const timedOut = await Promise.race([all.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), graceMs))]);
    if (timedOut) {
      for (const r of this.active.values()) r.controller.abort(new JobAborted('shutdown'));
      await Promise.race([all, new Promise((r) => setTimeout(r, 10_000))]);
    }
  }

  status() {
    return {
      name: this.def.name,
      workerId: this.workerId,
      concurrency: this.def.concurrency,
      running: [...this.active.values()].map((r) => ({ id: r.job.id, type: r.job.type })),
      processed: this.processed,
      failed: this.failed,
      lastClaimAt: this.lastClaimAt,
      lastLoopAt: this.lastLoopAt,
    };
  }
}
