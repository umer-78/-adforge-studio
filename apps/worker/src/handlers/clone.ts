import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  adStructureSchema,
  asJson,
  brandContext,
  inspirationAnalysisSchema,
  isRecord,
  scriptDraftSchema,
  SYSTEM_PROMPTS,
  type AdBlueprintRow,
  type AdStructure,
  type AssetRow,
  type InspirationAdRow,
} from '@adforge/core';
import { safeFetch } from '@adforge/core/server';
import { PermanentError } from '../lib/errors';
import { downloadAsset, loadAsset } from '../lib/files';
import { frameInputs, jpegInput, llmAvailable, runLlm } from '../lib/llm';
import { insertScript, productFacts, storyboardFromScript, workspaceBrand } from '../lib/storyboard';
import { insertTimeline } from '../lib/timeline-edit';
import { detectScenes, extractFrames, probe, toJpeg } from '../media/ffmpeg';
import type { JobContext, JobHandler } from '../runner';
import { ensureTranscript, transcriptForPrompt, visualInputs } from './analyze';

async function loadBlueprint(ctx: JobContext, id: string): Promise<AdBlueprintRow> {
  const { data } = await ctx.sb.from('ad_blueprints').select('*').eq('id', id).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (!data) throw new PermanentError('This ad clone no longer exists.');
  return data;
}

/** A remote thumbnail as a JPEG image input (inspiration ads saved without the video). */
async function remoteImage(ctx: JobContext, url: string) {
  const res = await safeFetch(url, { maxBytes: 12 * 1024 ** 2, timeoutMs: 20_000 });
  if (!res.ok || !res.contentType.startsWith('image/')) return null;
  const dir = await ctx.tmp();
  const raw = path.join(dir, `thumb-${Date.now()}`);
  const jpg = `${raw}.jpg`;
  await writeFile(raw, res.body);
  await toJpeg(raw, jpg, 1280, ctx.signal);
  return jpegInput(jpg);
}

async function analyze(ctx: JobContext, bp: AdBlueprintRow) {
  let reference: AssetRow | null = bp.reference_asset_id ? await loadAsset(ctx.sb, bp.workspace_id, bp.reference_asset_id) : null;
  let inspiration: InspirationAdRow | null = null;
  if (bp.inspiration_ad_id) {
    const { data } = await ctx.sb.from('inspiration_ads').select('*').eq('id', bp.inspiration_ad_id).eq('workspace_id', bp.workspace_id).maybeSingle();
    inspiration = data;
    if (!reference && data?.asset_id) reference = await loadAsset(ctx.sb, bp.workspace_id, data.asset_id);
  }
  if (!reference && !inspiration) throw new PermanentError('Pick a reference video or a saved ad to clone.');

  const facts: string[] = [];
  let images: Awaited<ReturnType<typeof frameInputs>> = [];
  let cuts: number[] = [];
  if (reference?.type === 'video') {
    ctx.progress(10, 'Reading the reference');
    const file = await downloadAsset(ctx, reference);
    const p = await probe(file, ctx.signal);
    const duration = p.durationS ?? Number(reference.duration_s ?? 0);
    if (!duration) throw new PermanentError('Could not read the reference video.');
    ctx.progress(20, 'Finding cuts');
    cuts = await detectScenes(file, 0.3, ctx.signal).catch(() => []);
    ctx.progress(30, 'Transcribing');
    const transcript = await ensureTranscript(ctx, reference, file).catch(() => null);
    ctx.progress(45, 'Watching');
    const count = Math.min(30, Math.max(8, Math.ceil(duration)));
    const times = Array.from({ length: count }, (_, i) => Math.min(duration - 0.05, (i * duration) / count + 0.05));
    const dir = path.join(await ctx.tmp(), 'clone-frames');
    await mkdir(dir, { recursive: true });
    images = await frameInputs(await extractFrames(file, times, dir, 512, ctx.signal));
    facts.push(`Duration: ${duration.toFixed(1)}s. Measured cuts at: ${cuts.map((c) => `${c.toFixed(1)}s`).join(', ') || 'none detected'} (${((cuts.length / duration) * 60).toFixed(0)} per minute).`);
    facts.push(`Transcript with timestamps:\n${transcriptForPrompt(transcript)}`);
  } else if (reference) {
    images = await visualInputs(ctx, reference, await downloadAsset(ctx, reference), 1);
  } else if (inspiration?.thumbnail_url) {
    const img = await remoteImage(ctx, inspiration.thumbnail_url).catch(() => null);
    if (img) images = [{ label: 'Ad thumbnail:', image: img }];
  }
  if (inspiration) {
    facts.push(`Ad copy — brand: ${inspiration.brand}; headline: ${inspiration.headline ?? 'n/a'}; body: ${inspiration.body ?? 'n/a'}; CTA: ${inspiration.cta ?? 'n/a'}.`);
    if (isRecord(inspiration.metrics) && inspiration.metrics.daysRunning) facts.push(`It has been running for ${inspiration.metrics.daysRunning} days (long-running ads are usually profitable).`);
  }
  if (!images.length && !reference) facts.push('Only the ad copy is available; infer a likely structure for a short video ad and say so in the summary.');

  ctx.progress(60, 'Mapping the structure');
  const { data, model } = await runLlm(ctx, {
    task: 'analyzeAdStructure',
    schema: adStructureSchema,
    system: SYSTEM_PROMPTS.analyzeAdStructure,
    prompt: `Map this ad beat by beat.\n\n${facts.join('\n\n')}`,
    images,
    meta: { blueprintId: bp.id },
  });
  await ctx.sb
    .from('ad_blueprints')
    .update({ structure: asJson(data), analysis: asJson({ cuts, frames: images.length, model, referenceAssetId: reference?.id ?? null, analyzedAt: new Date().toISOString() }), status: 'ready', error: null })
    .eq('id', bp.id);
  return data;
}

