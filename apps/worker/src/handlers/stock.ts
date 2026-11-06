import path from 'node:path';
import { assetTypeForMime, extForMime, isRecord, storageKeys, type AssetType, type StockKind } from '@adforge/core';
import { features, storage } from '@adforge/core/server';
import { PermanentError } from '../lib/errors';
import { detectMime, downloadUrl } from '../lib/files';
import type { JobHandler } from '../runner';

const TYPE_FOR_KIND: Record<StockKind, AssetType> = { photo: 'image', video: 'video', music: 'audio', sound: 'audio' };

/** Pending free-library downloads carry `upload_state.kind = 'stock'` until the file is stored. */
function pendingStock(row: { upload_state: unknown; meta: unknown }): { url: string; kind: StockKind } | null {
  if (!isRecord(row.upload_state) || row.upload_state.kind !== 'stock') return null;
  const stock = isRecord(row.meta) && isRecord(row.meta.stock) ? row.meta.stock : null;
  const url = stock && typeof stock.downloadUrl === 'string' ? stock.downloadUrl : null;
  const kind = stock?.kind;
  if (!url || (kind !== 'photo' && kind !== 'video' && kind !== 'music' && kind !== 'sound')) return null;
  return { url, kind };
}

export const stockImport: JobHandler<'stock.import'> = {
  async run(ctx, { assetId }) {
    const { data: asset } = await ctx.sb.from('assets').select('*').eq('id', assetId).eq('workspace_id', ctx.workspaceId).maybeSingle();
    if (!asset || asset.deleted_at) throw new PermanentError('This file was deleted before it finished importing.');
    const pending = pendingStock(asset);
    if (!pending) return { skipped: 'already imported' };

    ctx.progress(5, 'Downloading');
    const dir = await ctx.tmp();
    const file = path.join(dir, `stock.${extForMime(asset.mime_type)}`);
    // The SSRF-safe client: Openverse files live on many hosts, so the address alone is not trusted.
    const res = await downloadUrl(pending.url, file, { maxBytes: features().maxUploadBytes, timeoutMs: 10 * 60_000, signal: ctx.signal });
    ctx.checkAborted();
    const mime = await detectMime(file, res.contentType, new URL(pending.url).pathname);
    if (assetTypeForMime(mime) !== TYPE_FOR_KIND[pending.kind]) throw new PermanentError('The library sent a different kind of file than it listed. Pick another one.');

    ctx.progress(70, 'Saving to your library');
    const key = storageKeys.original(asset.workspace_id, asset.id, extForMime(mime));
    const driver = storage(asset.storage_driver);
    const bytes = await driver.putFile(key, file, mime);
    const { error } = await ctx.sb
      .from('assets')
      .update({ storage_key: key, mime_type: mime, size_bytes: bytes, status: 'processing', upload_state: null, processing_error: null })
      .eq('id', asset.id);
    if (error) throw new Error(`Could not save the import: ${error.message}`);
    await ctx.enqueue('media.process', { assetId: asset.id }, { idempotencyKey: `media.process:${asset.id}:v${asset.version}`, priority: 5 });
    return { assetId: asset.id, bytes };
  },

  async onFailure(ctx, { assetId }, message) {
    await ctx.sb.from('assets').update({ status: 'failed', processing_error: message, upload_state: null }).eq('id', assetId).eq('status', 'processing');
  },
};
