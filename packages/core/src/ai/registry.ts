import { AGNES_MODELS } from './agnes-models';
import { AUDIO_MODELS } from './audio-models';
import { genParamsSchema, VISUAL_MODELS, type Capability, type GenParams, type GenParamsInput, type ModelDef, type PriceQuote, type ResolvedInputs } from './models';

export const MODELS: ModelDef[] = [...VISUAL_MODELS, ...AGNES_MODELS, ...AUDIO_MODELS];
export const MODELS_BY_ID: Record<string, ModelDef> = Object.fromEntries(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelDef | undefined {
  return MODELS_BY_ID[id];
}

export function modelsFor(capability: Capability, opts: { includeSunset?: boolean; now?: Date } = {}): ModelDef[] {
  const now = opts.now ?? new Date();
  return MODELS.filter((m) => m.capability === capability && (opts.includeSunset || !m.sunsetAt || new Date(m.sunsetAt) > now));
}

export function defaultModelFor(capability: Capability): ModelDef | undefined {
  const list = modelsFor(capability);
  return list.find((m) => m.recommended) ?? list[0];
}

export function resolveParams(model: ModelDef, params: GenParamsInput): GenParams {
  return genParamsSchema.parse({ ...model.defaults, ...params });
}

/** Live provider prices (e.g. from fal's pricing API) scale the static table. */
const liveScale = new Map<string, { scale: number; fetchedAt: number }>();

export function setLivePriceScale(modelId: string, scale: number) {
  if (Number.isFinite(scale) && scale > 0) liveScale.set(modelId, { scale, fetchedAt: Date.now() });
}

export interface CostEstimate extends PriceQuote {
  modelId: string;
  variants: number;
  perVariantUsd: number;
  etaS: number;
  live: boolean;
}

export function estimateCost(modelId: string, params: GenParamsInput, inputs: ResolvedInputs = {}, variants = 1): CostEstimate {
  const model = MODELS_BY_ID[modelId];
  if (!model) throw new Error(`Unknown model ${modelId}`);
  const p = resolveParams(model, params);
  const quote = model.price(p, inputs);
  const live = liveScale.get(modelId);
  const per = quote.usd * (live?.scale ?? 1);
  const n = Math.max(1, Math.min(10, Math.round(variants)));
  return {
    modelId,
    usd: round4(per * n),
    perVariantUsd: round4(per),
    variants: n,
    detail: n > 1 ? `${quote.detail} × ${n} variants` : quote.detail,
    approx: quote.approx,
    etaS: Math.round(model.etaS(p)),
    live: !!live,
  };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
