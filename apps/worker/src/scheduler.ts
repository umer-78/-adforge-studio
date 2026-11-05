import { asJson, isRecord, type JobType, type PlaybackInfo } from '@adforge/core';
import { enqueueJob, features, muxGetAsset, type ServiceClient } from '@adforge/core/server';
import { userMessage } from './lib/errors';
import type { Logger } from './lib/log';

const TICK_MS = 30_000;
const HOUR_MS = 3600_000;

/** A time bucket so every worker instance agrees on one job per period. */
const bucket = (periodMs: number) => Math.floor(Date.now() / periodMs);

interface Task {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

/**
 * Periodic work: due scheduled posts, metric and ad syncs, competitor checks, trash cleanup and
 * fallbacks for missed webhooks. Safe to run in every worker instance: system jobs use
 * time-bucketed idempotency keys and post claims are atomic.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly lastRun = new Map<string, number>();
  private readonly tasks: Task[];

  constructor(
    private readonly sb: ServiceClient,
    private readonly log: Logger,
  ) {
    this.tasks = [
      { name: 'scheduled-posts', everyMs: TICK_MS, run: () => this.dueScheduledPosts() },
      { name: 'publish-metrics', everyMs: HOUR_MS, run: () => this.system('publish.metrics', {}, HOUR_MS) },
      { name: 'ads-sync', everyMs: HOUR_MS, run: () => this.system('ads.sync', {}, HOUR_MS) },
      { name: 'competitors', everyMs: 6 * HOUR_MS, run: () => this.system('competitors.sync', {}, 6 * HOUR_MS) },
      { name: 'trash', everyMs: 24 * HOUR_MS, run: () => this.system('trash.purge', {}, 24 * HOUR_MS) },
      { name: 'generation-watchdog', everyMs: 5 * 60_000, run: () => this.stuckGenerations() },
      { name: 'mux-fallback', everyMs: 2 * 60_000, run: () => this.preparingMuxAssets() },
    ];
  }

  start() {
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try {
        for (const task of this.tasks) {
          const last = this.lastRun.get(task.name) ?? 0;
          if (Date.now() - last < task.everyMs) continue;
          this.lastRun.set(task.name, Date.now());
          await task.run().catch((err) => this.log.warn({ task: task.name, err: userMessage(err) }, 'scheduler task failed'));
        }
      } finally {
        this.running = false;
      }
    };
    void tick();
    this.timer = setInterval(() => void tick(), TICK_MS);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private system<T extends JobType>(type: T, payload: Parameters<typeof enqueueJob<T>>[1]['payload'], periodMs: number) {
    return enqueueJob(this.sb, { type, payload, workspaceId: null, idempotencyKey: `${type}:system:${bucket(periodMs)}`, priority: -5 });
  }

  /** Moves due scheduled posts to publishing and queues one job per account. */
  private async dueScheduledPosts() {
    const { data: due, error } = await this.sb.from('posts').select('id, workspace_id, created_by, scheduled_at').eq('status', 'scheduled').lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(50);
    if (error) throw new Error(error.message);
    for (const post of due ?? []) {
      // Claim the post so two workers never publish it twice.
      const { data: claimed } = await this.sb.from('posts').update({ status: 'publishing' }).eq('id', post.id).eq('status', 'scheduled').select('id');
      if (!claimed?.length) continue;
      const { data: targets } = await this.sb.from('post_targets').select('id').eq('post_id', post.id).eq('status', 'pending');
      for (const t of targets ?? []) {
        const job = await enqueueJob(this.sb, {
          type: 'publish.post',
          payload: { postTargetId: t.id },
          workspaceId: post.workspace_id,
          createdBy: post.created_by,
          priority: 10,
          idempotencyKey: `publish.post:${t.id}:${post.scheduled_at}`,
        });
        await this.sb.from('post_targets').update({ job_id: job.id }).eq('id', t.id);
      }
      if (!targets?.length) await this.sb.from('posts').update({ status: 'failed' }).eq('id', post.id);
      this.log.info({ postId: post.id, targets: targets?.length ?? 0 }, 'scheduled post queued');
    }
  }

  /** Generations whose provider webhook never arrived get a poller again. */
  private async stuckGenerations() {
    const { data: stuck } = await this.sb
      .from('generations')
      .select('id, workspace_id, created_by')
      .eq('status', 'running')
      .not('provider_request_id', 'is', null)
      .lt('updated_at', new Date(Date.now() - 15 * 60_000).toISOString())
      .limit(50);
    for (const gen of stuck ?? []) {
      const { data: active } = await this.sb.from('jobs').select('id').eq('type', 'ai.poll').in('status', ['queued', 'running']).eq('payload->>generationId', gen.id).limit(1);
      if (active?.length) continue;
      await enqueueJob(this.sb, { type: 'ai.poll', payload: { generationId: gen.id }, workspaceId: gen.workspace_id, createdBy: gen.created_by, idempotencyKey: `ai.poll:${gen.id}:watchdog:${bucket(15 * 60_000)}` });
      this.log.info({ generationId: gen.id }, 'requeued poll for stuck generation');
    }
  }

  /** Mux normally reports readiness by webhook; this catches assets whose webhook was missed. */
  private async preparingMuxAssets() {
    if (!features().mux) return;
    const { data: assets } = await this.sb.from('assets').select('id, playback').eq('playback->>provider', 'mux').eq('playback->>muxStatus', 'preparing').lt('updated_at', new Date(Date.now() - 2 * 60_000).toISOString()).limit(25);
    for (const asset of assets ?? []) {
      const playback = (isRecord(asset.playback) ? asset.playback : {}) as PlaybackInfo;
      if (!playback.muxAssetId) continue;
      const mux = await muxGetAsset(playback.muxAssetId).catch(() => null);
      if (!mux || mux.status === 'preparing') {
        await this.sb.from('assets').update({ playback: asJson(playback) }).eq('id', asset.id);
        continue;
      }
      const next: PlaybackInfo = { ...playback, muxStatus: mux.status, ...(mux.playback_ids?.[0] ? { muxPlaybackId: mux.playback_ids[0].id, policy: mux.playback_ids[0].policy } : {}) };
      await this.sb.from('assets').update({ playback: asJson(next) }).eq('id', asset.id);
    }
  }
}
