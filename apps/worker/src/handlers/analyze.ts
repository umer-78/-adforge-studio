import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  adScoreSchema,
  asJson,
  assetAnalysisSchema,
  audioRates,
  PLATFORM_SPECS,
  SYSTEM_PROMPTS,
  uniq,
  type AssetMeta,
  type AssetRow,
  type SocialPlatform,
} from '@adforge/core';
import { assertBudget, embed, providerKey, recordUsage, toPgVector, transcribe, EMBEDDING_MODEL, type TranscribeOutput } from '@adforge/core/server';
import { PermanentError } from '../lib/errors';
import { downloadAsset, loadAsset } from '../lib/files';
import { frameInputs, jpegInput, llmAvailable, runLlm } from '../lib/llm';
import { extractFrames, extractSpeechAudio, probe, sampleTimes, toJpeg } from '../media/ffmpeg';
import type { JobContext, JobHandler } from '../runner';

export interface StoredTranscript {
  segments: { text: string; start: number; end: number; speaker?: string }[];
  words: { text: string; start: number; end: number; speaker?: string }[];
  provider: string;
  model: string;
}

/** Transcribes an asset's speech once and stores it on the asset. Returns null when no provider is set up. */
export async function ensureTranscript(ctx: JobContext, asset: AssetRow, localFile?: string): Promise<StoredTranscript | null> {
  const existing = asset.transcript_segments as unknown as StoredTranscript | null;
  if (asset.transcript != null && existing?.words) return existing;
  const hasAudio = asset.type === 'audio' || (asset.type === 'video' && (asset.meta as AssetMeta).hasAudio !== false);
  if (!hasAudio) return null;
  const [openai, eleven] = await Promise.all([providerKey(asset.workspace_id, 'openai'), providerKey(asset.workspace_id, 'elevenlabs')]);
  if (!openai && !eleven) return null;

  const file = localFile ?? (await downloadAsset(ctx, asset));
  const durationS = asset.duration_s ?? (await probe(file, ctx.signal)).durationS ?? 60;
  const rate = eleven ? audioRates.transcribePerMinute : audioRates.openaiTranscribePerMinute;
  await assertBudget(ctx.sb, asset.workspace_id, (Math.max(durationS, 1) / 60) * rate);
  const mp3 = path.join(await ctx.tmp(), `${asset.id}-speech.mp3`);
  await extractSpeechAudio(file, mp3, ctx.signal);
  let res: TranscribeOutput;
  try {
    res = await transcribe(asset.workspace_id, { audio: await readFile(mp3), filename: 'speech.mp3', durationS, diarize: true });
  } catch (err) {
    if ((err as { code?: string }).code === 'audio_too_large') throw new PermanentError((err as Error).message);
    throw err;
  }
  await recordUsage(ctx.sb, {
    workspaceId: asset.workspace_id,
    userId: ctx.job.created_by,
    kind: 'transcription',
    provider: res.provider,
    model: res.model,
    units: Math.round((durationS / 60) * 100) / 100,
    unit: 'minute',
    costUsd: res.costUsd,
    isEstimate: res.provider === 'elevenlabs',
    jobId: ctx.job.id,
  });
  const stored: StoredTranscript = { segments: res.segments, words: res.words, provider: res.provider, model: res.model };
  const meta = { ...(asset.meta as AssetMeta) };
  if (asset.type === 'audio' && !meta.role) {
    // Speech-dense audio is a voice track; longer audio without much speech is most likely music.
    const wpm = res.words.length / Math.max(durationS / 60, 0.1);
    meta.role = wpm > 50 ? 'voice' : durationS > 15 ? 'music' : 'sfx';
    meta.roleSource = 'auto';
  }
  await ctx.sb
    .from('assets')
    .update({ transcript: res.text.trim(), transcript_language: res.language, transcript_segments: asJson(stored), meta: asJson(meta) })
    .eq('id', asset.id);
  asset.transcript = res.text.trim();
  asset.transcript_segments = asJson(stored);
  asset.meta = asJson(meta);
  return stored;
}

/** Frames (or the image itself) as LLM inputs. */
export async function visualInputs(ctx: JobContext, asset: AssetRow, file: string, count: number, size = 768, extraTimes: number[] = []) {
  const dir = await ctx.tmp();
  if (asset.type === 'image') {
    const jpg = path.join(dir, `${asset.id}-llm.jpg`);
    await toJpeg(file, jpg, 1280, ctx.signal);
    return [{ label: 'The image:', image: await jpegInput(jpg) }];
  }
  const duration = asset.duration_s ?? (await probe(file, ctx.signal)).durationS ?? 1;
  const times = uniq([...extraTimes.filter((t) => t < duration), ...sampleTimes(duration, count)].map((t) => Math.round(t * 10) / 10)).sort((a, b) => a - b);
  const frameDir = path.join(dir, `frames-${asset.id}`);
  await mkdir(frameDir, { recursive: true });
  return frameInputs(await extractFrames(file, times, frameDir, size, ctx.signal));
}

