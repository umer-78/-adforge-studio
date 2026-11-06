import { isRecord, parseWorkspaceSettings, storageKeys, type PlaybackInfo } from '@adforge/core';
import { muxDeleteAsset, storage } from '@adforge/core/server';
import { userMessage } from '../lib/errors';
import type { JobContext, JobHandler } from '../runner';

const BATCH = 100;
const KEEP_SNAPSHOTS = 50;
const DAY_MS = 86400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** Deletes trashed files (storage, Mux and rows) older than the workspace's retention. */
async function purgeWorkspace(ctx: JobContext, workspaceId: string, retentionDays: number) {
  const cutoff = ago(retentionDays * DAY_MS);
  let assets = 0;
  for (let round = 0; round < 10; round++) {
    const { data: rows, error } = await ctx.sb.from('assets').select('id, storage_driver, playback').eq('workspace_id', workspaceId).not('deleted_at', 'is', null).lt('deleted_at', cutoff).limit(BATCH);
    if (error) throw new Error(`Could not list trash: ${error.message}`);
    if (!rows?.length) break;
    const removed: string[] = [];
    for (const asset of rows) {
      ctx.checkAborted();
      try {
        await storage(asset.storage_driver).deletePrefix(storageKeys.assetPrefix(workspaceId, asset.id));
        const playback = (isRecord(asset.playback) ? asset.playback : {}) as PlaybackInfo;
        if (playback.muxAssetId) await muxDeleteAsset(playback.muxAssetId);
        removed.push(asset.id);
      } catch (err) {
        ctx.log.warn({ assetId: asset.id, err: userMessage(err) }, 'could not delete trashed file');
      }
    }
    if (removed.length) {
      const { error: delError } = await ctx.sb.from('assets').delete().in('id', removed);
      if (delError) throw new Error(`Could not empty trash: ${delError.message}`);
      assets += removed.length;
    }
    if (rows.length < BATCH || removed.length < rows.length) break;
  }
  const { count: timelines } = await ctx.sb.from('timelines').delete({ count: 'exact' }).eq('workspace_id', workspaceId).not('deleted_at', 'is', null).lt('deleted_at', cutoff);
  return { assets, timelines: timelines ?? 0 };
}

/** Keeps the newest snapshots of recently edited timelines. */
async function pruneSnapshots(ctx: JobContext) {
  const { data: timelines } = await ctx.sb.from('timelines').select('id').gte('updated_at', ago(2 * DAY_MS)).limit(500);
  let removed = 0;
  for (const t of timelines ?? []) {
    const { data: old } = await ctx.sb.from('timeline_snapshots').select('id').eq('timeline_id', t.id).order('created_at', { ascending: false }).range(KEEP_SNAPSHOTS, KEEP_SNAPSHOTS + 499);
    if (!old?.length) continue;
    const { error } = await ctx.sb.from('timeline_snapshots').delete().in('id', old.map((s) => s.id));
    if (!error) removed += old.length;
  }
  return removed;
}

/** Expired sign-in states, old rate-limit windows, webhook receipts, finished jobs and old deletion receipts. */
async function housekeeping(ctx: JobContext) {
  const now = new Date().toISOString();
  const results = await Promise.all([
    ctx.sb.from('oauth_states').delete({ count: 'exact' }).lt('expires_at', now),
    ctx.sb.from('rate_limits').delete({ count: 'exact' }).lt('window_start', ago(DAY_MS)),
    ctx.sb.from('webhook_events').delete({ count: 'exact' }).lt('received_at', ago(30 * DAY_MS)),
    ctx.sb.from('jobs').delete({ count: 'exact' }).in('status', ['succeeded', 'canceled']).lt('completed_at', ago(14 * DAY_MS)),
    ctx.sb.from('jobs').delete({ count: 'exact' }).eq('status', 'failed').lt('completed_at', ago(30 * DAY_MS)),
    ctx.sb.from('data_deletion_requests').delete({ count: 'exact' }).lt('created_at', ago(90 * DAY_MS)),
  ]);
  for (const r of results) if (r.error) ctx.log.warn({ err: r.error.message }, 'housekeeping step failed');
  const [oauth, rateLimits, webhooks, jobsDone, jobsFailed, deletionReceipts] = results.map((r) => r.count ?? 0);
  return { oauth, rateLimits, webhooks, jobs: (jobsDone ?? 0) + (jobsFailed ?? 0), deletionReceipts };
}

export const trashPurge: JobHandler<'trash.purge'> = {
  async run(ctx, { all }) {
    let q = ctx.sb.from('workspaces').select('id, settings');
    if (ctx.job.workspace_id) q = q.eq('id', ctx.job.workspace_id);
    const { data: workspaces, error } = await q;
    if (error) throw new Error(`Could not load workspaces: ${error.message}`);
    let assets = 0;
    let timelines = 0;
    for (const [i, ws] of (workspaces ?? []).entries()) {
      ctx.progress((i / Math.max(1, workspaces!.length)) * 80, 'Emptying trash');
      const res = await purgeWorkspace(ctx, ws.id, all && ctx.job.workspace_id ? 0 : parseWorkspaceSettings(ws.settings).trashRetentionDays);
      assets += res.assets;
      timelines += res.timelines;
    }
    // Shared tables are cleaned by the daily system job only.
    if (ctx.job.workspace_id) return { assets, timelines };
    ctx.progress(85, 'Housekeeping');
    const snapshots = await pruneSnapshots(ctx);
    return { assets, timelines, snapshots, ...(await housekeeping(ctx)) };
  },
};
