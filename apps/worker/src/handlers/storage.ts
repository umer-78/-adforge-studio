import { muxDeleteAsset, storage } from '@adforge/core/server';
import type { JobHandler } from '../runner';

/**
 * Deletes everything stored for a workspace that no longer exists: its files under `<workspaceId>/`
 * in each storage driver, and its Mux copies. Does nothing while the workspace still exists, so a
 * deletion that failed halfway never removes the files of a live workspace.
 */
export const storagePurge: JobHandler<'storage.purge'> = {
  async run(ctx, { workspaceId, drivers, muxAssetIds }) {
    const { data: live, error } = await ctx.sb.from('workspaces').select('id').eq('id', workspaceId).maybeSingle();
    if (error) throw new Error(`Could not check the workspace: ${error.message}`);
    if (live) return { skipped: 'The workspace still exists.' };

    for (const [i, assetId] of muxAssetIds.entries()) {
      ctx.checkAborted();
      await muxDeleteAsset(assetId);
      if (i % 25 === 0) ctx.progress((i / muxAssetIds.length) * 30, 'Deleting streaming copies');
    }
    let files = 0;
    for (const [i, driver] of drivers.entries()) {
      ctx.checkAborted();
      ctx.progress(30 + (i / drivers.length) * 70, 'Deleting files');
      files += await storage(driver).deletePrefix(`${workspaceId}/`);
    }
    return { files, mux: muxAssetIds.length };
  },
};
