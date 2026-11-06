import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  applyPronunciations,
  parseWorkspaceSettings,
  asJson,
  CAPABILITIES,
  expandReferences,
  getModel,
  isRecord,
  resolveParams,
  SIGNED_URL_TTL,
  truncate,
  type AssetRow,
  type GenerationRow,
  type GenParams,
  type ModelDef,
  type OutputFile,
  type ResolvedInputs,
  type Update,
} from '@adforge/core';
import {
  agnesImage,
  agnesVideoCreate,
  agnesVideoStatus,
  alignmentToWords,
  assertBudget,
  elevenDialogue,
  elevenDubCreate,
  elevenDubResult,
  elevenDubStatus,
  elevenIsolate,
  elevenMusic,
  elevenSfx,
  elevenSts,
  elevenTranscribe,
  elevenTts,
  env,
  falCancel,
  falResult,
  falStatus,
  falSubmit,
  moderate,
  providerKey,
  publicWebhookBase,
  recordUsage,
  replicateCancel,
  replicateCreate,
  replicateGet,
  requireProviderKey,
  segmentsFromWords,
  transcribeWhisper,
  type KeyProvider,
} from '@adforge/core/server';
import { activity } from '../lib/activity';
import { PermanentError } from '../lib/errors';
import { createAssetFromFile, detectMime, downloadAsset, downloadUrl, generatedLicense, loadAssets, signedAssetUrl } from '../lib/files';
import { extractSpeechAudio } from '../media/ffmpeg';
import { reschedule, type JobContext, type JobHandler } from '../runner';

/* --------------------------------- Helpers --------------------------------- */

async function loadGeneration(ctx: JobContext, id: string): Promise<GenerationRow> {
  const { data, error } = await ctx.sb.from('generations').select('*').eq('id', id).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (error) throw new Error(`Could not load generation: ${error.message}`);
  if (!data) throw new PermanentError('This generation no longer exists.');
  return data;
}

function modelOf(gen: GenerationRow): ModelDef {
  const model = getModel(gen.model);
  if (!model) throw new PermanentError(`The model ${gen.model} is no longer available.`);
  return model;
}

const sourceRef = (gen: GenerationRow): Record<string, unknown> => (isRecord(gen.source_ref) ? gen.source_ref : {});

async function setGeneration(ctx: JobContext, id: string, patch: Update<'generations'>) {
  const { error } = await ctx.sb.from('generations').update(patch).eq('id', id);
  if (error) throw new Error(`Could not update generation: ${error.message}`);
}

interface InputAssets {
  inputs: ResolvedInputs;
  assets: Map<string, AssetRow>;
}

/** Signed URLs for every input asset, checked against what the model needs. */
async function resolveInputs(ctx: JobContext, model: ModelDef, p: GenParams): Promise<InputAssets> {
  const ids = [p.imageAssetId, p.endImageAssetId, p.videoAssetId, p.audioAssetId, ...(p.referenceAssetIds ?? []), ...(p.referenceAudioAssetIds ?? [])].filter((v): v is string => !!v);
  const assets = await loadAssets(ctx.sb, ctx.workspaceId, ids);
  const url = async (id: string | undefined, types: string[], label: string) => {
    if (!id) return undefined;
    const a = assets.get(id);
    if (!a || a.deleted_at) throw new PermanentError(`The ${label} file no longer exists.`);
    if (!types.includes(a.type)) throw new PermanentError(`The ${label} must be ${types.join(' or ')}.`);
    if (a.status !== 'ready') throw new Error(`The ${label} file is still processing`);
    return signedAssetUrl(a, SIGNED_URL_TTL.provider);
  };
  const inputs: ResolvedInputs = {};
  const image = await url(p.imageAssetId, ['image'], 'start image');
  const endImage = await url(p.endImageAssetId, ['image'], 'end image');
  const video = await url(p.videoAssetId, ['video'], 'input video');
  const audio = await url(p.audioAssetId, ['audio', 'video'], 'input audio');
  if (image) inputs.image = image;
  if (endImage) inputs.endImage = endImage;
  if (video) inputs.video = video;
  if (audio) inputs.audio = audio;
  if (p.referenceAssetIds?.length) inputs.references = (await Promise.all(p.referenceAssetIds.map((id) => url(id, ['image'], 'reference image')))).filter((u): u is string => !!u);
  if (p.referenceAudioAssetIds?.length) inputs.referenceAudios = (await Promise.all(p.referenceAudioAssetIds.map((id) => url(id, ['audio', 'video'], 'reference audio')))).filter((u): u is string => !!u);
  const media = (p.videoAssetId && assets.get(p.videoAssetId)) || (p.audioAssetId && assets.get(p.audioAssetId)) || null;
  const still = (p.imageAssetId && assets.get(p.imageAssetId)) || null;
  if (media?.duration_s) inputs.inputDurationS = Number(media.duration_s);
  const sized = (p.videoAssetId && assets.get(p.videoAssetId)) || still;
  if (sized && sized.width && sized.height) {
    inputs.inputWidth = sized.width;
    inputs.inputHeight = sized.height;
  }

  const need = model.inputs ?? {};
  if (need.image === 'required' && !inputs.image) throw new PermanentError(`${model.label} needs a start image.`);
  if (need.video === 'required' && !inputs.video) throw new PermanentError(`${model.label} needs an input video.`);
  if (need.audio === 'required' && !inputs.audio) throw new PermanentError(`${model.label} needs an input audio file.`);
  const max = model.controls.maxInputDurationS;
  if (max && inputs.inputDurationS && inputs.inputDurationS > max) throw new PermanentError(`${model.label} accepts inputs up to ${max}s; this one is ${Math.round(inputs.inputDurationS)}s.`);
  return { inputs, assets };
}

