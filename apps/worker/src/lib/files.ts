import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import {
  assetTypeForMime,
  carriedCredits,
  extForMime,
  mergeCredits,
  normalizeMime,
  sniffMatches,
  storageKeys,
  type AssetRow,
  type AssetSource,
  type Json,
} from '@adforge/core';
import { safeStream, storage, type ServiceClient } from '@adforge/core/server';
import type { JobContext } from '../runner';
import { PermanentError } from './errors';

/* --------------------------------- Loading --------------------------------- */

export async function loadAsset(sb: ServiceClient, workspaceId: string, id: string): Promise<AssetRow> {
  const { data, error } = await sb.from('assets').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle();
  if (error) throw new Error(`Could not load asset: ${error.message}`);
  if (!data) throw new PermanentError('The media file no longer exists.');
  return data;
}

export async function loadAssets(sb: ServiceClient, workspaceId: string, ids: string[]): Promise<Map<string, AssetRow>> {
  const out = new Map<string, AssetRow>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from('assets').select('*').eq('workspace_id', workspaceId).in('id', ids.slice(i, i + 100));
    if (error) throw new Error(`Could not load assets: ${error.message}`);
    for (const row of data ?? []) out.set(row.id, row);
  }
  return out;
}

/* --------------------------------- Storage --------------------------------- */

/** Downloads an asset's original into the job's scratch directory. */
export async function downloadAsset(ctx: JobContext, asset: AssetRow, name?: string): Promise<string> {
  const dir = await ctx.tmp();
  const file = path.join(dir, `${name ?? asset.id}.${extForMime(asset.mime_type)}`);
  await storage(asset.storage_driver).downloadToFile(asset.storage_key, file);
  ctx.checkAborted();
  return file;
}

export async function downloadKey(ctx: JobContext, driver: string, key: string, file: string): Promise<string> {
  await storage(driver).downloadToFile(key, path.join(await ctx.tmp(), file));
  return path.join(await ctx.tmp(), file);
}

export async function putDerived(asset: Pick<AssetRow, 'workspace_id' | 'id' | 'storage_driver'>, file: string, localPath: string, contentType: string): Promise<{ key: string; bytes: number }> {
  const key = storageKeys.derived(asset.workspace_id, asset.id, file);
  const bytes = await storage(asset.storage_driver).putFile(key, localPath, contentType, { cacheControl: 'private, max-age=31536000, immutable' });
  return { key, bytes };
}

export function signedAssetUrl(asset: Pick<AssetRow, 'storage_driver' | 'storage_key'>, ttlS: number): Promise<string> {
  return storage(asset.storage_driver).signedReadUrl(asset.storage_key, ttlS);
}

/* ------------------------------ Remote downloads ----------------------------- */

/**
 * Streams a URL to disk through the SSRF-safe client with a size cap. Used for provider outputs,
 * product images and imported media.
 */
export async function downloadUrl(url: string, dest: string, opts: { maxBytes?: number; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<{ bytes: number; contentType: string }> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 ** 3;
  const res = await safeStream(url, { timeoutMs: opts.timeoutMs ?? 15 * 60_000, maxRedirects: 5 });
  const onAbort = () => res.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (res.status < 200 || res.status >= 300) throw new Error(`Download failed with HTTP ${res.status}`);
    if (res.contentLength != null && res.contentLength > maxBytes) throw new PermanentError(`The file is larger than ${Math.round(maxBytes / 1024 ** 2)} MB.`);
    let bytes = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        if (bytes > maxBytes) cb(new PermanentError(`The file is larger than ${Math.round(maxBytes / 1024 ** 2)} MB.`));
        else cb(null, chunk);
      },
    });
    await pipeline(res.body, limit, createWriteStream(dest));
    return { bytes, contentType: res.contentType };
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    res.abort();
  }
}

/* ------------------------------- Type detection ------------------------------ */

const CANDIDATES = [
  'video/mp4',
  'video/webm',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'model/gltf-binary',
];

/** Content type from the file's leading bytes, falling back to the hint or file name. */
export async function detectMime(file: string, hint?: string | null, filename = ''): Promise<string> {
  const fh = await open(file, 'r');
  const head = Buffer.alloc(64);
  try {
    await fh.read(head, 0, 64, 0);
  } finally {
    await fh.close();
  }
  const hinted = normalizeMime(hint, filename || file);
  if (hinted && sniffMatches(hinted, head)) return hinted;
  for (const m of CANDIDATES) if (sniffMatches(m, head)) return m === 'video/mp4' && /audio/.test(hinted) ? 'audio/mp4' : m;
  if (hinted === 'model/gltf+json') return hinted;
  throw new PermanentError('The file type is not supported.');
}

