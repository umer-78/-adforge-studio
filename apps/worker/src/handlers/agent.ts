import {
  AD_OBJECTIVES,
  AGENT_STEP_LABELS,
  AGENT_STEPS,
  AGENT_TRACK_PREFIX,
  agentGenerateEstimate,
  agentShotParams,
  agentSlots,
  agentVideoModel,
  asJson,
  brandContext,
  estimateCost,
  isRecord,
  LLM_TASKS,
  llmEstimate,
  makeClip,
  makeTrack,
  nextAgentStep,
  optimizeReportSchema,
  parseAgentSteps,
  parseTimeline,
  researchBriefSchema,
  scriptDraftSchema,
  SYSTEM_PROMPTS,
  timelineOps,
  type AdAccountRow,
  type AgentConfig,
  type AgentRunRow,
  type AgentStep,
  type AgentSteps,
  type AudioClip,
  type Clip,
  type LlmTask,
  type ModelDef,
  type ProductRow,
  type ResearchBrief,
  type TimelineData,
  type Update,
} from '@adforge/core';
import { elevenVoices, modelForTier, requireProviderKey } from '@adforge/core/server';
import { activity } from '../lib/activity';
import { PermanentError, userMessage } from '../lib/errors';
import { llmAvailable, runLlm } from '../lib/llm';
import { insertScript, productFacts, storyboardFromScript, workspaceBrand } from '../lib/storyboard';
import { insertRender, insertTimeline, retimeCaptions } from '../lib/timeline-edit';
import { synthesizeVoice } from '../lib/tts';
import { nowIso } from '../lib/util';
import { reschedule, type JobContext, type JobHandler } from '../runner';
import { syncCampaign } from './ads';
import { importProduct } from './product';

type StepResult =
  | { kind: 'done'; output: Record<string, unknown>; costUsd?: number; note?: string | null }
  | { kind: 'skipped'; output?: Record<string, unknown>; note: string }
  /** Keep working later without a new approval (waiting on generations, renders, launches). */
  | { kind: 'wait'; output: Record<string, unknown>; costUsd?: number; delayS: number; message: string; progress?: number }
  /** Back to the approval gate on the same step, e.g. no ad results yet. */
  | { kind: 'hold'; output?: Record<string, unknown>; note: string };

type StepRunner = (ctx: JobContext, run: AgentRunRow, steps: AgentSteps) => Promise<StepResult>;

const GENERATION_TIMEOUT_MS = 90 * 60_000;
const RENDER_TIMEOUT_MS = 2 * 3600_000;
const LAUNCH_TIMEOUT_MS = 3600_000;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const spent = (steps: AgentSteps) => AGENT_STEPS.reduce((sum, s) => sum + steps[s].costUsd, 0);
const elapsed = (iso: unknown) => (typeof iso === 'string' ? Date.now() - new Date(iso).getTime() : 0);

function feedbackLine(edits: Record<string, unknown>): string {
  const feedback = str(edits.feedback) ?? str(edits.notes);
  return feedback ? `Notes from the user for this step (follow them): ${feedback}` : '';
}

function llmTaskEstimate(task: LlmTask): number {
  const spec = LLM_TASKS[task];
  return llmEstimate(modelForTier(spec.tier), spec.input, spec.output);
}

/** The run was canceled while a step was working; the step stops without changing the run. */
class RunStopped extends Error {
  constructor() {
    super('The agent run was canceled.');
  }
}

/**
 * Saves the steps (and status changes) only while the run is still running, so a cancel that
 * lands mid-step is never overwritten. Costs spent before the cancel are still recorded.
 */
async function saveRun(ctx: JobContext, runId: string, steps: AgentSteps, patch: Update<'agent_runs'> = {}) {
  const { data, error } = await ctx.sb.from('agent_runs').update({ steps: asJson(steps), ...patch }).eq('id', runId).eq('status', 'running').select('id');
  if (error) throw new Error(`Could not save the agent run: ${error.message}`);
  if (data?.length) return;
  await ctx.sb.from('agent_runs').update({ steps: asJson(steps) }).eq('id', runId).eq('status', 'canceled');
  throw new RunStopped();
}

async function loadProduct(ctx: JobContext, run: AgentRunRow): Promise<ProductRow> {
  if (!run.product_id) throw new PermanentError('Run the research step first.');
  const { data } = await ctx.sb.from('products').select('*').eq('id', run.product_id).eq('workspace_id', run.workspace_id).maybeSingle();
  if (!data) throw new PermanentError('The product for this run was deleted.');
  return data;
}

/* --------------------------------- Research -------------------------------- */

async function ensureProduct(ctx: JobContext, run: AgentRunRow): Promise<ProductRow> {
  if (run.product_id) {
    const product = await loadProduct(ctx, run);
    return product.status === 'ready' ? product : importProduct(ctx, product);
  }
  if (!run.product_url) throw new PermanentError('Add a product URL or pick an imported product.');
  const { data: existing } = await ctx.sb
    .from('products')
    .select('*')
    .eq('workspace_id', run.workspace_id)
    .eq('source_url', run.product_url)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let product = existing;
  if (!product) {
    const { data, error } = await ctx.sb.from('products').insert({ workspace_id: run.workspace_id, source_url: run.product_url, status: 'importing', created_by: run.created_by }).select('*').single();
    if (error) throw new Error(`Could not create the product: ${error.message}`);
    product = await importProduct(ctx, data);
  }
  await ctx.sb.from('agent_runs').update({ product_id: product.id }).eq('id', run.id);
  run.product_id = product.id;
  return product;
}

