import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  AppError,
  asJson,
  CAPABILITIES,
  estimateCost,
  formatUsd,
  getModel,
  isRecord,
  MODELS,
  resolveParams,
  type Capability,
  type CostEstimate,
  type GenerationCreate,
  type GenerationRow,
  type GenParamsInput,
  type ResolvedInputs,
} from '@adforge/core';
import { assertBudget, cancelJob, enqueueJob, type KeyProvider, type ServiceClient } from '@adforge/core/server';
import { badRequest, check, type Caller } from './api';
import { assetViewMap } from './assets';
import { providerStatus } from './workspace';
import type { AssetView, GenerationView, ModelView } from '@/lib/types';


const providerKey = (p: string) => p as KeyProvider;

/** Capabilities that change a real person's face or voice, and the consent kinds that cover them. */
export const CONSENT_FOR: Partial<Record<Capability, string[]>> = {
  avatar: ['face_likeness'],
  lipsync: ['lipsync_dub', 'face_likeness'],
  dub: ['lipsync_dub'],
};

export async function listModels(sb: ServiceClient, caller: Caller, capability?: Capability): Promise<ModelView[]> {
  const providers = await providerStatus(sb, caller.workspaceId);
  const now = Date.now();
  return MODELS.filter((m) => (!capability || m.capability === capability) && (!m.sunsetAt || new Date(m.sunsetAt).getTime() > now)).map((m) => {
    let fromUsd = 0;
    let etaS = 0;
    try {
      const est = estimateCost(m.id, {});
      fromUsd = est.usd;
      etaS = est.etaS;
    } catch {
      // Some models need inputs to price; the picker shows "priced per input".
    }
    return {
      id: m.id,
      label: m.label,
      vendor: m.vendor,
      provider: m.provider,
      capability: m.capability,
      output: CAPABILITIES[m.capability].output,
      description: m.description,
      badges: m.badges,
      inputs: m.inputs ?? null,
      controls: m.controls,
      defaults: m.defaults,
      recommended: !!m.recommended,
      available: !!providers[providerKey(m.provider)],
      fromUsd,
      etaS,
    };
  });
}

/** Sizes and durations of input files, which some models price by. */
async function inputFacts(sb: ServiceClient, caller: Caller, params: GenParamsInput): Promise<ResolvedInputs> {
  const ids = [params.imageAssetId, params.videoAssetId, params.audioAssetId].filter((x): x is string => !!x);
  if (!ids.length && !params.referenceAssetIds?.length) return {};
  const { data } = ids.length ? await sb.from('assets').select('id, type, duration_s, width, height').eq('workspace_id', caller.workspaceId).in('id', ids) : { data: [] };
  const byId = new Map((data ?? []).map((a) => [a.id, a]));
  const media = (params.videoAssetId && byId.get(params.videoAssetId)) || (params.audioAssetId && byId.get(params.audioAssetId)) || null;
  const sized = (params.videoAssetId && byId.get(params.videoAssetId)) || (params.imageAssetId && byId.get(params.imageAssetId)) || null;
  return {
    ...(params.imageAssetId ? { image: 'pending' } : {}),
    ...(params.videoAssetId ? { video: 'pending' } : {}),
    ...(params.audioAssetId ? { audio: 'pending' } : {}),
    ...(params.referenceAssetIds?.length ? { references: params.referenceAssetIds.map(() => 'pending') } : {}),
    ...(params.referenceAudioAssetIds?.length ? { referenceAudios: params.referenceAudioAssetIds.map(() => 'pending') } : {}),
    ...(media?.duration_s ? { inputDurationS: Number(media.duration_s) } : {}),
    ...(sized?.width && sized.height ? { inputWidth: sized.width, inputHeight: sized.height } : {}),
  };
}

export async function estimateGeneration(sb: ServiceClient, caller: Caller, modelId: string, params: GenParamsInput, variants: number): Promise<CostEstimate> {
  if (!getModel(modelId)) throw badRequest('Unknown model.');
  return estimateCost(modelId, params, await inputFacts(sb, caller, params), variants);
}