/* ---------------------------------- Assets ---------------------------------- */

export interface NewAsset {
  workspaceId: string;
  filePath: string;
  name: string;
  source: AssetSource;
  mime?: string | null;
  createdBy?: string | null;
  projectId?: string | null;
  folderId?: string | null;
  generationId?: string | null;
  isAiGenerated?: boolean;
  parentAssetId?: string | null;
  licenseId?: string | null;
  description?: string | null;
  tags?: string[];
  meta?: Record<string, unknown>;
  /** Skip queueing media.process (the caller processes the file itself). */
  skipProcessing?: boolean;
}

/**
 * A file made from another keeps what it owes: the original's license when none is given, and its
 * credit lines (plus the original license's credit when the new file has a license of its own).
 */
async function inheritFromParent(ctx: JobContext, input: NewAsset): Promise<{ licenseId: string | null; meta: Record<string, unknown> }> {
  const own = input.meta ?? {};
  if (!input.parentAssetId) return { licenseId: input.licenseId ?? null, meta: own };
  const { data: parent } = await ctx.sb.from('assets').select('license_id, meta').eq('id', input.parentAssetId).maybeSingle();
  if (!parent) return { licenseId: input.licenseId ?? null, meta: own };
  const licenseId = input.licenseId === undefined ? parent.license_id : input.licenseId;
  let fromLicense: string[] = [];
  if (parent.license_id && parent.license_id !== licenseId) {
    const { data: lic } = await ctx.sb.from('licenses').select('attribution').eq('id', parent.license_id).maybeSingle();
    if (lic?.attribution) fromLicense = [lic.attribution];
  }
  const credits = mergeCredits(carriedCredits(own), carriedCredits(parent.meta), fromLicense);
  return { licenseId, meta: credits.length ? { ...own, credits } : own };
}

/** Uploads a local file as a new library asset and queues its processing. */
export async function createAssetFromFile(ctx: JobContext, input: NewAsset): Promise<AssetRow> {
  const mime = await detectMime(input.filePath, input.mime, input.name);
  const type = assetTypeForMime(mime);
  if (!type) throw new PermanentError(`Unsupported output type ${mime}`);
  const id = randomUUID();
  const driver = storage();
  const key = storageKeys.original(input.workspaceId, id, extForMime(mime));
  const size = (await stat(input.filePath)).size;
  const { licenseId, meta } = await inheritFromParent(ctx, input);
  await driver.putFile(key, input.filePath, mime);
  const { data, error } = await ctx.sb
    .from('assets')
    .insert({
      id,
      workspace_id: input.workspaceId,
      type,
      source: input.source,
      name: input.name.slice(0, 300) || 'Untitled',
      description: input.description ?? null,
      mime_type: mime,
      size_bytes: size,
      storage_driver: driver.name,
      storage_key: key,
      status: 'processing',
      created_by: input.createdBy ?? ctx.job.created_by,
      project_id: input.projectId ?? null,
      folder_id: input.folderId ?? null,
      generation_id: input.generationId ?? null,
      is_ai_generated: input.isAiGenerated ?? false,
      parent_asset_id: input.parentAssetId ?? null,
      license_id: licenseId,
      tags: input.tags ?? [],
      meta: meta as Json,
    })
    .select('*')
    .single();
  if (error) {
    await driver.deleteObjects([key]).catch(() => undefined);
    throw new Error(`Could not save the new file: ${error.message}`);
  }
  if (!input.skipProcessing) await ctx.enqueue('media.process', { assetId: id }, { idempotencyKey: `media.process:${id}`, priority: 5 });
  return data;
}

/** Creates a "generated" license row so generated media passes commercial-use checks. */
export async function generatedLicense(ctx: JobContext, workspaceId: string, provider: string, notes: string): Promise<string | null> {
  const { data, error } = await ctx.sb
    .from('licenses')
    .insert({ workspace_id: workspaceId, kind: 'generated', provider, commercial_use: true, source: provider, notes, created_by: ctx.job.created_by })
    .select('id')
    .single();
  if (error) {
    ctx.log.warn({ err: error.message }, 'could not create license row');
    return null;
  }
  return data.id;
}

export const extFromName = (name: string) => path.extname(name).replace('.', '').toLowerCase();