/** Saved and competitor ads, favorites and long-running ones first (running time signals profit). */
async function inspirationFacts(ctx: JobContext, workspaceId: string): Promise<string[]> {
  const { data } = await ctx.sb
    .from('inspiration_ads')
    .select('brand, platform, headline, body, cta, status, metrics, analysis, is_favorite')
    .eq('workspace_id', workspaceId)
    .order('last_seen_at', { ascending: false })
    .limit(60);
  const days = (m: unknown) => (isRecord(m) && typeof m.daysRunning === 'number' ? m.daysRunning : 0);
  return (data ?? [])
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || days(b.metrics) - days(a.metrics))
    .slice(0, 12)
    .map((a) => {
      const analysis = isRecord(a.analysis) ? a.analysis : null;
      const parts = [`- ${a.brand} (${a.platform}, ${days(a.metrics)} days, ${a.status})`];
      if (a.headline) parts.push(`headline: "${a.headline.slice(0, 120)}"`);
      if (a.body) parts.push(`copy: "${a.body.slice(0, 240)}"`);
      if (analysis?.hook) parts.push(`hook: ${String(analysis.hook).slice(0, 160)}`);
      if (analysis?.angle) parts.push(`angle: ${String(analysis.angle).slice(0, 160)}`);
      return parts.join(' | ');
    });
}

const research: StepRunner = async (ctx, run, steps) => {
  if (!(await llmAvailable(ctx))) throw new PermanentError('Add a Claude API key in Settings → Providers to use agent mode.');
  ctx.progress(5, 'Reading the product page');
  const product = await ensureProduct(ctx, run);
  ctx.progress(45, 'Studying competitor ads');
  const inspiration = await inspirationFacts(ctx, run.workspace_id);
  const { tone } = await workspaceBrand(ctx.sb, run.workspace_id);
  ctx.progress(60, 'Defining audiences and angles');
  const { data, costUsd } = await runLlm(ctx, {
    task: 'research',
    schema: researchBriefSchema,
    system: SYSTEM_PROMPTS.research,
    prompt: [
      `Campaign goal: ${run.goal}`,
      `Product:\n${productFacts(product)}`,
      inspiration.length ? `Competitor and saved ads:\n${inspiration.join('\n')}` : 'No competitor ads are saved in the library yet.',
      `Platforms: ${steps.config.platforms.join(', ')}.`,
      feedbackLine(steps.research.edits),
      brandContext({ name: product.brand_name, tone, colors: strings(product.colors) }),
    ]
      .filter(Boolean)
      .join('\n\n'),
    meta: { agentRunId: run.id },
  });
  return { kind: 'done', costUsd, output: { productId: product.id, productTitle: product.title, brief: data, inspirationCount: inspiration.length } };
};

/* ---------------------------------- Script ---------------------------------- */

function chooseAngle(brief: ResearchBrief, edits: Record<string, unknown>) {
  const custom = str(edits.angle);
  if (custom) return { name: custom.slice(0, 80), hook: custom, why: 'Chosen by the user.', format: 'short-form video' };
  const i = num(edits.angleIndex);
  return brief.angles[i != null && i >= 0 && i < brief.angles.length ? Math.floor(i) : 0] ?? { name: 'Main benefit', hook: brief.keyMessages[0] ?? '', why: '', format: 'short-form video' };
}

const styleLine = (cfg: AgentConfig) =>
  cfg.style === 'ugc'
    ? 'Style: authentic UGC. A real-feeling creator talks to camera, filmed on a phone in everyday places with natural light and handheld framing. Avoid a glossy studio look.'
    : 'Style: polished brand film with clean lighting, deliberate camera moves and premium product close-ups.';

