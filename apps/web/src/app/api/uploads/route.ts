import { uploadCreateSchema } from '@adforge/core';
import { storage } from '@adforge/core/server';
import * as z from 'zod';
import { check, owned, route } from '@/lib/server/api';
import { toAssetView } from '@/lib/server/assets';
import { createUpload, uploadState } from '@/lib/server/uploads';

/** Starts an upload: returns the new asset and how the browser should send the bytes. */
export const POST = route({ body: uploadCreateSchema, limit: ['uploads', 300, 3600] }, async ({ sb, caller, body }) => {
  const { asset, ticket } = await createUpload(sb, caller, body);
  return { asset: await toAssetView(asset), ticket };
});

/** Aborts an unfinished upload. */
export const DELETE = route({ query: z.object({ assetId: z.string().uuid() }) }, async ({ sb, caller, query }) => {
  const asset = await owned(sb, 'assets', query.assetId, caller, 'This upload');
  if (asset.status !== 'uploading') return { ok: true };
  const state = uploadState(asset);
  const driver = storage(asset.storage_driver);
  if (state.kind === 's3' && state.uploadId) await driver.abortUpload(asset.storage_key, state.uploadId).catch(() => undefined);
  await driver.deleteObjects([asset.storage_key]).catch(() => undefined);
  check(await sb.from('assets').delete().eq('id', asset.id), 'Could not cancel the upload');
  return { ok: true };
});
