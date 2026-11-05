import 'server-only';
import { isRecord, storageKeys, type AssetRow, type PlaybackInfo } from '@adforge/core';
import { muxDeleteAsset, storage, type ServiceClient } from '@adforge/core/server';

/** Deletes an asset's files (storage + Mux) and its row. Used for "delete forever" from the trash. */
export async function purgeAsset(sb: ServiceClient, asset: AssetRow) {
  await storage(asset.storage_driver).deletePrefix(storageKeys.assetPrefix(asset.workspace_id, asset.id));
  const pb = (isRecord(asset.playback) ? asset.playback : {}) as PlaybackInfo;
  if (pb.muxAssetId) await muxDeleteAsset(pb.muxAssetId).catch(() => undefined);
  const { error } = await sb.from('assets').delete().eq('id', asset.id);
  if (error) throw new Error(`Could not delete ${asset.name}: ${error.message}`);
}