const script: StepRunner = async (ctx, run, steps) => {
  const brief = researchBriefSchema.safeParse(steps.research.output.brief);
  if (!brief.success) throw new PermanentError('Run the research step first.');
  const product = await loadProduct(ctx, run);
  const cfg = steps.config;
  const edits = steps.script.edits;
  const durationS = Math.min(90, Math.max(6, num(edits.durationS) ?? cfg.durationS));
  const angle = chooseAngle(brief.data, edits);
  const audience = brief.data.audiences[0];
  const { brand, tone } = await workspaceBrand(ctx.sb, run.workspace_id);

  ctx.progress(10, 'Writing the script');
  const { data: draft, costUsd } = await runLlm(ctx, {
    task: 'writeScript',
    schema: scriptDraftSchema,
    system: SYSTEM_PROMPTS.writeAdScript,
    prompt: [
      `Campaign goal: ${run.goal}`,
      `Product:\n${productFacts(product)}`,
      audience ? `Audience: ${audience.name}. Pains: ${audience.painPoints.join('; ')}. Desires: ${audience.desires.join('; ')}. Objections: ${audience.objections.join('; ')}.` : '',
      `Angle: ${angle.name}. Hook idea: ${angle.hook}. Format: ${angle.format}.${angle.why ? ` Why: ${angle.why}` : ''}`,
      brief.data.keyMessages.length ? `Key messages: ${brief.data.keyMessages.join('; ')}` : '',
      brief.data.complianceRisks.length ? `Avoid these compliance risks: ${brief.data.complianceRisks.join('; ')}` : '',
      `Write a ${durationS}s ${cfg.aspect} ad for ${cfg.platforms.join(' and ')}.`,
      styleLine(cfg),
      feedbackLine(edits),
      brandContext({ name: product.brand_name, tone, colors: strings(product.colors) }),
    ]
      .filter(Boolean)
      .join('\n\n'),
    meta: { agentRunId: run.id },
  });

  ctx.progress(70, 'Building the storyboard');
  const board = storyboardFromScript(draft, { aspect: cfg.aspect, brand, productImageIds: product.image_asset_ids, logoAssetId: product.logo_asset_id });
  const { data: workspace } = await ctx.sb.from('workspaces').select('ai_label_default').eq('id', run.workspace_id).maybeSingle();
  board.timeline.aiLabel = workspace?.ai_label_default ?? false;
  const { script: row } = await insertScript(ctx.sb, { workspaceId: run.workspace_id, draft, brief: { source: 'agent', agentRunId: run.id, productId: product.id, angle: angle.name }, createdBy: run.created_by });
  const timeline = await insertTimeline(ctx.sb, { workspaceId: run.workspace_id, name: `${product.title ?? 'Product'} · ${angle.name}`, data: board.timeline, createdBy: run.created_by });
  await ctx.sb.from('scripts').update({ timeline_id: timeline.id, storyboard: asJson(board.slots) }).eq('id', row.id);
  const spoken = draft.lines.map((l) => l.text.trim()).filter(Boolean).join(' ');
  return {
    kind: 'done',
    costUsd,
    output: {
      scriptId: row.id,
      timelineId: timeline.id,
      durationS: board.durationS,
      angle: angle.name,
      hook: draft.hook,
      cta: draft.cta,
      caption: draft.caption,
      hashtags: draft.hashtags,
      musicMood: draft.musicMood,
      spoken,
      slots: board.slots,
    },
  };
};

/* --------------------------------- Generate --------------------------------- */

function videoModel(cfg: AgentConfig, edits: Record<string, unknown>): ModelDef {
  const model = agentVideoModel(cfg, edits);
  if (!model) throw new PermanentError('Pick a text-to-video model for the shots.');
  return model;
}

async function pickVoice(ctx: JobContext, workspaceId: string): Promise<string> {
  const { data: saved } = await ctx.sb.from('voices').select('provider_voice_id').eq('workspace_id', workspaceId).eq('is_cloned', false).order('created_at').limit(1).maybeSingle();
  if (saved?.provider_voice_id) return saved.provider_voice_id;
  const voices = await elevenVoices(await requireProviderKey(workspaceId, 'elevenlabs'));
  const label = (v: (typeof voices)[number]) => Object.values(v.labels ?? {}).join(' ').toLowerCase();
  const pick = voices.find((v) => v.category === 'premade' && /conversational|social/.test(label(v))) ?? voices.find((v) => v.category === 'premade') ?? voices[0];
  if (!pick) throw new PermanentError('No ElevenLabs voice is available. Add one in the Voice Studio.');
  return pick.voice_id;
}

async function pickMusic(ctx: JobContext, workspaceId: string, mood: string) {
  const { data: rows } = await ctx.sb.from('music').select('asset_id, title, mood, genre, duration_s, license_id').eq('workspace_id', workspaceId).not('asset_id', 'is', null).not('license_id', 'is', null).limit(100);
  if (!rows?.length) return null;
  const { data: licenses } = await ctx.sb.from('licenses').select('id, commercial_use, expires_at').in('id', rows.map((r) => r.license_id!));
  const cleared = new Set((licenses ?? []).filter((l) => l.commercial_use && (!l.expires_at || new Date(l.expires_at).getTime() > Date.now())).map((l) => l.id));
  const words = mood.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  const score = (r: (typeof rows)[number]) => words.filter((w) => `${r.mood ?? ''} ${r.genre ?? ''} ${r.title}`.toLowerCase().includes(w)).length;
  return rows.filter((r) => cleared.has(r.license_id!)).sort((a, b) => score(b) - score(a))[0] ?? null;
}

interface GenerateOutput {
  phase?: 'generating' | 'rendering';
  startedAt?: string;
  generations?: Record<string, string>;
  /** voiceId and text say what was recorded, so a retry re-records only when either changed. */
  voice?: { assetId: string; durationS: number; words: { text: string; start: number; end: number }[]; costUsd: number; voiceId?: string; text?: string };
  renderId?: string;
  renderStartedAt?: string;
  assetId?: string;
  notes?: string[];
}