export function transcriptForPrompt(t: StoredTranscript | null, maxChars = 6000): string {
  if (!t?.segments.length) return 'No speech.';
  const lines = t.segments.map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}s]${s.speaker ? ` ${s.speaker}:` : ''} ${s.text}`);
  let out = '';
  for (const l of lines) {
    if (out.length + l.length > maxChars) break;
    out += `${l}\n`;
  }
  return out.trim();
}

export const mediaAnalyze: JobHandler<'media.analyze'> = {
  async run(ctx, { assetId, steps }) {
    const asset = await loadAsset(ctx.sb, ctx.workspaceId, assetId);
    if (asset.deleted_at) return { skipped: 'deleted' };
    const done: string[] = [];
    let file: string | null = null;
    const local = async () => (file ??= await downloadAsset(ctx, asset));

    if (steps.includes('transcribe') && (asset.type === 'video' || asset.type === 'audio')) {
      ctx.progress(10, 'Transcribing');
      if (await ensureTranscript(ctx, asset, await local())) {
        done.push('transcribe');
        // The words are known now: re-check sound-off and ad wording.
        if (asset.type === 'video') await ctx.enqueue('media.check', { assetId: asset.id, parts: ['soundOff', 'policy'] }, { idempotencyKey: `media.check:${asset.id}:words:${Date.now()}`, priority: -1 });
      }
    }

    if (steps.includes('tags') && (asset.type === 'video' || asset.type === 'image') && (await llmAvailable(ctx))) {
      ctx.progress(45, 'Tagging');
      const images = await visualInputs(ctx, asset, await local(), 6, 768);
      const transcript = asset.transcript ? `\nSpoken words (excerpt): ${asset.transcript.slice(0, 1500)}` : '';
      const { data } = await runLlm(ctx, {
        task: 'analyzeAsset',
        schema: assetAnalysisSchema,
        system: SYSTEM_PROMPTS.analyzeAsset,
        prompt: `Catalogue this ${asset.type} for the media library. File name: "${asset.name}".${asset.duration_s ? ` Duration: ${asset.duration_s}s.` : ''}${transcript}`,
        images,
        meta: { assetId: asset.id },
      });
      const meta = { ...(asset.meta as AssetMeta), analysis: data };
      if (!(meta.colors as string[] | undefined)?.length) meta.colors = data.colors;
      const tags = uniq(data.tags.map((t) => t.toLowerCase().trim()).filter(Boolean)).slice(0, 30);
      await ctx.sb.from('assets').update({ ai_caption: data.caption, ai_tags: tags, meta: asJson(meta) }).eq('id', asset.id);
      Object.assign(asset, { ai_caption: data.caption, ai_tags: tags, meta: asJson(meta) });
      done.push('tags');
    }

    if (steps.includes('embed')) {
      const key = await providerKey(asset.workspace_id, 'openai');
      if (key) {
        ctx.progress(85, 'Indexing for search');
        const content = [asset.name, asset.description, asset.ai_caption, [...asset.tags, ...asset.ai_tags].join(', '), asset.transcript?.slice(0, 6000)].filter(Boolean).join('\n');
        if (content.trim()) {
          const { vectors, costUsd } = await embed(key, [content]);
          const { error } = await ctx.sb
            .from('asset_embeddings')
            .upsert({ asset_id: asset.id, workspace_id: asset.workspace_id, content: content.slice(0, 20_000), embedding: toPgVector(vectors[0]!), model: EMBEDDING_MODEL, updated_at: new Date().toISOString() });
          if (error) throw new Error(`Could not save search index: ${error.message}`);
          await recordUsage(ctx.sb, { workspaceId: asset.workspace_id, kind: 'embedding', provider: 'openai', model: EMBEDDING_MODEL, units: Math.ceil(content.length / 4), unit: 'tokens', costUsd, jobId: ctx.job.id });
          done.push('embed');
        }
      }
    }
    return { done };
  },
};

export const mediaScore: JobHandler<'media.score'> = {
  async run(ctx, { assetId, platform }) {
    const asset = await loadAsset(ctx.sb, ctx.workspaceId, assetId);
    if (asset.type !== 'video' && asset.type !== 'image') throw new PermanentError('Ad scoring works on videos and images.');
    if (!(await llmAvailable(ctx))) throw new PermanentError('Add a Claude API key in Settings → Providers to score ads.');
    ctx.progress(5, 'Reading ad');
    const file = await downloadAsset(ctx, asset);
    ctx.progress(20, 'Listening');
    const transcript = await ensureTranscript(ctx, asset, file).catch((err) => {
      ctx.log.warn({ err: (err as Error).message }, 'transcription skipped');
      return null;
    });
    ctx.progress(45, 'Watching');
    const images = await visualInputs(ctx, asset, file, 10, 768, [0, 0.5, 1, 1.5, 3]);
    const spec = platform && platform in PLATFORM_SPECS ? PLATFORM_SPECS[platform as SocialPlatform] : null;
    const facts = [
      `Format: ${asset.type}${asset.width && asset.height ? `, ${asset.width}×${asset.height}` : ''}${asset.duration_s ? `, ${asset.duration_s}s` : ''}.`,
      spec ? `Target platform: ${spec.label} (preferred ${spec.preferredAspect}, ${spec.minDurationS}–${spec.maxDurationS}s). ${spec.notes}` : 'Target platform: short-form social feeds (TikTok, Reels, Shorts).',
      `Transcript with timestamps:\n${transcriptForPrompt(transcript)}`,
      asset.ai_caption ? `Library description: ${asset.ai_caption}` : '',
    ].filter(Boolean);
    ctx.progress(60, 'Scoring');
    const { data, model } = await runLlm(ctx, {
      task: 'scoreAd',
      schema: adScoreSchema,
      system: SYSTEM_PROMPTS.scoreAd,
      prompt: `Review this ad before launch.\n\n${facts.join('\n\n')}`,
      images,
      meta: { assetId: asset.id, platform: platform ?? null },
    });
    const meta = { ...(asset.meta as AssetMeta), score: { ...data, platform: platform ?? null, model, scoredAt: new Date().toISOString() } };
    await ctx.sb.from('assets').update({ meta: asJson(meta) }).eq('id', asset.id);
    return { overall: data.overall, outlook: data.outlook };
  },
};