/* ---------------------------------- Safety ---------------------------------- */

const HARD_BLOCK = /\b(child|minor|underage|kid|teen|schoolgirl|schoolboy|preteen)\b[^.]{0,60}\b(nude|naked|sexual|explicit|porn|erotic)|\b(nude|naked|sexual|explicit|porn|erotic)\b[^.]{0,60}\b(child|minor|underage|kid|preteen)\b/i;

async function moderatePrompt(ctx: JobContext, gen: GenerationRow, p: GenParams, inputs: ResolvedInputs) {
  const text = [p.prompt, p.negativePrompt ? '' : '', p.lyrics].filter(Boolean).join('\n');
  if (HARD_BLOCK.test(text)) throw new PermanentError('This request was blocked by the content policy.', 'content_blocked');
  const key = await providerKey(gen.workspace_id, 'openai');
  if (!key || (!text.trim() && !inputs.image)) return;
  const res = await moderate(key, text, inputs.image ? [inputs.image] : []);
  await recordUsage(ctx.sb, { workspaceId: gen.workspace_id, kind: 'moderation', provider: 'openai', model: 'omni-moderation-latest', units: 1, unit: 'request', costUsd: 0, generationId: gen.id, jobId: ctx.job.id, meta: { flagged: res.flagged, categories: res.categories } });
  if (res.flagged) throw new PermanentError(`This request was blocked by content moderation (${res.categories.slice(0, 3).join(', ') || 'policy'}).`, 'content_blocked');
}

const LIKENESS_CAPS = new Set(['lipsync', 'avatar', 'dub']);

/** Likeness and voice features need recorded consent unless every input is AI-generated. */
async function checkConsent(ctx: JobContext, gen: GenerationRow, model: ModelDef, p: GenParams, assets: Map<string, AssetRow>) {
  if (LIKENESS_CAPS.has(model.capability)) {
    const people = [p.imageAssetId, p.videoAssetId].map((id) => (id ? assets.get(id) : undefined)).filter((a): a is AssetRow => !!a);
    if (people.length && people.every((a) => a.is_ai_generated)) return;
    const consentId = sourceRef(gen).consentId;
    if (typeof consentId !== 'string') throw new PermanentError('Record consent from the person shown before using their likeness or voice.', 'consent_required');
    const { data } = await ctx.sb.from('consents').select('kind, revoked_at').eq('id', consentId).eq('workspace_id', gen.workspace_id).maybeSingle();
    if (!data || data.revoked_at) throw new PermanentError('The consent for this person was revoked or not found.', 'consent_required');
  }
  if (p.voiceId && (model.capability === 'tts' || model.capability === 'sts' || model.capability === 'dialogue')) {
    const { data } = await ctx.sb.from('voices').select('is_cloned, consent_id').eq('workspace_id', gen.workspace_id).eq('provider_voice_id', p.voiceId).maybeSingle();
    if (data?.is_cloned) {
      const { data: consent } = await ctx.sb.from('consents').select('revoked_at').eq('id', data.consent_id!).maybeSingle();
      if (!consent || consent.revoked_at) throw new PermanentError('Consent for this cloned voice was revoked. Choose another voice.', 'consent_required');
    }
  }
}

/* --------------------------------- Outputs --------------------------------- */