/** Fills the storyboard with generated shots, voice-over and licensed music. */
async function assemble(ctx: JobContext, run: AgentRunRow, steps: AgentSteps, out: GenerateOutput, outputs: Map<string, string>) {
  const timelineId = str(steps.script.output.timelineId);
  if (!timelineId) throw new PermanentError('Write the script first.');
  const { data: row } = await ctx.sb.from('timelines').select('*').eq('id', timelineId).maybeSingle();
  if (!row || row.deleted_at) throw new PermanentError('The storyboard edit was deleted.');
  const tl: TimelineData = parseTimeline(row.data);
  const fps = tl.fps;
  const slots = agentSlots(steps);
  const notes: string[] = [];
  // A retry or redo replaces the voice-over and music the last attempt added.
  tl.tracks = tl.tracks.filter((t) => !t.id.startsWith(AGENT_TRACK_PREFIX));
  const assetIds = [...outputs.values()];
  const { data: assets } = assetIds.length ? await ctx.sb.from('assets').select('id, duration_s').in('id', assetIds) : { data: [] };
  const durations = new Map((assets ?? []).map((a) => [a.id, Number(a.duration_s ?? 0)]));

  for (const slot of slots) {
    const assetId = outputs.get(slot.key);
    const found = timelineOps.findClip(tl, slot.clipId);
    if (!assetId || !found || found.clip.type !== 'video') continue;
    const clip = found.clip;
    clip.assetId = assetId;
    clip.placeholder = null;
    clip.trimStart = 0;
    // Generated B-roll sits under the voice-over.
    clip.audio.muted = true;
    clip.speed = 1;
    const srcS = durations.get(assetId) ?? 0;
    const needS = clip.duration / fps;
    if (srcS > 0 && srcS < needS) clip.speed = Math.max(0.5, srcS / needS);
  }
  if (slots.some((s) => s.useRealFootage)) notes.push('Lines meant for real footage got AI stand-ins. Swap them for real clips in the editor for the most authentic result.');

  const shots = tl.tracks.find((t) => t.kind === 'video');
  const shotsEnd = () => Math.max(0, ...(shots?.clips.map((c) => c.start + c.duration) ?? [0]));
  if (out.voice) {
    const frames = Math.max(1, Math.round(out.voice.durationS * fps));
    const voiceTrack = { ...makeTrack('audio', 'Voice-over'), id: `${AGENT_TRACK_PREFIX}voice` };
    const voiceClip = makeClip({ type: 'audio', assetId: out.voice.assetId, start: 0, duration: frames, name: 'Voice-over', audio: { role: 'voice' } }) as AudioClip;
    voiceTrack.clips.push(voiceClip);
    tl.tracks.push(voiceTrack);
    retimeCaptions(tl, voiceClip, out.voice.words);
    // Keep picture under the whole voice-over.
    const needed = frames + Math.round(0.4 * fps);
    const end = shotsEnd();
    const last = (shots?.clips ?? []).reduce<Clip | null>((a, c) => (!a || c.start + c.duration > a.start + a.duration ? c : a), null);
    if (last && needed > end) {
      const extra = needed - end;
      if (last.type === 'video' && last.assetId) {
        const srcS = durations.get(last.assetId) ?? 0;
        const wantS = ((last.duration + extra) / fps) * last.speed;
        if (srcS > 0 && last.trimStart + wantS > srcS) last.speed = Math.max(0.5, (srcS - last.trimStart) / ((last.duration + extra) / fps));
      }
      last.duration += extra;
      const newEnd = shotsEnd();
      for (const track of tl.tracks) {
        if (track.kind !== 'overlay') continue;
        for (const c of track.clips) if (c.type === 'motion' && c.start + c.duration === end) c.start = newEnd - c.duration;
      }
    }
  }

  const musicMood = str(steps.script.output.musicMood) ?? 'upbeat';
  const music = await pickMusic(ctx, run.workspace_id, musicMood);
  if (music?.asset_id) {
    const total = timelineOps.timelineDuration(tl);
    const musicTrack = { ...makeTrack('audio', 'Music'), id: `${AGENT_TRACK_PREFIX}music` };
    const srcFrames = music.duration_s ? Math.floor(Number(music.duration_s) * fps) : total;
    musicTrack.clips.push(makeClip({ type: 'audio', assetId: music.asset_id, start: 0, duration: Math.max(1, Math.min(total, srcFrames)), name: music.title, audio: { role: 'music', volume: 0.3, duck: true, fadeOut: 1 } }));
    tl.tracks.push(musicTrack);
  } else notes.push('No commercially licensed music is in the library, so the ad has voice-over only. Add a licensed track in the editor.');

  const { data: saved, error } = await ctx.sb
    .from('timelines')
    .update({ data: asJson(tl), duration_s: timelineOps.timelineDuration(tl) / fps, version: row.version + 1 })
    .eq('id', row.id)
    .select('*')
    .single();
  if (error) throw new Error(`Could not save the edit: ${error.message}`);
  const render = await insertRender(ctx.sb, { workspaceId: run.workspace_id, timeline: saved, createdBy: run.created_by });
  const job = await ctx.enqueue('render.timeline', { renderId: render.id }, { idempotencyKey: `render.timeline:${render.id}`, createdBy: run.created_by });
  await ctx.sb.from('renders').update({ job_id: job.id }).eq('id', render.id);
  return { renderId: render.id, notes };
}

