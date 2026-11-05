import 'server-only';
import {
  adStructureSchema,
  AppError,
  audioRates,
  inspirationAnalysisSchema,
  isRecord,
  LLM_TASKS,
  llmEstimate,
  parseVariants,
  type AdBlueprintRow,
  type CompetitorRow,
  type InspirationAdRow,
  type LlmTask,
  type ProductRow,
  type TimelineData,
  type VariantBatchRow,
} from '@adforge/core';
import { assertBudget, modelForTier, type ServiceClient } from '@adforge/core/server';
import type { Caller } from './api';
import { assetViewMap } from './assets';
import { jobViewMap, providerStatus } from './workspace';
import type { BlueprintView, CompetitorView, InspirationAdView, ProductCopy, ProductView, VariantBatchView } from '@/lib/types';

const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const ids = (list: (string | null | undefined)[]) => [...new Set(list.filter((x): x is string => !!x))];

/** Typical cost of one structured Claude task with the configured model. */
export function llmTaskUsd(task: LlmTask): number {
  const t = LLM_TASKS[task];
  return llmEstimate(modelForTier(t.tier), t.input, t.output);
}

/** Claude must be configured and the monthly budget must cover the estimate. Returns the estimate. */
export async function assertLlmReady(sb: ServiceClient, caller: Caller, usd: number, what: string): Promise<number> {
  const providers = await providerStatus(sb, caller.workspaceId);
  if (!providers.anthropic) throw new AppError('provider_not_configured', `Add a Claude API key in Settings → Providers to ${what}.`, 400, { provider: 'anthropic' });
  await assertBudget(sb, caller.workspaceId, usd);
  return usd;
}

/* --------------------------------- Products -------------------------------- */

export function productCopy(raw: unknown): ProductCopy {
  const c = isRecord(raw) ? raw : {};
  return {
    category: text(c.category),
    benefits: strs(c.benefits),
    features: strs(c.features),
    audience: text(c.audience),
    painPoints: strs(c.painPoints),
    usps: strs(c.usps),
    offer: typeof c.offer === 'string' && c.offer.trim() ? c.offer : null,
    ctaSuggestions: strs(c.ctaSuggestions),
    hooks: strs(c.hooks),
    tone: text(c.tone),
  };
}