function outputName(gen: GenerationRow, model: ModelDef, i: number, n: number): string {
  const base = (gen.prompt ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  const title = base ? truncate(base, 60) : CAPABILITIES[model.capability as keyof typeof CAPABILITIES]?.label ?? 'Generation';
  return `${title}${n > 1 ? ` (${i + 1})` : ''}`;
}

/** Outputs that are a processed copy of their input are linked to it as a child version. */
const DERIVED_CAPABILITIES = new Set(['stems', 'isolate', 'upscale_video', 'upscale_image', 'remove_bg_image', 'remove_bg_video', 'interpolate', 'dub', 'depth']);

const usageKind = (capability: string) => (capability === 'tts' || capability === 'dialogue' || capability === 'sts' ? 'tts' : capability === 'music' ? 'music' : capability === 'transcribe' ? 'transcription' : 'generation');

interface SavedOutput {
  asset: AssetRow;
  extra?: Record<string, unknown>;
}

/** Marks the generation done, records its cost and links the outputs. */
async function completeGeneration(ctx: JobContext, gen: GenerationRow, model: ModelDef, outputs: SavedOutput[], raw: unknown) {
  const cost = Number(gen.cost_estimate_usd ?? 0);
  await recordUsage(ctx.sb, {
    workspaceId: gen.workspace_id,
    userId: gen.created_by,
    kind: usageKind(model.capability),
    provider: model.provider,
    model: model.id,
    units: Math.max(1, outputs.length),
    unit: 'output',
    costUsd: cost,
    isEstimate: true,
    generationId: gen.id,
    jobId: ctx.job.id,
  });
  await setGeneration(ctx, gen.id, {
    status: 'succeeded',
    progress: 100,
    output_asset_ids: outputs.map((o) => o.asset.id),
    output: asJson(trimRaw(raw)),
    cost_actual_usd: cost,
    completed_at: new Date().toISOString(),
    error: null,
  });
  await activity(ctx.sb, { workspaceId: gen.workspace_id, actorId: gen.created_by, verb: 'generated', objectType: 'generation', objectId: gen.id, data: { model: model.label, capability: model.capability, outputs: outputs.length } });
}

/** Keeps provider metadata but drops huge arrays (e.g. embeddings, logs). */
function trimRaw(raw: unknown): unknown {
  const json = JSON.stringify(raw ?? null);
  if (json.length < 20_000) return raw ?? null;
  return { truncated: true, preview: json.slice(0, 20_000) };
}

async function saveOutputFile(ctx: JobContext, gen: GenerationRow, model: ModelDef, filePath: string, mime: string | null, i: number, n: number, licenseId: string | null, meta: Record<string, unknown> = {}, parentAssetId: string | null = null) {
  return createAssetFromFile(ctx, {
    workspaceId: gen.workspace_id,
    filePath,
    mime,
    name: outputName(gen, model, i, n),
    source: 'generated',
    createdBy: gen.created_by,
    projectId: gen.project_id,
    generationId: gen.id,
    isAiGenerated: true,
    licenseId,
    parentAssetId,
    meta: { generator: { provider: model.provider, model: model.id, endpoint: model.endpoint }, prompt: gen.prompt, seed: gen.seed, ...meta },
  });
}

/** Side records that make generated audio show up in the right libraries. */
async function audioSideRows(ctx: JobContext, gen: GenerationRow, model: ModelDef, asset: AssetRow, p: GenParams, licenseId: string | null) {
  const ref = sourceRef(gen);
  const voiceRow = p.voiceId ? (await ctx.sb.from('voices').select('id').eq('workspace_id', gen.workspace_id).eq('provider_voice_id', p.voiceId).maybeSingle()).data : null;
  const track = (kind: 'voiceover' | 'music' | 'sfx' | 'stem' | 'other', extra: Record<string, unknown> = {}) =>
    ctx.sb.from('audio_tracks').insert({
      workspace_id: gen.workspace_id,
      asset_id: asset.id,
      kind,
      voice_id: voiceRow?.id ?? null,
      script_id: typeof ref.scriptId === 'string' ? ref.scriptId : null,
      line_id: typeof ref.lineId === 'string' ? ref.lineId : null,
      license_id: licenseId,
      ...extra,
    });
  switch (model.capability) {
    case 'tts':
    case 'dialogue':
    case 'sts':
    case 'isolate':
      await track('voiceover');
      break;
    case 'music':
      await track('music');
      await ctx.sb.from('music').insert({
        workspace_id: gen.workspace_id,
        asset_id: asset.id,
        title: truncate((gen.prompt ?? 'Generated track').split('\n')[0]!, 120),
        mood: typeof ref.mood === 'string' ? ref.mood : null,
        genre: typeof ref.genre === 'string' ? ref.genre : null,
        instrumental: !!p.instrumental,
        lyrics: p.lyrics ?? null,
        duration_s: p.durationS ?? null,
        generation_id: gen.id,
        license_id: licenseId,
        is_audio_logo: !!ref.audioLogo,
        created_by: gen.created_by,
      });
      break;
    case 'sfx':
      await track('sfx');
      await ctx.sb.from('sfx').insert({
        workspace_id: gen.workspace_id,
        asset_id: asset.id,
        name: truncate(gen.prompt ?? 'Sound effect', 80),
        category: typeof ref.category === 'string' ? ref.category : 'generated',
        tags: ['generated'],
        duration_s: p.durationS ?? null,
        generation_id: gen.id,
        license_id: licenseId,
      });
      break;
    default:
      break;
  }
}

/* -------------------------------- ElevenLabs -------------------------------- */

async function inputAudioBlob(ctx: JobContext, assets: Map<string, AssetRow>, id: string | undefined): Promise<Blob> {
  const a = id ? assets.get(id) : undefined;
  if (!a) throw new PermanentError('Pick an input audio file.');
  const file = await downloadAsset(ctx, a);
  const mp3 = path.join(await ctx.tmp(), `${a.id}-input.mp3`);
  await extractSpeechAudio(file, mp3, ctx.signal).catch(async () => {
    throw new PermanentError('Could not read audio from the input file.');
  });
  return new Blob([new Uint8Array(await readFile(mp3))], { type: 'audio/mpeg' });
}

async function pronunciationsFor(ctx: JobContext, workspaceId: string) {
  const { data } = await ctx.sb.from('workspaces').select('settings').eq('id', workspaceId).maybeSingle();
  return parseWorkspaceSettings(data?.settings).pronunciations;
}

interface DialogueLine {
  text: string;
  voiceId: string;
}

function dialogueLines(gen: GenerationRow, p: GenParams): DialogueLine[] {
  const ref = sourceRef(gen);
  if (Array.isArray(ref.dialogue)) {
    return ref.dialogue
      .filter((l): l is { text: string; voiceId: string } => isRecord(l) && typeof l.text === 'string' && typeof l.voiceId === 'string')
      .map((l) => ({ text: l.text, voiceId: l.voiceId }));
  }
  // "Name: line" per row, with voices mapped by speaker name.
  const voices = isRecord(ref.voices) ? (ref.voices as Record<string, string>) : {};
  return p.prompt
    .split('\n')
    .map((row) => /^\s*([^:]{1,40}):\s*(.+)$/.exec(row))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ text: m[2]!.trim(), voiceId: voices[m[1]!.trim()] ?? p.voiceId ?? '' }))
    .filter((l) => l.voiceId);
}

