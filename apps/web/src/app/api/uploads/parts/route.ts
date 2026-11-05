import { uploadPartsSchema } from '@adforge/core';
import { storage } from '@adforge/core/server';
import { badRequest, owned, route } from '@/lib/server/api';
import { uploadState } from '@/lib/server/uploads';

/** Signs S3/R2 multipart part URLs in batches. */
export const POST = route({ body: uploadPartsSchema }, async ({ sb, caller, body }) => {
  const asset = await owned(sb, 'assets', body.assetId, caller, 'This upload');
  const state = uploadState(asset);
  if (asset.status !== 'uploading' || state.kind !== 's3' || !state.uploadId) throw badRequest('This upload does not use multipart parts.');
  const parts = await storage(asset.storage_driver).signParts(asset.storage_key, state.uploadId, body.partNumbers);
  return { parts };
});
