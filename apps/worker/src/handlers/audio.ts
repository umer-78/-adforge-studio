import path from 'node:path';
import { estimateCost, type AssetMeta, type Json } from '@adforge/core';
import { PermanentError } from '../lib/errors';
import { createAssetFromFile, downloadAsset, loadAsset } from '../lib/files';
import { ffmpeg, loudnormFilter, measureLoudness, probe } from '../media/ffmpeg';
import type { JobContext, JobHandler } from '../runner';

const DENOISE = 'highpass=f=70,afftdn=nr=14:nf=-32:tn=1,lowpass=f=15500';

/** Writes processed audio; video keeps its picture stream untouched. */
async function processAudio(ctx: JobContext, input: string, isVideo: boolean, filter: string, out: string, durationS: number | null, label: string) {
  await ffmpeg(
    [
      '-i', input,
      ...(isVideo ? ['-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy'] : ['-vn']),
      '-af', `${filter},aresample=48000`,
      '-c:a', 'aac', '-b:a', isVideo ? '192k' : '256k',
      ...(isVideo ? ['-movflags', '+faststart'] : []),
      out,
    ],
    { signal: ctx.signal, onTime: (t) => durationS && ctx.progress(20 + Math.min(1, t / durationS) * 70, label) },
  );
}

/** Isolation and stem splitting are paid provider calls, so they run as generations with a cost record. */
async function queueProviderOp(ctx: JobContext, assetId: string, op: 'isolate' | 'stems', durationS: number | null) {
  const modelId = op === 'isolate' ? 'eleven-isolate' : 'demucs-stems';
  const params = { audioAssetId: assetId, durationS: durationS ?? undefined };
  const estimate = estimateCost(modelId, params, { inputDurationS: durationS ?? undefined });
  const { data, error } = await ctx.sb
    .from('generations')
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.job.created_by,
      capability: op,
      provider: op === 'isolate' ? 'elevenlabs' : 'replicate',
      model: modelId,
      params: params as Json,
      input_asset_ids: [assetId],
      cost_estimate_usd: estimate.usd,
      eta_seconds: estimate.etaS,
      source_ref: { from: 'audio.process', assetId } as Json,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Could not start ${op}: ${error.message}`);
  const job = await ctx.enqueue('ai.generate', { generationId: data.id }, { idempotencyKey: `ai.generate:${data.id}` });
  await ctx.sb.from('generations').update({ job_id: job.id }).eq('id', data.id);
  return { generationId: data.id, estimateUsd: estimate.usd };
}

export const audioProcess: JobHandler<'audio.process'> = {
  async run(ctx, { assetId, op, targetLufs }) {
    const asset = await loadAsset(ctx.sb, ctx.workspaceId, assetId);
    const isVideo = asset.type === 'video';
    if (asset.type !== 'audio' && !(isVideo && (asset.meta as AssetMeta).hasAudio !== false)) throw new PermanentError('This file has no audio to process.');
    if (op === 'isolate' || op === 'stems') return queueProviderOp(ctx, asset.id, op, asset.duration_s);

    ctx.progress(5, 'Reading file');
    const file = await downloadAsset(ctx, asset);
    const p = await probe(file, ctx.signal);
    if (!p.hasAudio) throw new PermanentError('This file has no audio to process.');
    const out = path.join(await ctx.tmp(), `processed.${isVideo ? 'mp4' : 'm4a'}`);
    let suffix: string;
    let meta: Record<string, unknown>;

    if (op === 'normalize') {
      const target = targetLufs ?? -14;
      ctx.progress(10, 'Measuring loudness');
      const stats = await measureLoudness(file, target, ctx.signal);
      if (!stats || !Number.isFinite(Number(stats.input_i)) || Number(stats.input_i) < -70) throw new PermanentError('This audio is silent, so it cannot be normalized.');
      await processAudio(ctx, file, isVideo, loudnormFilter(stats, target), out, p.durationS, 'Normalizing');
      suffix = `${target} LUFS`;
      meta = { audioProcess: { op, targetLufs: target, measuredLufs: Number(stats.input_i) }, loudnessLufs: target };
    } else {
      await processAudio(ctx, file, isVideo, DENOISE, out, p.durationS, 'Removing noise');
      suffix = 'clean';
      meta = { audioProcess: { op } };
    }

    ctx.progress(92, 'Saving');
    const created = await createAssetFromFile(ctx, {
      workspaceId: asset.workspace_id,
      filePath: out,
      mime: isVideo ? 'video/mp4' : 'audio/mp4',
      name: `${asset.name} (${suffix})`,
      source: 'derived',
      parentAssetId: asset.id,
      projectId: asset.project_id,
      folderId: asset.folder_id,
      isAiGenerated: asset.is_ai_generated,
      licenseId: asset.license_id,
      tags: asset.tags,
      meta: { ...meta, ...((asset.meta as AssetMeta).role ? { role: (asset.meta as AssetMeta).role } : {}) },
    });
    const { data: track } = await ctx.sb.from('audio_tracks').select('*').eq('asset_id', asset.id).maybeSingle();
    if (track) {
      await ctx.sb.from('audio_tracks').insert({
        workspace_id: track.workspace_id,
        asset_id: created.id,
        kind: track.kind,
        bpm: track.bpm,
        beats: track.beats,
        musical_key: track.musical_key,
        voice_id: track.voice_id,
        script_id: track.script_id,
        line_id: track.line_id,
        license_id: track.license_id,
      });
    }
    return { assetId: created.id };
  },
};
