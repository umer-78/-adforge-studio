import 'server-only';
import {
  AD_OBJECTIVES,
  AGENT_STEP_LABELS,
  AGENT_STEPS,
  AGENT_TTS_MODEL_ID,
  agentGenerateEstimate,
  agentShotParams,
  agentVideoModel,
  AppError,
  asJson,
  estimateCost,
  formatUsd,
  isRecord,
  parseAgentSteps,
  type AdPlatform,
  type AgentConfig,
  type AgentRunRow,
  type AgentStep,
  type AgentSteps,
} from '@adforge/core';
import { ads as adsApi, assertBudget, budgetStatus, cancelJob, type KeyProvider, type ServiceClient } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, type Caller } from './api';
import { assetViewMap } from './assets';
import { publishableAsset, toAdAccountView } from './distribution';
import { cancelGenerations } from './generation';
import { llmTaskUsd } from './growth';
import { jobViewMap, providerStatus } from './workspace';
import type { AgentEstimateView, AgentPlanEstimateView, AgentRunView, CampaignView } from '@/lib/types';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const ids = (list: (string | null | undefined)[]) => [...new Set(list.filter((x): x is string => !!x))];
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

const PROVIDER_LABEL: Partial<Record<KeyProvider, string>> = { fal: 'fal.ai', replicate: 'Replicate', agnes: 'Agnes', elevenlabs: 'ElevenLabs', anthropic: 'Claude', openai: 'OpenAI' };

export const agentSpent = (steps: AgentSteps) => round4(AGENT_STEPS.reduce((sum, s) => sum + steps[s].costUsd, 0));

/** Steps that call paid AI providers need the generate scope; launching ads needs the ads scope. */
export const scopeForStep = (step: AgentStep) => (step === 'launch' ? 'ads' : 'generate');

/* ----------------------------------- Views ---------------------------------- */