/** ElevenLabs calls return audio directly, except dubbing which is polled. */
async function runElevenLabs(ctx: JobContext, gen: GenerationRow, model: ModelDef, p: GenParams, inputs: ResolvedInputs, assets: Map<string, AssetRow>): Promise<'done' | 'submitted'> {
  const key = await requireProviderKey(gen.workspace_id, 'elevenlabs');
  const dir = await ctx.tmp();
  const body = model.buildInput(p, inputs);
  // The workspace's pronunciations (brand names, initialisms) apply to everything spoken.
  const spoken = model.capability === 'tts' || model.capability === 'dialogue' ? await pronunciationsFor(ctx, gen.workspace_id) : [];
  if (spoken.length && typeof body.text === 'string') body.text = applyPronunciations(body.text, spoken);
  let audio: Buffer;
  const meta: Record<string, unknown> = { role: model.capability === 'music' ? 'music' : model.capability === 'sfx' ? 'sfx' : 'voice' };
  let transcript: { text: string; words: { text: string; start: number; end: number }[] } | null = null;

  switch (model.capability) {
    case 'tts': {
      if (!p.voiceId) throw new PermanentError('Choose a voice.');
      const res = await elevenTts(key, p.voiceId, body, { withTimestamps: true });
      audio = res.audio;
      const words = alignmentToWords(res.alignment);
      transcript = { text: p.prompt.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim(), words };
      break;
    }
    case 'dialogue': {
      const lines = dialogueLines(gen, p);
      if (!lines.length) throw new PermanentError('Add dialogue lines with a voice for each speaker.');
      audio = await elevenDialogue(key, lines.map((l) => ({ text: applyPronunciations(l.text, spoken), voice_id: l.voiceId })), String(body.model_id ?? 'eleven_v3'));
      break;
    }
    case 'sts': {
      if (!p.voiceId) throw new PermanentError('Choose a target voice.');
      const blob = await inputAudioBlob(ctx, assets, p.audioAssetId);
      audio = await elevenSts(key, p.voiceId, blob, Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])));
      break;
    }
    case 'music':
      audio = await elevenMusic(key, body);
      break;
    case 'sfx':
      audio = await elevenSfx(key, body);
      break;
    case 'isolate':
      audio = await elevenIsolate(key, await inputAudioBlob(ctx, assets, p.audioAssetId));
      break;
    case 'dub': {
      if (!inputs.video) throw new PermanentError('Pick a video to dub.');
      const res = await elevenDubCreate(key, { sourceUrl: inputs.video, targetLang: p.language ?? 'es', name: truncate(gen.prompt ?? 'Dub', 60) });
      await setGeneration(ctx, gen.id, { provider_request_id: res.id, eta_seconds: Math.round(res.expectedS) });
      return 'submitted';
    }
    case 'transcribe':
      await runTranscription(ctx, gen, model, p, assets, key);
      return 'done';
    default:
      throw new PermanentError(`${model.label} is not supported by the worker.`);
  }

  ctx.checkAborted();
  const file = path.join(dir, `${gen.id}.mp3`);
  await writeFile(file, audio);
  const licenseId = model.capability === 'music' || model.capability === 'sfx' ? await generatedLicense(ctx, gen.workspace_id, 'elevenlabs', `${model.label}; commercial use per your ElevenLabs plan terms`) : null;
  const parent = model.capability === 'isolate' || model.capability === 'sts' ? (p.audioAssetId ?? null) : null;
  const asset = await saveOutputFile(ctx, gen, model, file, 'audio/mpeg', 0, 1, licenseId, meta, parent);
  if (transcript) {
    await ctx.sb
      .from('assets')
      .update({ transcript: transcript.text, transcript_segments: asJson({ words: transcript.words, segments: segmentsFromWords(transcript.words), provider: 'elevenlabs', model: model.endpoint }) })
      .eq('id', asset.id);
  }
  await audioSideRows(ctx, gen, model, asset, p, licenseId);
  await completeGeneration(ctx, gen, model, [{ asset }], { model: model.endpoint });
  return 'done';
}