const generate: StepRunner = async (ctx, run, steps) => {
  const cfg = steps.config;
  const edits = steps.generate.edits;
  const out = { ...(steps.generate.output as GenerateOutput) };
  const slots = agentSlots(steps);
  if (!str(steps.script.output.timelineId)) throw new PermanentError('Write the script first.');

  if (out.phase === 'rendering' && out.renderId) {
    const { data: render } = await ctx.sb.from('renders').select('status, output_asset_id, error, progress').eq('id', out.renderId).maybeSingle();
    if (!render) throw new PermanentError('The export was deleted. Approve this step again to re-render.');
    if (render.status === 'failed' || render.status === 'canceled') throw new PermanentError(`Rendering failed${render.error ? `: ${render.error}` : '.'} Approve this step again to retry.`);
    if (render.status !== 'succeeded' || !render.output_asset_id) {
      if (elapsed(out.renderStartedAt) > RENDER_TIMEOUT_MS) throw new PermanentError('Rendering took more than 2 hours. Approve this step again to retry.');
      return { kind: 'wait', output: { ...out }, delayS: 30, message: 'Rendering the ad', progress: 80 + Number(render.progress ?? 0) * 0.2 };
    }
    const { data: gens } = await ctx.sb.from('generations').select('cost_actual_usd, cost_estimate_usd').in('id', Object.values(out.generations ?? {}));
    const genCost = (gens ?? []).reduce((s, g) => s + Number(g.cost_actual_usd ?? g.cost_estimate_usd ?? 0), 0);
    const notes = out.notes ?? [];
    return { kind: 'done', output: { ...out, assetId: render.output_asset_id }, costUsd: genCost, note: notes.length ? notes.join(' ') : null };
  }

  if (out.phase !== 'generating') {
    // Start (or retry): keep shots made with this model that worked or are still running, regenerate the rest.
    const model = videoModel(cfg, edits);
    const existingIds = Object.values(out.generations ?? {});
    const { data: existing } = existingIds.length ? await ctx.sb.from('generations').select('id, status, model').in('id', existingIds) : { data: [] };
    const live = new Set((existing ?? []).filter((g) => g.model === model.id && ['queued', 'running', 'succeeded'].includes(g.status)).map((g) => g.id));
    const generations: Record<string, string> = {};
    for (const [i, slot] of slots.entries()) {
      ctx.progress((i / Math.max(1, slots.length)) * 30, 'Queueing shots');
      const prior = out.generations?.[slot.key];
      if (prior && live.has(prior)) {
        generations[slot.key] = prior;
        continue;
      }
      const params = agentShotParams(model, slot, cfg);
      const quote = estimateCost(model.id, params);
      const { data: gen, error } = await ctx.sb
        .from('generations')
        .insert({
          workspace_id: run.workspace_id,
          created_by: run.created_by,
          capability: model.capability,
          provider: model.provider,
          model: model.id,
          prompt: params.prompt,
          params: asJson(params),
          status: 'queued',
          cost_estimate_usd: quote.usd,
          eta_seconds: Math.round(quote.etaS),
          source_ref: asJson({ agentRunId: run.id, slotKey: slot.key }),
        })
        .select('id')
        .single();
      if (error) throw new Error(`Could not queue a shot: ${error.message}`);
      const job = await ctx.enqueue('ai.generate', { generationId: gen.id }, { idempotencyKey: `ai.generate:${gen.id}`, createdBy: run.created_by });
      await ctx.sb.from('generations').update({ job_id: job.id }).eq('id', gen.id);
      generations[slot.key] = gen.id;
    }
    out.generations = generations;
    out.startedAt = nowIso();

    let voiceCost = 0;
    const spoken = str(steps.script.output.spoken);
    const wantVoice = str(edits.voiceId) ?? cfg.voiceId;
    const keepVoice = !!out.voice && (!wantVoice || out.voice.voiceId === wantVoice) && (!out.voice.text || out.voice.text === spoken);
    if (!spoken) out.voice = undefined;
    else if (!keepVoice) {
      ctx.progress(35, 'Recording the voice-over');
      const voiceId = wantVoice ?? (await pickVoice(ctx, run.workspace_id));
      const voice = await synthesizeVoice(ctx, { workspaceId: run.workspace_id, text: spoken, voiceId, name: `${str(steps.research.output.productTitle) ?? 'Ad'} · voice-over`, scriptId: str(steps.script.output.scriptId) });
      out.voice = { assetId: voice.asset.id, durationS: voice.durationS, words: voice.words, costUsd: voice.costUsd, voiceId, text: spoken };
      voiceCost = voice.costUsd;
    }
    out.phase = 'generating';
    return { kind: 'wait', output: { ...out }, costUsd: voiceCost, delayS: 20, message: 'Generating shots', progress: 40 };
  }

  // Waiting for the shots.
  const ids = Object.values(out.generations ?? {});
  const { data: gens } = ids.length ? await ctx.sb.from('generations').select('id, status, error, output_asset_ids').in('id', ids) : { data: [] };
  const byId = new Map((gens ?? []).map((g) => [g.id, g]));
  const failed = ids.map((id) => byId.get(id)).filter((g) => !g || g.status === 'failed' || g.status === 'canceled');
  if (failed.length) {
    const reason = failed.find((g) => g?.error)?.error;
    throw new PermanentError(`${failed.length} shot${failed.length > 1 ? 's' : ''} could not be generated${reason ? `: ${reason}` : '.'} Approve this step again to retry them.`);
  }
  const doneCount = (gens ?? []).filter((g) => g.status === 'succeeded').length;
  if (doneCount < ids.length) {
    if (elapsed(out.startedAt) > GENERATION_TIMEOUT_MS) throw new PermanentError('Shots were still generating after 90 minutes. Approve this step again to keep waiting.');
    return { kind: 'wait', output: { ...out }, delayS: 20, message: `Generating shots (${doneCount}/${ids.length})`, progress: 40 + (doneCount / Math.max(1, ids.length)) * 35 };
  }

  ctx.progress(76, 'Assembling the ad');
  const outputs = new Map<string, string>();
  for (const [key, id] of Object.entries(out.generations ?? {})) {
    const assetId = byId.get(id)?.output_asset_ids[0];
    if (assetId) outputs.set(key, assetId);
  }
  const { renderId, notes } = await assemble(ctx, run, steps, out, outputs);
  return { kind: 'wait', output: { ...out, phase: 'rendering', renderId, renderStartedAt: nowIso(), notes }, delayS: 30, message: 'Rendering the ad', progress: 80 };
};

