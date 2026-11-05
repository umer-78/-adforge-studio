import { uploadCompleteSchema } from '@adforge/core';
import { owned, route } from '@/lib/server/api';
import { toAssetView } from '@/lib/server/assets';
import { completeUpload } from '@/lib/server/uploads';

export const POST = route({ body: uploadCompleteSchema }, async ({ sb, caller, body }) => {
  const asset = await owned(sb, 'assets', body.assetId, caller, 'This upload');
  return toAssetView(await completeUpload(sb, caller, asset, body.parts));
});