/** Transcription "generation": the transcript lands on the input asset. */
async function runTranscription(ctx: JobContext, gen: GenerationRow, model: ModelDef, p: GenParams, assets: Map<string, AssetRow>, key: string) {
  const source = p.audioAssetId ? assets.get(p.audioAssetId) : p.videoAssetId ? assets.get(p.videoAssetId) : undefined;
  if (!source) throw new PermanentError('Pick a file to transcribe.');
  const file = await downloadAsset(ctx, source);
  const mp3 = path.join(await ctx.tmp(), 'speech.mp3');
  await extractSpeechAudio(file, mp3, ctx.signal);
  let text: string;
  let language: string | null;
  let words: { text: string; start: number; end: number; speaker?: string }[];
  if (model.provider === 'elevenlabs') {
    const fields = Object.fromEntries(Object.entries(model.buildInput(p, {})).map(([k, v]) => [k, String(v)]));
    const res = await elevenTranscribe(key, { file: new Blob([new Uint8Array(await readFile(mp3))], { type: 'audio/mpeg' }) }, fields);
    text = res.text;
    language = res.language_code ?? null;
    words = res.words.filter((w) => w.type === 'word').map((w) => ({ text: w.text, start: w.start, end: w.end, ...(w.speaker_id ? { speaker: w.speaker_id } : {}) }));
  } else {
    const res = await transcribeWhisper(key, await readFile(mp3), 'speech.mp3', p.language);
    text = res.text;
    language = res.language;
    words = res.words;
  }
  const stored = { words, segments: segmentsFromWords(words), provider: model.provider, model: model.endpoint };
  await ctx.sb.from('assets').update({ transcript: text.trim(), transcript_language: language, transcript_segments: asJson(stored) }).eq('id', source.id);
  const cost = Number(gen.cost_estimate_usd ?? 0);
  await recordUsage(ctx.sb, { workspaceId: gen.workspace_id, userId: gen.created_by, kind: 'transcription', provider: model.provider, model: model.id, units: Number(source.duration_s ?? 0) / 60, unit: 'minute', costUsd: cost, isEstimate: true, generationId: gen.id, jobId: ctx.job.id });
  await setGeneration(ctx, gen.id, { status: 'succeeded', progress: 100, output: asJson({ text: text.trim(), language, words: words.length, assetId: source.id }), cost_actual_usd: cost, completed_at: new Date().toISOString() });
}

/* --------------------------------- Handlers --------------------------------- */

const providerKeyName = (model: ModelDef): KeyProvider => model.provider as KeyProvider;

