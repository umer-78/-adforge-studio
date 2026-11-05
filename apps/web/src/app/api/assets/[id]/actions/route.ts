import { audioRates, isRecord, type JobRow } from '@adforge/core';
import { assertBudget, enqueueJob, env, providerKey } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toJobView } from '@/lib/server/workspace';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reprocess') }),
  z.object({ action: z.literal('analyze'), steps: z.array(z.enum(['transcribe', 'tags', 'embed'])).min(1).default(['transcribe', 'tags', 'embed']) }),
  z.object({ action: z.literal('score'), platform: z.string().max(40).optional() }),
  z.object({ action: z.literal('reframe'), aspect: z.enum(['9:16', '1:1', '4:5', '16:9']) }),
  z.object({ action: z.literal('detect'), kind: z.enum(['silence', 'scenes', 'beats']), thresholdDb: z.number().min(-80).max(0).optional(), minSilenceS: z.number().min(0.1).max(10).optional() }),
  z.object({ action: z.literal('audio'), op: z.enum(['normalize', 'denoise', 'isolate', 'stems']), targetLufs: z.number().min(-30).max(-5).optional() }),
]);

/** Queues processing on one file: re-process, AI analysis, ad score, auto-reframe, detection, audio clean-up. */
export const POST = route({ body: actionSchema, limit: ['asset-actions', 240, 3600] }, async ({ sb, caller, params, body }) => {
  const asset = await owned(sb, 'assets', params.id!, caller, 'This file');
  if (asset.deleted_at) throw badRequest('Restore the file from the trash first.');
  if (asset.status !== 'ready' && body.action !== 'reprocess') throw badRequest('Wait until the file finishes processing.');
  const ws = caller.workspaceId;
  const bucket = Math.floor(Date.now() / 10_000);
  const base = { workspaceId: ws, createdBy: caller.userId };
  let job: JobRow;
  switch (body.action) {
    case 'reprocess':
      if (asset.status === 'uploading') throw badRequest('The upload has not finished.');
      check(await sb.from('assets').update({ status: 'processing', processing_error: null }).eq('id', asset.id), 'Could not restart processing');
      job = await enqueueJob(sb, { ...base, type: 'media.process', payload: { assetId: asset.id }, priority: 5, idempotencyKey: `media.process:${asset.id}:retry:${bucket}` });
      break;
    case 'analyze':
      if (!(await providerKey(ws, 'anthropic')) && !(await providerKey(ws, 'openai'))) throw badRequest('Add a Claude or OpenAI key in Settings → Providers to analyze files.');
      job = await enqueueJob(sb, { ...base, type: 'media.analyze', payload: { assetId: asset.id, steps: body.steps }, idempotencyKey: `media.analyze:${asset.id}:${bucket}` });
      break;
    case 'score':
      if (!(await providerKey(ws, 'anthropic'))) throw badRequest('Add a Claude key in Settings → Providers to score ads.');
      job = await enqueueJob(sb, { ...base, type: 'media.score', payload: { assetId: asset.id, platform: body.platform }, idempotencyKey: `media.score:${asset.id}:${body.platform ?? 'any'}:${bucket}` });
      break;
    case 'reframe':
      if (asset.type !== 'video') throw badRequest('Auto-reframe works on videos. For photos, use Fill & expand in the Photo Studio.');
      job = await enqueueJob(sb, { ...base, type: 'media.reframe', payload: { assetId: asset.id, aspect: body.aspect }, idempotencyKey: `media.reframe:${asset.id}:${body.aspect}:${bucket}` });
      break;
    case 'detect':
      if (asset.type !== 'video' && asset.type !== 'audio') throw badRequest('Detection works on video and audio.');
      job = await enqueueJob(sb, { ...base, type: 'media.detect', payload: { assetId: asset.id, kind: body.kind, thresholdDb: body.thresholdDb, minSilenceS: body.minSilenceS }, idempotencyKey: `media.detect:${asset.id}:${body.kind}:${bucket}` });
      break;
    case 'audio': {
      if (asset.type !== 'audio' && asset.type !== 'video') throw badRequest('Audio tools need an audio or video file.');
      if (body.op === 'isolate') {
        if (!(await providerKey(ws, 'elevenlabs'))) throw badRequest('Add an ElevenLabs key in Settings → Providers for voice isolation.');
        const minutes = Math.max(1, Math.ceil(Number(asset.duration_s ?? 60) / 60));
        await assertBudget(sb, ws, minutes * env().ELEVENLABS_ISOLATE_USD_PER_MIN);
      }
      if (body.op === 'stems') {
        if (!(await providerKey(ws, 'replicate'))) throw badRequest('Add a Replicate key in Settings → Providers to split stems.');
        await assertBudget(sb, ws, audioRates.stemsPerRun);
      }
      job = await enqueueJob(sb, { ...base, type: 'audio.process', payload: { assetId: asset.id, op: body.op, targetLufs: body.targetLufs }, idempotencyKey: `audio.process:${asset.id}:${body.op}:${bucket}` });
      break;
    }
  }
  await logActivity(sb, caller, `asset.${body.action}`, 'asset', asset.id, isRecord(body) ? { ...body } : {});
  return toJobView(job);
});
