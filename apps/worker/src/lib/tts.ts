import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { asJson, getModel, resolveParams, type AssetRow, type Json } from '@adforge/core';
import { alignmentToWords, assertBudget, elevenTts, recordUsage, requireProviderKey, segmentsFromWords } from '@adforge/core/server';
import type { JobContext } from '../runner';
import { PermanentError } from './errors';
import { createAssetFromFile } from './files';

export interface VoiceLine {
  workspaceId: string;
  text: string;
  voiceId: string;
  name: string;
  modelId?: string;
  projectId?: string | null;
  scriptId?: string | null;
  lineId?: string | null;
}

export interface VoiceResult {
  asset: AssetRow;
  words: { text: string; start: number; end: number }[];
  durationS: number;
  costUsd: number;
  generationId: string;
}

/** Text to speech with word timings, saved to the library and recorded as a generation. */
export async function synthesizeVoice(ctx: JobContext, line: VoiceLine): Promise<VoiceResult> {
  const model = getModel(line.modelId ?? 'eleven-v3-tts');
  if (!model || model.capability !== 'tts') throw new PermanentError('Unknown voice model.');
  const params = resolveParams(model, { prompt: line.text, voiceId: line.voiceId });
  const quote = model.price(params, {});
  await assertBudget(ctx.sb, line.workspaceId, quote.usd);

  const { data: voice } = await ctx.sb.from('voices').select('id, is_cloned, consent_id').eq('workspace_id', line.workspaceId).eq('provider_voice_id', line.voiceId).maybeSingle();
  if (voice?.is_cloned) {
    const { data: consent } = await ctx.sb.from('consents').select('revoked_at').eq('id', voice.consent_id!).maybeSingle();
    if (!consent || consent.revoked_at) throw new PermanentError('Consent for this cloned voice was revoked. Choose another voice.', 'consent_required');
  }

  const { data: gen, error } = await ctx.sb
    .from('generations')
    .insert({
      workspace_id: line.workspaceId,
      created_by: ctx.job.created_by,
      project_id: line.projectId ?? null,
      capability: 'tts',
      provider: 'elevenlabs',
      model: model.id,
      prompt: line.text,
      params: params as unknown as Json,
      status: 'running',
      started_at: new Date().toISOString(),
      cost_estimate_usd: quote.usd,
      job_id: ctx.job.id,
      source_ref: { scriptId: line.scriptId ?? null, lineId: line.lineId ?? null } as Json,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Could not record voice generation: ${error.message}`);

  try {
    const key = await requireProviderKey(line.workspaceId, 'elevenlabs');
    const res = await elevenTts(key, line.voiceId, model.buildInput(params, {}), { withTimestamps: true });
    const words = alignmentToWords(res.alignment);
    const file = path.join(await ctx.tmp(), `voice-${gen.id}.mp3`);
    await writeFile(file, res.audio);
    const asset = await createAssetFromFile(ctx, {
      workspaceId: line.workspaceId,
      filePath: file,
      mime: 'audio/mpeg',
      name: line.name,
      source: 'generated',
      projectId: line.projectId ?? null,
      generationId: gen.id,
      isAiGenerated: true,
      meta: { role: 'voice', generator: { provider: 'elevenlabs', model: model.id, endpoint: model.endpoint } },
    });
    const text = line.text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    await ctx.sb.from('assets').update({ transcript: text, transcript_segments: asJson({ words, segments: segmentsFromWords(words), provider: 'elevenlabs', model: model.endpoint }) }).eq('id', asset.id);
    await ctx.sb.from('audio_tracks').insert({ workspace_id: line.workspaceId, asset_id: asset.id, kind: 'voiceover', voice_id: voice?.id ?? null, script_id: line.scriptId ?? null, line_id: line.lineId ?? null });
    await recordUsage(ctx.sb, { workspaceId: line.workspaceId, userId: ctx.job.created_by, kind: 'tts', provider: 'elevenlabs', model: model.id, units: line.text.length, unit: 'characters', costUsd: quote.usd, isEstimate: true, generationId: gen.id, jobId: ctx.job.id });
    await ctx.sb.from('generations').update({ status: 'succeeded', progress: 100, output_asset_ids: [asset.id], cost_actual_usd: quote.usd, completed_at: new Date().toISOString() }).eq('id', gen.id);
    const durationS = words.length ? words[words.length - 1]!.end + 0.25 : Math.max(1, text.split(/\s+/).length / 2.6);
    return { asset, words, durationS, costUsd: quote.usd, generationId: gen.id };
  } catch (err) {
    await ctx.sb.from('generations').update({ status: 'failed', error: (err as Error).message, completed_at: new Date().toISOString() }).eq('id', gen.id);
    throw err;
  }
}