/** Where the provider reports completion. Null when the app is not publicly reachable or the hook cannot be verified. */
function webhookUrl(provider: 'fal' | 'replicate', generationId: string): string | null {
  const base = publicWebhookBase();
  if (!base) return null;
  if (provider === 'fal' && !env().FAL_WEBHOOKS) return null;
  if (provider === 'replicate' && !env().REPLICATE_WEBHOOK_SECRET) return null;
  return `${base}/api/webhooks/${provider}?generationId=${encodeURIComponent(generationId)}`;
}

const pollDelay = (elapsedS: number, hasWebhook: boolean) => (hasWebhook ? 45 : elapsedS < 30 ? 4 : elapsedS < 180 ? 8 : 15);

export const aiGenerate: JobHandler<'ai.generate'> = {
  async run(ctx, { generationId }) {
    const gen = await loadGeneration(ctx, generationId);
    if (['succeeded', 'failed', 'canceled'].includes(gen.status)) return { skipped: gen.status };
    const model = modelOf(gen);
    if (gen.status === 'running' && gen.provider_request_id) {
      await ctx.enqueue('ai.poll', { generationId }, { idempotencyKey: `ai.poll:${generationId}` });
      return { resumed: true };
    }
    const p = resolveParams(model, (gen.params ?? {}) as never);
    ctx.progress(5, 'Preparing inputs');
    const { inputs, assets } = await resolveInputs(ctx, model, p);
    await checkConsent(ctx, gen, model, p, assets);
    await moderatePrompt(ctx, gen, p, inputs);
    await assertBudget(ctx.sb, gen.workspace_id, Number(gen.cost_estimate_usd ?? 0));
    ctx.checkAborted();
    await setGeneration(ctx, gen.id, { status: 'running', started_at: new Date().toISOString(), job_id: ctx.job.id, progress: 2, error: null });

    if (model.provider === 'fal' || model.provider === 'replicate') {
      const key = await requireProviderKey(gen.workspace_id, providerKeyName(model));
      const hook = webhookUrl(model.provider, gen.id);
      // Reference tokens (@image1…) become plain words for models without numbered placeholders.
      const input = model.buildInput({ ...p, prompt: expandReferences(p.prompt, 'natural') }, inputs);
      const requestId = model.provider === 'fal' ? (await falSubmit(key, model.endpoint, input, hook)).requestId : (await replicateCreate(key, model.endpoint, input, hook)).id;
      await setGeneration(ctx, gen.id, { provider_request_id: requestId, progress: 5 });
      const delay = hook ? Math.max(30, Math.round(model.etaS(p) * 1.5)) : 4;
      await ctx.enqueue('ai.poll', { generationId }, { idempotencyKey: `ai.poll:${generationId}`, runAt: new Date(Date.now() + delay * 1000) });
      return { submitted: requestId, webhook: !!hook };
    }
    if (model.provider === 'agnes') {
      const key = await requireProviderKey(gen.workspace_id, 'agnes');
      const body = model.buildInput(p, inputs);
      if (CAPABILITIES[model.capability as keyof typeof CAPABILITIES]?.output === 'image') {
        // Images come back in the same request; finalize downloads and saves them.
        ctx.progress(20, 'Generating image');
        const raw = await agnesImage(key, body);
        if (!model.parseOutput(raw).length) throw new PermanentError('Agnes finished but returned no image.');
        await setGeneration(ctx, gen.id, { provider_request_id: `sync:${ctx.job.id}`, output: asJson(raw), progress: 80 });
        await ctx.enqueue('ai.finalize', { generationId }, { idempotencyKey: `ai.finalize:${generationId}`, priority: 5 });
        return { state: 'generated' };
      }
      const { videoId } = await agnesVideoCreate(key, body);
      await setGeneration(ctx, gen.id, { provider_request_id: videoId, progress: 5 });
      await ctx.enqueue('ai.poll', { generationId }, { idempotencyKey: `ai.poll:${generationId}`, runAt: new Date(Date.now() + 15_000) });
      return { submitted: videoId };
    }
    if (model.provider === 'elevenlabs') {
      ctx.progress(20, 'Generating audio');
      const state = await runElevenLabs(ctx, gen, model, p, inputs, assets);
      if (state === 'submitted') await ctx.enqueue('ai.poll', { generationId }, { idempotencyKey: `ai.poll:${generationId}`, runAt: new Date(Date.now() + 20_000) });
      return { state };
    }
    if (model.provider === 'openai' && model.capability === 'transcribe') {
      await runTranscription(ctx, gen, model, p, assets, await requireProviderKey(gen.workspace_id, 'openai'));
      return { state: 'done' };
    }
    throw new PermanentError(`${model.label} cannot run on this server.`);
  },
  async onFailure(ctx, { generationId }, message) {
    await ctx.sb.from('generations').update({ status: 'failed', error: message, completed_at: new Date().toISOString() }).eq('id', generationId).in('status', ['queued', 'running']);
  },
  onCancel: cancelProvider,
};

