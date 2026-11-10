import * as z from 'zod';
import { PACK_ASPECTS } from './constants';

const id = z.string().uuid();

export const JOB_PAYLOADS = {
  'media.process': z.object({ assetId: id }),
  'media.analyze': z.object({ assetId: id, steps: z.array(z.enum(['transcribe', 'tags', 'embed'])).default(['transcribe', 'tags', 'embed']) }),
  'media.score': z.object({ assetId: id, platform: z.string().optional() }),
  'media.detect': z.object({ assetId: id, kind: z.enum(['silence', 'scenes', 'beats']), thresholdDb: z.number().optional(), minSilenceS: z.number().optional() }),
  'media.reframe': z.object({ assetId: id, aspect: z.enum(['9:16', '1:1', '4:5', '16:9']) }),
  'media.sizes': z.object({ assetId: id, aspects: z.array(z.enum(PACK_ASPECTS)).min(1).max(PACK_ASPECTS.length), mode: z.enum(['smart', 'fit']).default('smart') }),
  'audio.process': z.object({ assetId: id, op: z.enum(['normalize', 'denoise', 'isolate', 'stems']), targetLufs: z.number().optional() }),
  'ai.generate': z.object({ generationId: id }),
  'ai.finalize': z.object({ generationId: id }),
  'ai.poll': z.object({ generationId: id }),
  'render.timeline': z.object({ renderId: id }),
  'publish.post': z.object({ postTargetId: id }),
  'publish.metrics': z.object({ postTargetId: id.optional() }),
  'publish.comment': z.object({ postTargetId: id }),
  'product.import': z.object({ productId: id }),
  /** Downloads a free library file into an asset the API already created. */
  'stock.import': z.object({ assetId: id }),
  'media.check': z.object({ assetId: id, parts: z.array(z.enum(['flash', 'loudness', 'soundOff', 'policy'])).optional() }),
  'script.write': z.object({ scriptId: id }),
  'ad.clone': z.object({ blueprintId: id, step: z.enum(['analyze', 'adapt']) }),
  'inspiration.analyze': z.object({ inspirationAdId: id }),
  'competitors.sync': z.object({ competitorId: id.optional() }),
  'variants.plan': z.object({ batchId: id }),
  'variants.render': z.object({ batchId: id }),
  'ads.launch': z.object({ campaignId: id }),
  'ads.status': z.object({ adId: id, status: z.enum(['active', 'paused']) }),
  'ads.sync': z.object({ campaignId: id.optional() }),
  'agent.step': z.object({ runId: id }),
  /** `all` empties a workspace's trash now instead of waiting for its retention period. */
  'trash.purge': z.object({ all: z.boolean().optional() }),
  /** Removes a deleted workspace's stored files and Mux copies. Queued without a workspace, since its rows are gone. */
  'storage.purge': z.object({
    workspaceId: id,
    drivers: z.array(z.enum(['supabase', 's3'])).min(1).max(2),
    muxAssetIds: z.array(z.string().min(1).max(200)).max(20_000).default([]),
  }),
} as const;

export type JobType = keyof typeof JOB_PAYLOADS;
export type JobPayload<T extends JobType> = z.infer<(typeof JOB_PAYLOADS)[T]>;
export const JOB_TYPES = Object.keys(JOB_PAYLOADS) as JobType[];

export function parseJobPayload<T extends JobType>(type: T, payload: unknown): JobPayload<T> {
  return JOB_PAYLOADS[type].parse(payload ?? {}) as JobPayload<T>;
}

export const JOB_LABELS: Record<JobType, string> = {
  'media.process': 'Processing upload',
  'media.analyze': 'Analyzing with AI',
  'media.score': 'Scoring ad',
  'media.detect': 'Detecting',
  'media.reframe': 'Auto-reframing',
  'media.sizes': 'Making every size',
  'audio.process': 'Processing audio',
  'ai.generate': 'Generating',
  'ai.finalize': 'Saving generation',
  'ai.poll': 'Checking generation',
  'render.timeline': 'Rendering video',
  'publish.post': 'Publishing',
  'publish.metrics': 'Syncing post metrics',
  'publish.comment': 'Posting the first comment',
  'product.import': 'Importing product page',
  'stock.import': 'Importing free media',
  'media.check': 'Checking flashes, loudness and wording',
  'script.write': 'Writing script',
  'ad.clone': 'Cloning ad structure',
  'inspiration.analyze': 'Analyzing ad',
  'competitors.sync': 'Checking competitor ads',
  'variants.plan': 'Planning variants',
  'variants.render': 'Rendering variants',
  'ads.launch': 'Launching ads',
  'ads.status': 'Updating ad status',
  'ads.sync': 'Syncing ad results',
  'agent.step': 'Agent working',
  'trash.purge': 'Emptying trash',
  'storage.purge': 'Deleting stored files',
};

/** Worker pools: heavy jobs run with lower concurrency. */
export const JOB_POOLS: { name: string; types: JobType[]; concurrency: number; leaseS: number }[] = [
  { name: 'render', types: ['render.timeline', 'variants.render'], concurrency: 1, leaseS: 1800 },
  { name: 'media', types: ['media.process', 'audio.process', 'media.detect', 'media.check', 'media.sizes'], concurrency: 2, leaseS: 900 },
  {
    name: 'ai',
    types: ['ai.generate', 'ai.finalize', 'ai.poll', 'media.analyze', 'media.score', 'media.reframe', 'product.import', 'script.write', 'ad.clone', 'inspiration.analyze', 'variants.plan', 'agent.step'],
    concurrency: 4,
    leaseS: 600,
  },
  { name: 'network', types: ['publish.post', 'publish.metrics', 'publish.comment', 'stock.import', 'ads.launch', 'ads.status', 'ads.sync', 'competitors.sync', 'trash.purge', 'storage.purge'], concurrency: 3, leaseS: 900 },
];
