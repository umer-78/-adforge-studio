import { AppError } from '@adforge/core';
import * as z from 'zod';
import { route } from '@/lib/server/api';
import { carouselAssets, publishableAsset } from '@/lib/server/distribution';
import { cleanHashtags, platformChecks, targetAccounts } from '@/lib/server/posts';

const body = z.object({
  assetId: z.string().uuid(),
  title: z.string().max(200).nullish(),
  caption: z.string().max(5000).default(''),
  hashtags: z.array(z.string().max(80)).max(30).default([]),
  targets: z.array(z.object({ socialAccountId: z.string().uuid(), captionOverride: z.string().max(5000).nullish() })).min(1).max(14),
  carouselAssetIds: z.array(z.string().uuid()).min(2).max(10).nullish(),
});

/** Live checks for the composer: each platform's limits, plus whether the audio is cleared to publish. */
export const POST = route({ body, scope: 'publish', limit: ['post-check', 600, 3600] }, async ({ sb, caller, body: b }) => {
  let license: string | null = null;
  let asset;
  try {
    asset = await publishableAsset(sb, caller, b.assetId);
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== 'license_blocked') throw err;
    license = err.message;
    asset = (await sb.from('assets').select('*').eq('id', b.assetId).eq('workspace_id', caller.workspaceId).single()).data!;
  }
  let carousel = null;
  try {
    carousel = await carouselAssets(sb, caller, asset, b.carouselAssetIds);
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== 'license_blocked') throw err;
    license = err.message;
  }
  const accounts = await targetAccounts(sb, caller, b.targets);
  return {
    checks: platformChecks(asset, { title: b.title, caption: b.caption, hashtags: cleanHashtags(b.hashtags) }, b.targets, accounts, carousel),
    license,
    ready: asset.status === 'ready' && (carousel ?? []).every((a) => a.status === 'ready'),
  };
});