async function cancelProvider(ctx: JobContext, { generationId }: { generationId: string }) {
  const { data: gen } = await ctx.sb.from('generations').select('*').eq('id', generationId).maybeSingle();
  if (!gen?.provider_request_id) return;
  const model = getModel(gen.model);
  if (!model) return;
  const key = await providerKey(gen.workspace_id, providerKeyName(model));
  if (!key) return;
  if (model.provider === 'fal') await falCancel(key, model.endpoint, gen.provider_request_id);
  if (model.provider === 'replicate') await replicateCancel(key, gen.provider_request_id);
}

export const aiPoll: JobHandler<'ai.poll'> = {
  async run(ctx, { generationId }) {
    const gen = await loadGeneration(ctx, generationId);
    if (gen.status !== 'running' || !gen.provider_request_id) return { skipped: gen.status };
    const model = modelOf(gen);
    const p = resolveParams(model, (gen.params ?? {}) as never);
    const key = await requireProviderKey(gen.workspace_id, providerKeyName(model));
    const elapsedS = (Date.now() - new Date(gen.started_at ?? gen.created_at).getTime()) / 1000;
    const eta = Math.max(5, gen.eta_seconds ?? model.etaS(p));
    const timeoutS = Math.max(1800, eta * 8);
    const hook = (model.provider === 'fal' || model.provider === 'replicate') && !!webhookUrl(model.provider, gen.id);
    const finalize = async () => {
      await ctx.enqueue('ai.finalize', { generationId }, { idempotencyKey: `ai.finalize:${generationId}`, priority: 5 });
      return { state: 'completed' };
    };
    const waiting = async (progress: number, message: string) => {
      const pct = Math.min(95, Math.max(gen.progress ?? 0, progress));
      await setGeneration(ctx, gen.id, { progress: pct, eta_seconds: Math.max(0, Math.round(eta - elapsedS)) || null });
      return reschedule(pollDelay(elapsedS, hook), message, pct);
    };
    if (elapsedS > timeoutS) {
      await cancelProvider(ctx, { generationId });
      throw new PermanentError('The provider took too long to respond. Nothing was charged for this run.');
    }
    const running = 10 + 85 * Math.min(1, elapsedS / eta);

    if (model.provider === 'fal') {
      const st = await falStatus(key, model.endpoint, gen.provider_request_id);
      if (st.state === 'completed') return finalize();
      if (st.state === 'failed') throw new PermanentError(`Generation failed: ${st.error}`);
      return waiting(st.state === 'queued' ? 5 : running, st.state === 'queued' ? `In queue${st.position != null ? ` (position ${st.position + 1})` : ''}` : 'Generating');
    }
    if (model.provider === 'replicate') {
      const st = await replicateGet(key, gen.provider_request_id);
      if (st.status === 'succeeded') return finalize();
      if (st.status === 'failed' || st.status === 'canceled') throw new PermanentError(`Generation failed: ${String(st.error ?? st.status)}`);
      return waiting(st.status === 'starting' ? 5 : running, st.status === 'starting' ? 'Starting' : 'Generating');
    }
    if (model.provider === 'agnes') {
      const st = await agnesVideoStatus(key, gen.provider_request_id, model.endpoint);
      if (st.status === 'completed') return finalize();
      if (st.status === 'failed') throw new PermanentError(`Generation failed: ${st.error ?? 'unknown error'}`);
      return waiting(st.status === 'queued' ? 5 : Math.max(running, 10 + st.progress * 0.85), st.status === 'queued' ? 'In queue' : 'Generating');
    }
    if (model.provider === 'elevenlabs' && model.capability === 'dub') {
      const st = await elevenDubStatus(key, gen.provider_request_id);
      if (st.status === 'dubbed') return finalize();
      if (st.status === 'failed') throw new PermanentError(`Dubbing failed: ${st.error ?? 'unknown error'}`);
      return waiting(running, 'Dubbing');
    }
    throw new PermanentError(`Polling is not supported for ${model.label}.`);
  },
  async onFailure(ctx, { generationId }, message) {
    await ctx.sb.from('generations').update({ status: 'failed', error: message, completed_at: new Date().toISOString() }).eq('id', generationId).eq('status', 'running');
  },
  onCancel: cancelProvider,
};