async function adapt(ctx: JobContext, bp: AdBlueprintRow) {
  const structure = adStructureSchema.safeParse(bp.structure);
  if (!structure.success || !structure.data.beats.length) throw new PermanentError('Analyze the reference ad first.');
  if (!bp.product_id) throw new PermanentError('Pick the product to adapt this ad to.');
  const { data: product } = await ctx.sb.from('products').select('*').eq('id', bp.product_id).eq('workspace_id', bp.workspace_id).maybeSingle();
  if (!product || product.status !== 'ready') throw new PermanentError('The product is not imported yet.');
  const s: AdStructure = structure.data;
  const { brand, tone } = await workspaceBrand(ctx.sb, bp.workspace_id);

  ctx.progress(20, 'Writing the new ad');
  const { data: draft } = await runLlm(ctx, {
    task: 'writeScript',
    schema: scriptDraftSchema,
    system: SYSTEM_PROMPTS.adaptAdStructure,
    prompt: [
      `Reference structure (${s.format}, ${s.durationS.toFixed(0)}s, ${s.cutsPerMinute.toFixed(0)} cuts/min, hook type: ${s.hookType}, music: ${s.musicMood}):`,
      s.beats.map((b, i) => `${i + 1}. ${b.startS.toFixed(1)}–${b.endS.toFixed(1)}s ${b.role}: ${b.description} | shot: ${b.shotType}, ${b.camera}${b.onScreenText ? ` | text: ${b.onScreenText}` : ''}${b.voiceover ? ` | VO: ${b.voiceover}` : ''}`).join('\n'),
      `Why it works: ${s.whyItWorks.join('; ')}`,
      `Adaptation notes: ${s.adaptationNotes}`,
      `New product:\n${productFacts(product)}`,
      `Write one line per beat with the same timing. Total ${Math.round(s.durationS)}s.${brandContext({ name: product.brand_name, tone, colors: Array.isArray(product.colors) ? (product.colors as string[]) : [] })}`,
    ].join('\n\n'),
    meta: { blueprintId: bp.id },
  });

  ctx.progress(70, 'Building the storyboard');
  const aspect = s.durationS && bp.reference_asset_id ? await referenceAspect(ctx, bp.reference_asset_id) : '9:16';
  const board = storyboardFromScript(draft, { aspect, brand, productImageIds: product.image_asset_ids, logoAssetId: product.logo_asset_id });
  const { script } = await insertScript(ctx.sb, { workspaceId: bp.workspace_id, draft, brief: { source: 'ad_clone', blueprintId: bp.id, productId: product.id }, createdBy: bp.created_by });
  const timeline = await insertTimeline(ctx.sb, { workspaceId: bp.workspace_id, name: `${bp.name} · ${product.title ?? 'Product'}`, data: board.timeline, createdBy: bp.created_by });
  await ctx.sb.from('scripts').update({ timeline_id: timeline.id, storyboard: asJson(board.slots) }).eq('id', script.id);
  await ctx.sb.from('ad_blueprints').update({ script_id: script.id, timeline_id: timeline.id, status: 'ready', error: null }).eq('id', bp.id);
  return { scriptId: script.id, timelineId: timeline.id, emptySlots: board.slots.length };
}