export async function toProductViews(sb: ServiceClient, workspaceId: string, rows: ProductRow[]): Promise<ProductView[]> {
  const [assets, jobs] = await Promise.all([assetViewMap(sb, workspaceId, rows.flatMap((r) => [...r.image_asset_ids, r.logo_asset_id])), jobViewMap(sb, workspaceId, rows.map((r) => r.job_id))]);
  const live = (id: string | null) => (id && assets[id] && !assets[id].deletedAt ? assets[id] : null);
  return rows.map((r) => ({
    id: r.id,
    sourceUrl: r.source_url,
    title: r.title,
    description: r.description,
    price: r.price == null ? null : Number(r.price),
    currency: r.currency,
    brandName: r.brand_name,
    copy: productCopy(r.copy),
    colors: strs(r.colors),
    images: r.image_asset_ids.flatMap((id) => live(id) ?? []),
    logo: live(r.logo_asset_id),
    status: r.status as ProductView['status'],
    error: r.error,
    job: r.job_id ? (jobs[r.job_id] ?? null) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/* -------------------------------- Ad clones -------------------------------- */

export async function toBlueprintViews(sb: ServiceClient, workspaceId: string, rows: AdBlueprintRow[]): Promise<BlueprintView[]> {
  const productIds = ids(rows.map((r) => r.product_id));
  const inspirationIds = ids(rows.map((r) => r.inspiration_ad_id));
  const [assets, jobs, products, inspiration] = await Promise.all([
    assetViewMap(sb, workspaceId, rows.map((r) => r.reference_asset_id)),
    jobViewMap(sb, workspaceId, rows.map((r) => r.job_id)),
    productIds.length ? sb.from('products').select('id, title, status').eq('workspace_id', workspaceId).in('id', productIds).then((r) => r.data ?? []) : [],
    inspirationIds.length ? sb.from('inspiration_ads').select('id, brand, headline, thumbnail_url').eq('workspace_id', workspaceId).in('id', inspirationIds).then((r) => r.data ?? []) : [],
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const inspirationById = new Map(inspiration.map((i) => [i.id, i]));
  return rows.map((r) => {
    const structure = adStructureSchema.safeParse(r.structure);
    const product = r.product_id ? productById.get(r.product_id) : undefined;
    const insp = r.inspiration_ad_id ? inspirationById.get(r.inspiration_ad_id) : undefined;
    return {
      id: r.id,
      name: r.name,
      status: r.status as BlueprintView['status'],
      error: r.error,
      structure: structure.success && structure.data.beats.length ? structure.data : null,
      reference: r.reference_asset_id ? (assets[r.reference_asset_id] ?? null) : null,
      inspirationAdId: r.inspiration_ad_id,
      inspiration: insp ? { id: insp.id, brand: insp.brand, headline: insp.headline, thumbnailUrl: insp.thumbnail_url } : null,
      productId: r.product_id,
      product: product ? { id: product.id, title: product.title, status: product.status as ProductView['status'] } : null,
      scriptId: r.script_id,
      timelineId: r.timeline_id,
      job: r.job_id ? (jobs[r.job_id] ?? null) : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

/* ------------------------------- Inspiration ------------------------------- */

/** Days from the ad's start until it stopped (or today); falls back to what the library reported. */
export function daysRunning(row: Pick<InspirationAdRow, 'started_at' | 'stopped_at' | 'metrics'>, now = Date.now()): number | null {
  if (row.started_at) {
    const end = row.stopped_at ? new Date(row.stopped_at).getTime() : now;
    return Math.max(0, Math.floor((end - new Date(row.started_at).getTime()) / 86_400_000));
  }
  const m = isRecord(row.metrics) ? row.metrics.daysRunning : null;
  return typeof m === 'number' && Number.isFinite(m) ? m : null;
}

export async function toInspirationViews(sb: ServiceClient, workspaceId: string, rows: InspirationAdRow[]): Promise<InspirationAdView[]> {
  const assets = await assetViewMap(sb, workspaceId, rows.map((r) => r.asset_id));
  return rows.map((r) => {
    const asset = r.asset_id ? (assets[r.asset_id] ?? null) : null;
    const analysis = inspirationAnalysisSchema.safeParse(r.analysis);
    return {
      id: r.id,
      externalId: r.external_id,
      brand: r.brand,
      platform: r.platform as InspirationAdView['platform'],
      sourceUrl: r.source_url,
      asset,
      thumbnailUrl: r.thumbnail_url ?? asset?.thumbnailUrl ?? null,
      headline: r.headline,
      body: r.body,
      cta: r.cta,
      tags: r.tags ?? [],
      notes: r.notes,
      status: r.status as InspirationAdView['status'],
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      startedAt: r.started_at,
      stoppedAt: r.stopped_at,
      daysRunning: daysRunning(r),
      metrics: isRecord(r.metrics) ? r.metrics : {},
      analysis: analysis.success ? analysis.data : null,
      isFavorite: r.is_favorite,
      competitorId: r.competitor_id,
      createdAt: r.created_at,
    };
  });
}

export function toCompetitorView(r: CompetitorRow): CompetitorView {
  return {
    id: r.id,
    name: r.name,
    website: r.website,
    metaPageId: r.meta_page_id,
    tiktokHandle: r.tiktok_handle,
    countries: r.countries,
    notes: r.notes,
    isActive: r.is_active,
    adCount: r.ad_count,
    activeAdCount: r.active_ad_count,
    lastSyncedAt: r.last_synced_at,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}

/* --------------------------------- Variants -------------------------------- */

export async function toVariantBatchViews(sb: ServiceClient, workspaceId: string, rows: VariantBatchRow[]): Promise<VariantBatchView[]> {
  const parsed = rows.map((r) => ({ row: r, variants: parseVariants(r.variants) }));
  const timelineIds = ids(rows.map((r) => r.source_timeline_id));
  const [assets, jobs, timelines] = await Promise.all([
    assetViewMap(sb, workspaceId, parsed.flatMap((p) => p.variants.map((v) => v.assetId))),
    jobViewMap(sb, workspaceId, rows.map((r) => r.job_id)),
    timelineIds.length ? sb.from('timelines').select('id, name').eq('workspace_id', workspaceId).in('id', timelineIds).then((r) => r.data ?? []) : [],
  ]);
  const names = new Map(timelines.map((t) => [t.id, t.name]));
  return parsed.map(({ row: r, variants }) => ({
    id: r.id,
    name: r.name,
    sourceTimelineId: r.source_timeline_id,
    sourceTimelineName: r.source_timeline_id ? (names.get(r.source_timeline_id) ?? null) : null,
    dimensions: r.dimensions,
    count: r.count,
    status: r.status as VariantBatchView['status'],
    variants: variants.map((v) => ({ ...v, asset: v.assetId ? (assets[v.assetId] ?? null) : null })),
    costEstimateUsd: r.cost_estimate_usd == null ? null : Number(r.cost_estimate_usd),
    abGroup: r.ab_group,
    error: r.error,
    job: r.job_id ? (jobs[r.job_id] ?? null) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Up-front price of a variant batch: planning with Claude, plus re-voicing every voice-over line per
 * variant when voices vary. Rendering runs on the worker and costs nothing extra.
 */
export async function variantBatchEstimate(sb: ServiceClient, workspaceId: string, tl: TimelineData, dims: readonly string[], count: number): Promise<{ usd: number; voiceChars: number }> {
  let voiceChars = 0;
  if (dims.includes('voice')) {
    const audioIds = ids(tl.tracks.flatMap((t) => t.clips.map((c) => (c.type === 'audio' ? c.assetId : null))));
    if (audioIds.length) {
      const { data } = await sb.from('assets').select('transcript').eq('workspace_id', workspaceId).in('id', audioIds);
      voiceChars = (data ?? []).reduce((sum, a) => sum + (a.transcript?.trim().length ?? 0), 0);
    }
  }
  const usd = llmTaskUsd('planVariants') + (count * voiceChars * audioRates.ttsPer1kChars) / 1000;
  return { usd: Math.round(usd * 10_000) / 10_000, voiceChars };
}