/** Fallback when a model's parser finds nothing: any URLs in the provider output. */
function findUrls(data: unknown, out: OutputFile[] = [], kind: OutputFile['kind'] = 'video'): OutputFile[] {
  if (typeof data === 'string' && /^https:\/\//.test(data)) out.push({ url: data, kind });
  else if (Array.isArray(data)) data.forEach((d) => findUrls(d, out, kind));
  else if (isRecord(data)) Object.values(data).forEach((v) => findUrls(v, out, kind));
  return out;
}

export const aiFinalize: JobHandler<'ai.finalize'> = {
  async run(ctx, { generationId }) {
    const gen = await loadGeneration(ctx, generationId);
    if (gen.status !== 'running') return { skipped: gen.status };
    const model = modelOf(gen);
    const p = resolveParams(model, (gen.params ?? {}) as never);
    const key = await requireProviderKey(gen.workspace_id, providerKeyName(model));
    if (!gen.provider_request_id) throw new PermanentError('This generation was never submitted.');
    ctx.progress(10, 'Fetching results');
    const dir = await ctx.tmp();
    const outKind = CAPABILITIES[model.capability as keyof typeof CAPABILITIES]?.output;
    let raw: unknown;
    let files: { path: string; mime: string | null; width?: number; height?: number }[] = [];

    if (model.provider === 'elevenlabs' && model.capability === 'dub') {
      const buf = await elevenDubResult(key, gen.provider_request_id, p.language ?? 'es');
      const file = path.join(dir, `${gen.id}-dub`);
      await writeFile(file, buf);
      files = [{ path: file, mime: await detectMime(file, 'video/mp4') }];
      raw = { dubbingId: gen.provider_request_id, language: p.language };
    } else {
      if (model.provider === 'fal') raw = await falResult(key, model.endpoint, gen.provider_request_id);
      else if (model.provider === 'agnes') raw = outKind === 'image' ? gen.output : (await agnesVideoStatus(key, gen.provider_request_id, model.endpoint)).raw;
      else {
        const st = await replicateGet(key, gen.provider_request_id);
        if (st.status !== 'succeeded') throw new Error(`Replicate prediction is ${st.status}`);
        raw = st.output;
      }
      let outputs = model.parseOutput(raw);
      if (!outputs.length) outputs = findUrls(raw, [], outKind === 'image' ? 'image' : outKind === 'audio' ? 'audio' : outKind === 'model3d' ? 'model3d' : 'video');
      if (!outputs.length) throw new PermanentError('The provider finished but returned no file.');
      let i = 0;
      for (const o of outputs.slice(0, 8)) {
        ctx.progress(20 + (60 * i) / outputs.length, 'Downloading results');
        const file = path.join(dir, `${gen.id}-${i}`);
        const res = await downloadUrl(o.url, file, { signal: ctx.signal });
        files.push({ path: file, mime: o.contentType ?? res.contentType, ...(o.width ? { width: o.width } : {}), ...(o.height ? { height: o.height } : {}) });
        i++;
      }
    }

    ctx.progress(85, 'Saving to library');
    const licenseId = await generatedLicense(ctx, gen.workspace_id, model.provider, `${model.vendor} ${model.label}`);
    const stemNames = ['vocals', 'drums', 'bass', 'other'];
    const saved: SavedOutput[] = [];
    for (const [i, f] of files.entries()) {
      const stem = model.capability === 'stems' ? stemNames[i] : undefined;
      const parent = DERIVED_CAPABILITIES.has(model.capability) ? (p.audioAssetId ?? p.videoAssetId ?? p.imageAssetId ?? null) : null;
      const meta = stem ? { role: stem === 'vocals' ? 'voice' : 'music', stem } : model.capability === 'depth' ? { depthOf: p.imageAssetId } : {};
      const asset = await saveOutputFile(ctx, gen, model, f.path, f.mime, i, files.length, licenseId, meta, parent);
      if (stem) await ctx.sb.from('audio_tracks').insert({ workspace_id: gen.workspace_id, asset_id: asset.id, kind: 'stem', stem, license_id: licenseId });
      else if (outKind === 'audio') await audioSideRows(ctx, gen, model, asset, p, licenseId);
      saved.push({ asset });
    }
    await completeGeneration(ctx, gen, model, saved, raw);
    return { outputs: saved.map((s) => s.asset.id) };
  },
  async onFailure(ctx, { generationId }, message) {
    await ctx.sb.from('generations').update({ status: 'failed', error: message, completed_at: new Date().toISOString() }).eq('id', generationId).eq('status', 'running');
  },
};