/* ---------------------------------- Launch ---------------------------------- */

async function launchAccounts(ctx: JobContext, run: AgentRunRow, cfg: AgentConfig, edits: Record<string, unknown>): Promise<AdAccountRow[]> {
  const { data } = await ctx.sb.from('ad_accounts').select('*').eq('workspace_id', run.workspace_id).in('platform', cfg.platforms).order('created_at');
  const accounts = data ?? [];
  const chosen = str(edits.adAccountId) ?? cfg.adAccountId;
  return cfg.platforms.flatMap((platform) => {
    const forPlatform = accounts.filter((a) => a.platform === platform);
    const pick = forPlatform.find((a) => a.id === chosen) ?? forPlatform.find((a) => a.status === 'active');
    return pick ? [pick] : [];
  });
}

const launch: StepRunner = async (ctx, run, steps) => {
  const { relaunch, ...out } = steps.launch.output;
  const existing = strings(out.campaignIds);
  if (existing.length && relaunch) {
    // Retrying the step: resume campaigns that failed; created objects are reused.
    const { data: failed } = await ctx.sb.from('ad_campaigns').select('id').in('id', existing).eq('status', 'failed');
    for (const c of failed ?? []) await ctx.enqueue('ads.launch', { campaignId: c.id }, { idempotencyKey: `ads.launch:${c.id}:${Date.now()}`, createdBy: run.created_by });
    return { kind: 'wait', output: { ...out, startedAt: nowIso() }, delayS: 20, message: 'Creating the ads (paused)', progress: 40 };
  }
  if (existing.length) {
    const { data: campaigns } = await ctx.sb.from('ad_campaigns').select('id, status, error').in('id', existing);
    const list = campaigns ?? [];
    const failed = list.filter((c) => c.status === 'failed');
    const launched = list.filter((c) => c.status === 'paused' || c.status === 'active');
    if (launched.length + failed.length < existing.length) {
      if (elapsed(out.startedAt) > LAUNCH_TIMEOUT_MS) throw new PermanentError('The ad platform took more than an hour. Check the Ad Launcher.');
      return { kind: 'wait', output: out, delayS: 20, message: 'Creating the ads (paused)', progress: 60 };
    }
    if (!launched.length) throw new PermanentError(`The campaign could not be created${failed[0]?.error ? `: ${failed[0].error}` : '.'}`);
    const note = failed.length ? `One platform failed: ${failed[0]?.error ?? 'unknown error'}.` : 'Ads were created paused. Review them in the Ad Launcher and activate them when ready; spend starts only then.';
    return { kind: 'done', output: { ...out, launched: launched.map((c) => c.id) }, note };
  }

  const assetId = str(steps.generate.output.assetId);
  if (!assetId) throw new PermanentError('Generate the video first.');
  const cfg = steps.config;
  const edits = steps.launch.edits;
  const accounts = await launchAccounts(ctx, run, cfg, edits);
  if (!accounts.length) return { kind: 'skipped', note: 'No ad account is connected, so nothing was launched. Connect one in Settings → Ad accounts, or publish the video from the Publisher.' };
  const inactive = accounts.find((a) => a.status !== 'active');
  if (inactive) throw new PermanentError(`Reconnect the ${inactive.name ?? inactive.platform} ad account in Settings → Ad accounts.`);

  const product = await loadProduct(ctx, run);
  const s = steps.script.output;
  const landingUrl = str(edits.landingUrl) ?? cfg.landingUrl ?? product.source_url;
  const countries = strings(edits.countries).filter((c) => c.length === 2);
  const objective = (AD_OBJECTIVES as readonly string[]).includes(String(edits.objective)) ? String(edits.objective) : 'traffic';
  const dailyBudget = num(edits.dailyBudget) ?? cfg.dailyAdBudget ?? 10;
  const campaignIds: string[] = [];
  for (const account of accounts) {
    const { data: campaign, error } = await ctx.sb
      .from('ad_campaigns')
      .insert({
        workspace_id: run.workspace_id,
        ad_account_id: account.id,
        name: `${product.title ?? 'Product'} · ${str(s.angle) ?? 'Agent'}`.slice(0, 200),
        objective,
        daily_budget: dailyBudget,
        currency: account.currency,
        targeting: asJson({ countries: countries.length ? countries : cfg.countries, ageMin: 18, ageMax: 65, landingUrl, cta: 'SHOP_NOW', agentRunId: run.id }),
        status: 'draft',
        created_by: run.created_by,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Could not create the campaign: ${error.message}`);
    const { error: adError } = await ctx.sb.from('ads').insert({
      workspace_id: run.workspace_id,
      campaign_id: campaign.id,
      asset_id: assetId,
      headline: (str(s.hook) ?? product.title ?? '').slice(0, 255),
      primary_text: (str(s.caption) ?? '').slice(0, 2200),
      cta: 'SHOP_NOW',
      landing_url: landingUrl,
      variant_label: 'A',
      status: 'draft',
    });
    if (adError) throw new Error(`Could not create the ad: ${adError.message}`);
    await ctx.enqueue('ads.launch', { campaignId: campaign.id }, { idempotencyKey: `ads.launch:${campaign.id}`, createdBy: run.created_by });
    campaignIds.push(campaign.id);
  }
  return { kind: 'wait', output: { campaignIds, startedAt: nowIso() }, delayS: 20, message: 'Creating the ads (paused)', progress: 40 };
};

/* --------------------------------- Optimize --------------------------------- */

const optimize: StepRunner = async (ctx, run, steps) => {
  const campaignIds = strings(steps.launch.output.launched).length ? strings(steps.launch.output.launched) : strings(steps.launch.output.campaignIds);
  if (!campaignIds.length) return { kind: 'skipped', note: 'Nothing was launched, so there are no results to read.' };
  const { data: campaigns } = await ctx.sb.from('ad_campaigns').select('*').in('id', campaignIds);
  const notes: string[] = [];
  for (const campaign of campaigns ?? []) {
    const { data: account } = await ctx.sb.from('ad_accounts').select('*').eq('id', campaign.ad_account_id).maybeSingle();
    if (!account || !campaign.external_campaign_id) continue;
    try {
      ctx.progress(20, 'Pulling the latest results');
      await syncCampaign(ctx, campaign, account);
    } catch (err) {
      notes.push(`Could not refresh ${account.name ?? account.platform}: ${userMessage(err)}`);
    }
  }
  const { data: rows } = await ctx.sb.from('ads').select('id, variant_label, headline, status, metrics, campaign_id').in('campaign_id', campaignIds);
  const ads = rows ?? [];
  const impressions = ads.reduce((s, a) => s + (isRecord(a.metrics) && typeof a.metrics.impressions === 'number' ? a.metrics.impressions : 0), 0);
  if (!impressions) return { kind: 'hold', note: 'No results yet. Activate the ads in the Ad Launcher, let them run for a few days, then approve this step again.' };

  const table = ads.map((a) => {
    const m = isRecord(a.metrics) ? a.metrics : {};
    return `adId=${a.id} label=${a.variant_label ?? '-'} status=${a.status} headline="${(a.headline ?? '').slice(0, 80)}" impressions=${m.impressions ?? 0} clicks=${m.clicks ?? 0} ctr=${m.ctr ?? '-'} cpc=${m.cpc ?? '-'} cpm=${m.cpm ?? '-'} spend=${m.spend ?? 0} conversions=${m.conversions ?? '-'} cpa=${m.cpa ?? '-'} roas=${m.roas ?? '-'} thruplays=${m.thruplays ?? '-'}`;
  });
  const { data: report, costUsd } = await runLlm(ctx, {
    task: 'optimize',
    schema: optimizeReportSchema,
    system: SYSTEM_PROMPTS.optimize,
    prompt: [`Campaign goal: ${run.goal}`, `Angle tested: ${str(steps.script.output.angle) ?? 'n/a'}`, `Results:\n${table.join('\n')}`, feedbackLine(steps.optimize.edits)].filter(Boolean).join('\n\n'),
    meta: { agentRunId: run.id },
  });
  const known = new Set(ads.map((a) => a.id));
  const winners = report.winners.map((w) => w.adId).filter((id) => known.has(id));
  if (winners.length) await ctx.sb.from('ads').update({ is_winner: true }).in('id', winners);
  return { kind: 'done', costUsd, output: { report, impressions, winners }, note: notes.length ? notes.join(' ') : null };
};

const RUNNERS: Record<AgentStep, StepRunner> = { research, script, generate, launch, optimize };

/** Estimated cost of the next step, shown at its approval gate. */
function estimateStep(steps: AgentSteps, step: AgentStep): number | null {
  try {
    if (step === 'research') return llmTaskEstimate('extractProduct') + llmTaskEstimate('research');
    if (step === 'script') return llmTaskEstimate('writeScript');
    if (step === 'optimize') return llmTaskEstimate('optimize');
    if (step === 'launch') return 0;
    return agentGenerateEstimate(steps)?.usd ?? null;
  } catch {
    return null;
  }
}

async function runStep(ctx: JobContext, runId: string) {
  const { data: run } = await ctx.sb.from('agent_runs').select('*').eq('id', runId).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (!run) throw new PermanentError('This agent run no longer exists.');
  if (run.status !== 'running') return { skipped: run.status };
  if (run.current_step === 'done') {
    await ctx.sb.from('agent_runs').update({ status: 'completed' }).eq('id', run.id).eq('status', 'running');
    return { skipped: 'done' };
  }
  const step = run.current_step as AgentStep;
  if (!AGENT_STEPS.includes(step)) throw new PermanentError(`Unknown agent step ${run.current_step}.`);
  const steps = parseAgentSteps(run.steps);
  const fresh = steps[step].status !== 'running' && steps[step].status !== 'waiting';

  if (fresh) {
    const estimate = steps[step].estimateUsd ?? 0;
    if (run.budget_usd != null && spent(steps) + estimate > Number(run.budget_usd) + 1e-6) {
      const left = Math.max(0, Number(run.budget_usd) - spent(steps));
      throw new PermanentError(`This step needs about $${estimate.toFixed(2)} but only $${left.toFixed(2)} of the run budget is left. Raise the budget to continue.`, 'agent_budget');
    }
    // A retry of the generate step resumes from its shots; other steps start over.
    const keep = step === 'generate' || step === 'launch' ? steps[step].output : {};
    const output = step === 'generate' ? { ...keep, phase: undefined } : step === 'launch' ? { ...keep, relaunch: true } : {};
    steps[step] = { ...steps[step], status: 'running', startedAt: nowIso(), finishedAt: null, output, error: null, note: null };
    await saveRun(ctx, run.id, steps, { job_id: ctx.job.id, error: null });
  }

  ctx.progress(fresh ? 2 : 50, AGENT_STEP_LABELS[step]);
  const result = await RUNNERS[step](ctx, run, steps);
  const state = steps[step];

  if (result.kind === 'wait') {
    steps[step] = { ...state, status: 'waiting', output: result.output, costUsd: state.costUsd + (result.costUsd ?? 0) };
    await saveRun(ctx, run.id, steps, { job_id: ctx.job.id });
    return reschedule(result.delayS, result.message, result.progress);
  }
  if (result.kind === 'hold') {
    steps[step] = { ...state, status: 'pending', output: result.output ?? state.output, note: result.note, finishedAt: nowIso() };
    await saveRun(ctx, run.id, steps, { status: 'awaiting_approval' });
    return { step, held: true };
  }

  steps[step] = {
    ...state,
    status: result.kind === 'skipped' ? 'skipped' : 'done',
    finishedAt: nowIso(),
    output: result.output ?? state.output,
    costUsd: state.costUsd + (result.kind === 'done' ? (result.costUsd ?? 0) : 0),
    note: result.note ?? null,
    error: null,
  };
  let next = nextAgentStep(step);
  // Without a launch there is nothing to optimize.
  if (next === 'optimize' && result.kind === 'skipped') {
    steps.optimize = { ...steps.optimize, status: 'skipped', note: 'Nothing was launched.' };
    next = 'done';
  }
  if (next !== 'done') steps[next] = { ...steps[next], status: 'pending', estimateUsd: estimateStep(steps, next) };
  // Opt-in: cheap steps continue on their own when the run budget covers them; launching ads always waits for a person.
  // Read fresh: the setting can change while the step runs.
  const { data: latest } = await ctx.sb.from('agent_runs').select('auto_approve_under_usd').eq('id', run.id).maybeSingle();
  const limit = Number(latest?.auto_approve_under_usd ?? run.auto_approve_under_usd ?? 0);
  const nextEstimate = next === 'done' ? null : steps[next].estimateUsd;
  const left = run.budget_usd == null ? Infinity : Number(run.budget_usd) - spent(steps);
  const auto = next !== 'done' && next !== 'launch' && limit > 0 && nextEstimate != null && nextEstimate <= limit && nextEstimate <= left + 1e-6;
  await saveRun(ctx, run.id, steps, { current_step: next, status: next === 'done' ? 'completed' : auto ? 'running' : 'awaiting_approval', error: null });
  if (auto) await ctx.enqueue('agent.step', { runId: run.id }, { idempotencyKey: `agent.step:${run.id}:${next}:auto:${Date.now()}` });
  await activity(ctx.sb, {
    workspaceId: run.workspace_id,
    actorId: run.created_by,
    verb: next === 'done' ? 'agent.completed' : 'agent.step_done',
    objectType: 'agent_run',
    objectId: run.id,
    data: { step, label: AGENT_STEP_LABELS[step], next, costUsd: spent(steps) },
  });
  return { step, next, costUsd: spent(steps) };
}

/** Back to the approval gate with the step marked failed, so the user can retry it or cancel. */
async function toGate(ctx: JobContext, runId: string, message: string) {
  const { data: run } = await ctx.sb.from('agent_runs').select('*').eq('id', runId).maybeSingle();
  if (!run || run.status !== 'running') return;
  const steps = parseAgentSteps(run.steps);
  const step = run.current_step as AgentStep;
  if (AGENT_STEPS.includes(step)) steps[step] = { ...steps[step], status: 'failed', error: message, finishedAt: nowIso() };
  try {
    await saveRun(ctx, run.id, steps, { status: 'awaiting_approval', error: message });
  } catch (err) {
    if (!(err instanceof RunStopped)) throw err;
  }
}

export const agentStep: JobHandler<'agent.step'> = {
  async run(ctx, { runId }) {
    try {
      return await runStep(ctx, runId);
    } catch (err) {
      if (err instanceof RunStopped) return { stopped: true };
      throw err;
    }
  },
  async onFailure(ctx, { runId }, message) {
    await toGate(ctx, runId, message);
  },
  /** The job was stopped from the jobs tray: the step waits for a decision again. */
  async onCancel(ctx, { runId }) {
    await toGate(ctx, runId, 'The step was stopped before it finished.');
  },
};