export async function toAgentRunViews(sb: ServiceClient, workspaceId: string, rows: AgentRunRow[]): Promise<AgentRunView[]> {
  const parsed = rows.map((r) => ({ row: r, steps: parseAgentSteps(r.steps) }));
  const productIds = ids(rows.map((r) => r.product_id));
  const campaignIds = ids(parsed.flatMap((p) => strings(p.steps.launch.output.campaignIds)));
  const [products, campaigns] = await Promise.all([
    productIds.length ? sb.from('products').select('id, title, status, image_asset_ids').eq('workspace_id', workspaceId).in('id', productIds).then((r) => r.data ?? []) : [],
    campaignIds.length ? sb.from('ad_campaigns').select('id, name, status, error, ad_account_id').eq('workspace_id', workspaceId).in('id', campaignIds).then((r) => r.data ?? []) : [],
  ]);
  const accountIds = ids(campaigns.map((c) => c.ad_account_id));
  const [assets, jobs, accounts] = await Promise.all([
    assetViewMap(sb, workspaceId, [...products.map((p) => p.image_asset_ids[0]), ...parsed.map((p) => str(p.steps.generate.output.assetId))]),
    jobViewMap(sb, workspaceId, rows.map((r) => r.job_id)),
    accountIds.length ? sb.from('ad_accounts').select('id, platform').in('id', accountIds).then((r) => r.data ?? []) : [],
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const platformByAccount = new Map(accounts.map((a) => [a.id, a.platform as 'meta' | 'tiktok']));
  const live = (id: string | null | undefined) => (id && assets[id] && !assets[id].deletedAt ? assets[id] : null);

  return parsed.map(({ row: r, steps }) => {
    const product = r.product_id ? productById.get(r.product_id) : undefined;
    const cfg = steps.config;
    return {
      id: r.id,
      goal: r.goal,
      productId: r.product_id,
      productUrl: r.product_url,
      product: product ? { id: product.id, title: product.title, status: product.status as 'importing' | 'ready' | 'failed', image: live(product.image_asset_ids[0]) } : null,
      budgetUsd: r.budget_usd == null ? null : Number(r.budget_usd),
      spentUsd: agentSpent(steps),
      autoApproveUnderUsd: Number(r.auto_approve_under_usd),
      status: r.status as AgentRunView['status'],
      currentStep: r.current_step as AgentRunView['currentStep'],
      steps: AGENT_STEPS.map((id) => ({ id, label: AGENT_STEP_LABELS[id], ...steps[id] })),
      config: {
        platforms: cfg.platforms,
        adAccountId: cfg.adAccountId,
        dailyAdBudget: cfg.dailyAdBudget,
        aspect: cfg.aspect,
        durationS: cfg.durationS,
        videoModelId: cfg.videoModelId,
        voiceId: cfg.voiceId,
        style: cfg.style,
        countries: cfg.countries,
        landingUrl: cfg.landingUrl,
      },
      video: live(str(steps.generate.output.assetId)),
      campaigns: strings(steps.launch.output.campaignIds).flatMap((id) => {
        const c = campaignById.get(id);
        return c ? [{ id: c.id, name: c.name, status: c.status as CampaignView['status'], platform: platformByAccount.get(c.ad_account_id) ?? null, error: c.error }] : [];
      }),
      job: r.job_id ? (jobs[r.job_id] ?? null) : null,
      error: r.error,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

/* ----------------------------------- Edits ---------------------------------- */

const note = (max: number) => z.string().trim().max(max);

/** What the user can change at each approval gate. Unknown keys are dropped. */
const EDIT_SCHEMAS = {
  research: z.object({ notes: note(2000).optional() }),
  script: z.object({
    /** One of the angles the research found. */
    angleIndex: z.number().int().min(0).max(19).optional(),
    /** A custom angle instead. */
    angle: note(300).optional(),
    durationS: z.number().int().min(6).max(90).optional(),
  }),
  generate: z.object({
    videoModelId: z.string().max(100).optional(),
    voiceId: z.string().max(100).optional(),
    /** Redo only: false keeps the shots from the last attempt. */
    newShots: z.boolean().optional(),
    /** Redo only: false keeps the voice-over from the last attempt. */
    newVoice: z.boolean().optional(),
  }),
  launch: z.object({
    adAccountId: z.string().uuid().optional(),
    landingUrl: z.string().url().max(2000).optional(),
    countries: z.array(z.string().length(2)).min(1).max(25).optional(),
    objective: z.enum(AD_OBJECTIVES).optional(),
    dailyBudget: z.number().positive().max(10_000).optional(),
  }),
  optimize: z.object({}),
} satisfies Record<AgentStep, z.ZodType>;

/** Validated edits for a step, with the note stored as feedback for the step's prompt. */
export function parseStepEdits(step: AgentStep, edits: Record<string, unknown> | undefined, feedback?: string): Record<string, unknown> {
  const result = EDIT_SCHEMAS[step].safeParse(edits ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(`${issue?.path.join('.') || 'edits'}: ${issue?.message ?? 'invalid value'}`);
  }
  const out: Record<string, unknown> = Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined && v !== ''));
  if (Array.isArray(out.countries)) out.countries = [...new Set((out.countries as string[]).map((c) => c.toUpperCase()))];
  if (feedback?.trim()) out.feedback = feedback.trim();
  return out;
}

/** The generate output a redo starts from: the parts the user chose to keep. */
export function redoGenerateOutput(steps: AgentSteps, edits: Record<string, unknown>): Record<string, unknown> {
  const out = steps.generate.output;
  const keepShots = edits.newShots === false && isRecord(out.generations);
  const keepVoice = edits.newVoice === false && isRecord(out.voice);
  if (!keepShots && !keepVoice) return {};
  return { ...(keepShots ? { generations: out.generations } : {}), ...(keepVoice ? { voice: out.voice } : {}) };
}

/* --------------------------------- Estimates -------------------------------- */

/** Slot keys whose shot from an earlier attempt is reused: same model, still running or done. */
async function reusableShots(sb: ServiceClient, workspaceId: string, output: Record<string, unknown>, modelId: string): Promise<Set<string>> {
  const gens = isRecord(output.generations) ? Object.entries(output.generations).filter((e): e is [string, string] => typeof e[1] === 'string') : [];
  if (!gens.length) return new Set();
  const { data } = await sb.from('generations').select('id, status, model').eq('workspace_id', workspaceId).in('id', gens.map(([, id]) => id));
  const live = new Set((data ?? []).filter((g) => g.model === modelId && ['queued', 'running', 'succeeded'].includes(g.status)).map((g) => g.id));
  return new Set(gens.filter(([, id]) => live.has(id)).map(([key]) => key));
}

function voiceKept(steps: AgentSteps, output: Record<string, unknown>, edits: Record<string, unknown>): boolean {
  const voice = output.voice;
  if (!isRecord(voice) || typeof voice.assetId !== 'string') return false;
  const want = str(edits.voiceId) ?? steps.config.voiceId;
  const spoken = str(steps.script.output.spoken);
  return (!want || voice.voiceId === want) && (typeof voice.text !== 'string' || voice.text === spoken);
}

export interface StepEstimate {
  usd: number;
  approx: boolean;
  detail: string | null;
}

/**
 * Price of the next run of a step. `output` is what the step will start from: its current output
 * when approving a retry, or what a redo keeps.
 */
export async function estimateStep(sb: ServiceClient, run: AgentRunRow, steps: AgentSteps, step: AgentStep, edits: Record<string, unknown>, output: Record<string, unknown> = steps[step].output): Promise<StepEstimate> {
  if (step === 'research') {
    const { data: product } = run.product_id ? await sb.from('products').select('status').eq('id', run.product_id).maybeSingle() : { data: null };
    const ready = product?.status === 'ready';
    return { usd: round4(llmTaskUsd('research') + (ready ? 0 : llmTaskUsd('extractProduct'))), approx: true, detail: ready ? 'Research with Claude' : 'Read the product page, then research with Claude' };
  }
  if (step === 'script') return { usd: round4(llmTaskUsd('writeScript')), approx: true, detail: 'Script and storyboard with Claude' };
  if (step === 'optimize') return { usd: round4(llmTaskUsd('optimize')), approx: true, detail: 'Read results with Claude' };
  if (step === 'launch') return { usd: 0, approx: false, detail: 'Creating paused ads is free. Spend starts only when you activate them.' };

  const model = agentVideoModel(steps.config, edits);
  if (!model) throw badRequest('Pick a text-to-video model for the shots.');
  const est = agentGenerateEstimate(steps, edits, { slotKeys: await reusableShots(sb, run.workspace_id, output, model.id), voice: voiceKept(steps, output, edits) });
  if (!est) throw badRequest('Write the script first.');
  const parts = [est.shots ? `${est.shots} of ${est.totalShots} shot${est.totalShots === 1 ? '' : 's'} with ${est.modelLabel} (${formatUsd(est.shotsUsd)})` : est.totalShots ? 'Shots are reused' : 'No shots to generate', est.voiceUsd ? `voice-over (${formatUsd(est.voiceUsd)})` : null];
  return { usd: est.usd, approx: est.approx || est.voiceUsd > 0, detail: parts.filter(Boolean).join(' + ') };
}

export async function toEstimateView(sb: ServiceClient, run: AgentRunRow, steps: AgentSteps, step: AgentStep, est: StepEstimate): Promise<AgentEstimateView> {
  const monthly = await budgetStatus(sb, run.workspace_id);
  const left = run.budget_usd == null ? null : Math.max(0, Number(run.budget_usd) - agentSpent(steps));
  return {
    step,
    usd: est.usd,
    approx: est.approx,
    detail: est.detail,
    runLeftUsd: left == null ? null : round4(left),
    withinRunBudget: left == null || est.usd <= left + 1e-6,
    monthly,
    withinMonthlyBudget: !monthly.hardStop || monthly.spentUsd + est.usd <= monthly.budgetUsd + 1e-9,
  };
}

/** Ballpark for a whole run before the script exists: shots are a range because the script decides them. */
export function planEstimate(cfg: AgentConfig, productReady: boolean): AgentPlanEstimateView {
  const research = round4(llmTaskUsd('research') + (productReady ? 0 : llmTaskUsd('extractProduct')));
  const script = round4(llmTaskUsd('writeScript'));
  const optimize = round4(llmTaskUsd('optimize'));
  let generate: AgentPlanEstimateView['generate'] = null;
  const model = agentVideoModel(cfg, {});
  if (model) {
    // About one line every 3 s; product beats use product photos when the page has them.
    const lines = Math.min(14, Math.max(3, Math.round(cfg.durationS / 3)));
    const shot = estimateCost(model.id, agentShotParams(model, { prompt: 'Product in use', durationS: cfg.durationS / lines }, cfg)).usd;
    const voice = estimateCost(AGENT_TTS_MODEL_ID, { prompt: 'x'.repeat(Math.round(cfg.durationS * 15)) }).usd;
    const shotsLow = Math.max(1, Math.ceil(lines / 2));
    generate = { low: round4(shot * shotsLow + voice), high: round4(shot * lines + voice), shotsLow, shotsHigh: lines, voice: round4(voice), modelId: model.id, modelLabel: model.label };
  }
  const base = research + script + optimize;
  return { research, script, generate, optimize, total: { low: round4(base + (generate?.low ?? 0)), high: round4(base + (generate?.high ?? 0)) } };
}

/* -------------------------------- Readiness --------------------------------- */

export function assertRunBudget(run: AgentRunRow, steps: AgentSteps, usd: number) {
  if (run.budget_usd == null) return;
  const left = Math.max(0, Number(run.budget_usd) - agentSpent(steps));
  if (usd > left + 1e-6) {
    throw new AppError('agent_budget', `This step costs about ${formatUsd(usd)} but only ${formatUsd(left)} of the run budget is left. Raise the run budget to continue.`, 402, { estimateUsd: usd, leftUsd: left });
  }
}

/** The ad accounts the launch step will use: the chosen one for its platform, else the first active one per platform. */
async function launchAccounts(sb: ServiceClient, workspaceId: string, cfg: AgentConfig, edits: Record<string, unknown>) {
  const { data } = await sb.from('ad_accounts').select('*').eq('workspace_id', workspaceId).in('platform', cfg.platforms).order('created_at');
  const accounts = data ?? [];
  const chosen = str(edits.adAccountId) ?? cfg.adAccountId;
  if (str(edits.adAccountId) && !accounts.some((a) => a.id === chosen)) throw badRequest('That ad account is not connected for the platforms this run targets.');
  return cfg.platforms.flatMap((platform) => {
    const forPlatform = accounts.filter((a) => a.platform === platform);
    const pick = forPlatform.find((a) => a.id === chosen) ?? forPlatform.find((a) => a.status === 'active');
    return pick ? [pick] : [];
  });
}

/** Fails early with a clear message for anything the step would fail on in the worker. */
export async function assertStepReady(sb: ServiceClient, caller: Caller, steps: AgentSteps, step: AgentStep, edits: Record<string, unknown>, output: Record<string, unknown>, usd: number) {
  const providers = await providerStatus(sb, caller.workspaceId);
  if (step === 'research' || step === 'script' || step === 'optimize') {
    if (!providers.anthropic) throw new AppError('provider_not_configured', 'Add a Claude API key in Settings → Providers to use agent mode.', 400, { provider: 'anthropic' });
  }
  if (step === 'script' && !isRecord(steps.research.output.brief)) throw badRequest('Run the research step first.');
  if (step === 'generate') {
    const model = agentVideoModel(steps.config, edits);
    if (!model) throw badRequest('Pick a text-to-video model for the shots.');
    if (model.sunsetAt && new Date(model.sunsetAt).getTime() < Date.now()) throw badRequest(`${model.label} has been retired. Pick another model.`);
    const provider = model.provider as KeyProvider;
    if (!providers[provider]) throw new AppError('provider_not_configured', `Add a ${PROVIDER_LABEL[provider] ?? model.provider} API key in Settings → Providers to generate shots with ${model.label}.`, 400, { provider });
    if (str(steps.script.output.spoken) && !voiceKept(steps, output, edits) && !providers.elevenlabs) {
      throw new AppError('provider_not_configured', 'Add an ElevenLabs API key in Settings → Providers to record the voice-over.', 400, { provider: 'elevenlabs' });
    }
    const voiceId = str(edits.voiceId);
    if (voiceId) {
      const { data: voice } = await sb.from('voices').select('id').eq('workspace_id', caller.workspaceId).eq('provider_voice_id', voiceId).limit(1).maybeSingle();
      if (!voice) throw badRequest('Add that voice to your Voice-over library first.');
    }
  }
  if (step === 'launch') {
    const assetId = str(steps.generate.output.assetId);
    if (!assetId) throw badRequest('Generate the video first.');
    await publishableAsset(sb, caller, assetId);
    const accounts = await launchAccounts(sb, caller.workspaceId, steps.config, edits);
    if (!accounts.length) throw badRequest('Connect a Meta or TikTok ad account in Settings → Ad accounts first, or finish the run here.');
    const countries = strings(edits.countries).length ? strings(edits.countries) : steps.config.countries;
    for (const account of accounts) {
      if (account.status !== 'active') throw badRequest(`Reconnect ${account.name ?? 'the ad account'} in Settings → Ad accounts first.`);
      const platform = adsApi.ADS_PLATFORMS[account.platform as AdPlatform];
      if (!platform?.configured()) throw badRequest(`${platform?.label ?? 'This ad platform'} is not set up on this server.`);
      if (account.platform === 'meta' && !toAdAccountView(account).pageId) throw badRequest('Pick the Facebook Page your ads run as in Settings → Ad accounts.');
      if (account.platform === 'tiktok') {
        const unsupported = countries.filter((c) => !adsApi.TIKTOK_COUNTRY_IDS[c]);
        if (unsupported.length) throw badRequest(`TikTok Ads cannot target ${unsupported.join(', ')} from here yet.`);
      }
    }
  }
  if (usd > 0) await assertBudget(sb, caller.workspaceId, usd);
}

/* ---------------------------------- Stopping --------------------------------- */

/** Stops what a canceled run still has in flight: its step job, shots still generating and the export. */
export async function stopRunWork(sb: ServiceClient, workspaceId: string, run: AgentRunRow, steps: AgentSteps) {
  if (run.job_id) await cancelJob(sb, run.job_id);
  const gens = isRecord(steps.generate.output.generations) ? Object.values(steps.generate.output.generations).filter((x): x is string => typeof x === 'string') : [];
  if (steps.generate.status === 'running' || steps.generate.status === 'waiting') await cancelGenerations(sb, workspaceId, gens);
  const renderId = str(steps.generate.output.renderId);
  if (renderId && steps.generate.status !== 'done') {
    const { data: render } = await sb.from('renders').select('id, status, job_id').eq('id', renderId).eq('workspace_id', workspaceId).maybeSingle();
    if (render && (render.status === 'queued' || render.status === 'running')) {
      if (render.job_id) await cancelJob(sb, render.job_id);
      await sb.from('renders').update({ status: 'canceled', error: null }).eq('id', render.id).in('status', ['queued', 'running']);
    }
  }
}

/** Resets the steps after a redone one: their results came from what is being redone. Money spent stays counted. */
export function resetAfter(steps: AgentSteps, step: AgentStep) {
  for (const later of AGENT_STEPS.slice(AGENT_STEPS.indexOf(step) + 1)) {
    steps[later] = { ...steps[later], status: 'pending', startedAt: null, finishedAt: null, estimateUsd: null, output: {}, edits: {}, note: null, error: null };
  }
}

/**
 * A queued step job was stopped from the jobs tray: the worker never sees it, so the run goes back
 * to its approval gate here (a running job does this itself when it notices the cancel).
 */
export async function returnToGate(sb: ServiceClient, workspaceId: string, runId: string, message: string) {
  const { data: run } = await sb.from('agent_runs').select('*').eq('id', runId).eq('workspace_id', workspaceId).maybeSingle();
  if (!run || run.status !== 'running') return;
  const steps = parseAgentSteps(run.steps);
  const step = run.current_step as AgentStep;
  if (AGENT_STEPS.includes(step)) steps[step] = { ...steps[step], status: 'failed', error: message, finishedAt: new Date().toISOString() };
  await sb.from('agent_runs').update({ steps: asJson(steps), status: 'awaiting_approval', error: message }).eq('id', run.id).eq('updated_at', run.updated_at).eq('status', 'running');
}