/** Checks inputs, price and budget, then queues one generation per variant. */
export async function createGenerations(sb: ServiceClient, caller: Caller, input: GenerationCreate): Promise<GenerationRow[]> {
  const model = getModel(input.modelId);
  if (!model) throw badRequest('Unknown model.');
  if (model.capability !== input.capability) throw badRequest(`${model.label} does not do ${CAPABILITIES[input.capability].label.toLowerCase()}.`);
  if (model.sunsetAt && new Date(model.sunsetAt).getTime() < Date.now()) throw badRequest(`${model.label} has been retired. Pick another model.`);
  const providers = await providerStatus(sb, caller.workspaceId);
  if (!providers[providerKey(model.provider)]) throw new AppError('provider_not_configured', `Add a ${model.provider} API key in Settings → Providers to use ${model.label}.`, 400, { provider: model.provider });

  const params = resolveParams(model, input.params);
  if (!params.prompt.trim() && ['t2v', 't2i', 'music', 'sfx', 'tts'].includes(model.capability)) throw badRequest('Write a prompt first.');
  const need = model.inputs ?? {};
  if (need.image === 'required' && !params.imageAssetId) throw badRequest(`${model.label} needs a start image.`);
  if (need.video === 'required' && !params.videoAssetId) throw badRequest(`${model.label} needs a video.`);
  if (need.audio === 'required' && !params.audioAssetId) throw badRequest(`${model.label} needs an audio file.`);
  if ((params.referenceAssetIds?.length ?? 0) > (need.references ?? 0)) throw badRequest(`${model.label} takes up to ${need.references ?? 0} reference images.`);
  if ((params.referenceAudioAssetIds?.length ?? 0) > (need.audioReferences ?? 0)) throw badRequest(`${model.label} takes up to ${need.audioReferences ?? 0} reference audio clips.`);

  const ids = [params.imageAssetId, params.endImageAssetId, params.videoAssetId, params.audioAssetId, ...(params.referenceAssetIds ?? []), ...(params.referenceAudioAssetIds ?? [])].filter((x): x is string => !!x);
  if (ids.length) {
    const { data } = await sb.from('assets').select('id, status, deleted_at').eq('workspace_id', caller.workspaceId).in('id', ids);
    const found = new Map((data ?? []).map((a) => [a.id, a]));
    for (const id of ids) {
      const a = found.get(id);
      if (!a || a.deleted_at) throw badRequest('One of the input files no longer exists.');
      if (a.status !== 'ready') throw badRequest('Wait until your input files finish processing.');
    }
  }
  const consentKinds = CONSENT_FOR[model.capability];
  if (consentKinds) {
    if (!input.consentId) throw badRequest('Confirm consent from the person shown before using their face or voice.');
    const { data } = await sb.from('consents').select('id, kind, revoked_at').eq('id', input.consentId).eq('workspace_id', caller.workspaceId).maybeSingle();
    if (!data || data.revoked_at) throw badRequest('That consent record is missing or revoked.');
    if (!consentKinds.includes(data.kind)) throw badRequest('That consent does not cover this kind of edit.');
  }

  const estimate = estimateCost(model.id, params, await inputFacts(sb, caller, params), input.variants);
  // The user approved a price; never charge more than they saw (small rounding tolerance).
  if (estimate.usd > input.confirmCostUsd + Math.max(0.01, input.confirmCostUsd * 0.02)) {
    throw new AppError('price_changed', `The price changed to ${formatUsd(estimate.usd)}. Review it and try again.`, 409, { estimate });
  }
  await assertBudget(sb, caller.workspaceId, estimate.usd);

  const group = input.variants > 1 ? randomUUID() : null;
  const rows: GenerationRow[] = [];
  for (let i = 0; i < input.variants; i++) {
    const p = { ...params, ...(params.seed != null && i > 0 ? { seed: params.seed + i } : {}) };
    const row = check(
      await sb
        .from('generations')
        .insert({
          workspace_id: caller.workspaceId,
          created_by: caller.userId,
          project_id: input.projectId ?? null,
          capability: model.capability,
          provider: model.provider,
          model: model.id,
          prompt: p.prompt || null,
          negative_prompt: p.negativePrompt ?? null,
          params: asJson(p),
          seed: p.seed ?? null,
          input_asset_ids: ids,
          status: 'queued',
          cost_estimate_usd: estimate.perVariantUsd,
          eta_seconds: estimate.etaS,
          variant_group: group,
          variant_index: i,
          source_ref: asJson({ ...(input.sourceRef ?? {}), ...(input.consentId ? { consentId: input.consentId } : {}), via: caller.via }),
        })
        .select('*')
        .single(),
      'Could not start the generation',
    );
    const job = await enqueueJob(sb, { type: 'ai.generate', payload: { generationId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 3, idempotencyKey: `ai.generate:${row.id}` });
    await sb.from('generations').update({ job_id: job.id }).eq('id', row.id);
    rows.push({ ...row, job_id: job.id });
  }
  return rows;
}


export async function toGenerationViews(sb: ServiceClient, workspaceId: string, rows: GenerationRow[]): Promise<GenerationView[]> {
  const ids = rows.flatMap((g) => [...(g.output_asset_ids ?? []), ...(g.input_asset_ids ?? [])]);
  const assets = await assetViewMap(sb, workspaceId, ids);
  return rows.map((g) => ({
    id: g.id,
    capability: g.capability,
    model: g.model,
    modelLabel: getModel(g.model)?.label ?? g.model,
    provider: g.provider,
    prompt: g.prompt,
    params: isRecord(g.params) ? g.params : {},
    status: g.status,
    progress: Number(g.progress ?? 0),
    error: g.error,
    costEstimateUsd: g.cost_estimate_usd == null ? null : Number(g.cost_estimate_usd),
    costActualUsd: g.cost_actual_usd == null ? null : Number(g.cost_actual_usd),
    etaSeconds: g.eta_seconds,
    variantGroup: g.variant_group,
    variantIndex: g.variant_index,
    createdAt: g.created_at,
    completedAt: g.completed_at,
    outputs: (g.output_asset_ids ?? []).map((id) => assets[id]).filter((a): a is AssetView => !!a),
    inputs: (g.input_asset_ids ?? []).map((id) => assets[id]).filter((a): a is AssetView => !!a),
  }));
}

/** Stops queued or running generations and their jobs; the worker also cancels them at the provider. */
export async function cancelGenerations(sb: ServiceClient, workspaceId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data: live } = await sb.from('generations').select('id').eq('workspace_id', workspaceId).in('id', ids).in('status', ['queued', 'running']);
  const liveIds = (live ?? []).map((g) => g.id);
  if (!liveIds.length) return 0;
  const { data: jobs } = await sb.from('jobs').select('id').eq('workspace_id', workspaceId).in('status', ['queued', 'running']).in('type', ['ai.generate', 'ai.poll', 'ai.finalize']).in('payload->>generationId', liveIds);
  for (const j of jobs ?? []) await cancelJob(sb, j.id);
  check(await sb.from('generations').update({ status: 'canceled', completed_at: new Date().toISOString() }).in('id', liveIds).in('status', ['queued', 'running']), 'Could not cancel');
  return liveIds.length;
}