async function referenceAspect(ctx: JobContext, assetId: string) {
  const { data } = await ctx.sb.from('assets').select('width, height').eq('id', assetId).maybeSingle();
  if (!data?.width || !data.height) return '9:16' as const;
  const r = data.width / data.height;
  return r < 0.7 ? ('9:16' as const) : r < 0.9 ? ('4:5' as const) : r < 1.3 ? ('1:1' as const) : ('16:9' as const);
}

export const adClone: JobHandler<'ad.clone'> = {
  async run(ctx, { blueprintId, step }) {
    if (!(await llmAvailable(ctx))) throw new PermanentError('Add a Claude API key in Settings → Providers to clone ads.');
    const bp = await loadBlueprint(ctx, blueprintId);
    if (step === 'analyze') {
      await ctx.sb.from('ad_blueprints').update({ status: 'analyzing', error: null, job_id: ctx.job.id }).eq('id', bp.id);
      const structure = await analyze(ctx, bp);
      if (bp.product_id) {
        const next = await ctx.enqueue('ad.clone', { blueprintId, step: 'adapt' }, { idempotencyKey: `ad.clone:${blueprintId}:adapt:${Date.now()}` });
        await ctx.sb.from('ad_blueprints').update({ job_id: next.id }).eq('id', bp.id);
      }
      return { beats: structure.beats.length, format: structure.format };
    }
    await ctx.sb.from('ad_blueprints').update({ job_id: ctx.job.id, error: null }).eq('id', bp.id);
    return adapt(ctx, bp);
  },
  async onFailure(ctx, { blueprintId }, message) {
    await ctx.sb.from('ad_blueprints').update({ status: 'failed', error: message }).eq('id', blueprintId);
  },
};

export const inspirationAnalyze: JobHandler<'inspiration.analyze'> = {
  async run(ctx, { inspirationAdId }) {
    if (!(await llmAvailable(ctx))) throw new PermanentError('Add a Claude API key in Settings → Providers to analyze ads.');
    const { data: ad } = await ctx.sb.from('inspiration_ads').select('*').eq('id', inspirationAdId).eq('workspace_id', ctx.workspaceId).maybeSingle();
    if (!ad) throw new PermanentError('This saved ad no longer exists.');
    const facts = [`Brand: ${ad.brand}. Platform: ${ad.platform}.`, `Headline: ${ad.headline ?? 'n/a'}`, `Body: ${ad.body ?? 'n/a'}`, `CTA: ${ad.cta ?? 'n/a'}`];
    if (isRecord(ad.metrics) && ad.metrics.daysRunning != null) facts.push(`Running for ${ad.metrics.daysRunning} days${ad.status === 'active' ? ' and still active' : ''}.`);
    let images: Awaited<ReturnType<typeof frameInputs>> = [];
    if (ad.asset_id) {
      const asset = await loadAsset(ctx.sb, ad.workspace_id, ad.asset_id);
      const file = await downloadAsset(ctx, asset);
      images = await visualInputs(ctx, asset, file, 8, 640, [0, 1, 2]);
      const transcript = asset.type === 'video' ? await ensureTranscript(ctx, asset, file).catch(() => null) : null;
      if (transcript) facts.push(`Transcript:\n${transcriptForPrompt(transcript, 3000)}`);
    } else if (ad.thumbnail_url) {
      const img = await remoteImage(ctx, ad.thumbnail_url).catch(() => null);
      if (img) images = [{ label: 'Ad creative:', image: img }];
    }
    const { data, model } = await runLlm(ctx, {
      task: 'analyzeAdStructure',
      schema: inspirationAnalysisSchema,
      system: SYSTEM_PROMPTS.analyzeInspiration,
      prompt: facts.join('\n'),
      images,
      meta: { inspirationAdId },
    });
    await ctx.sb.from('inspiration_ads').update({ analysis: asJson({ ...data, model, analyzedAt: new Date().toISOString() }), last_checked_at: new Date().toISOString() }).eq('id', ad.id);
    return { ideas: data.ideasForUs.length };
  },
};
