import { PACK_ASPECTS, type PackAspect } from '@adforge/core';
import { owned, route } from '@/lib/server/api';
import { assetsByIds, downloadLinks, sizeFamily } from '@/lib/server/assets';

/** Download links for a file and its copies in each shape, named by shape, for one ZIP. */
export const GET = route({ limit: ['asset-zip', 240, 3600] }, async ({ sb, caller, params }) => {
  const asset = await owned(sb, 'assets', params.id!, caller, 'This file');
  const family = await sizeFamily(sb, asset);
  const aspectOf = new Map<string, PackAspect>();
  for (const a of PACK_ASPECTS) if (family[a]) aspectOf.set(family[a]!.id, a);
  const rows = (await assetsByIds(sb, caller.workspaceId, [...aspectOf.keys()])).filter((r) => !r.deleted_at);
  rows.sort((a, b) => PACK_ASPECTS.indexOf(aspectOf.get(a.id)!) - PACK_ASPECTS.indexOf(aspectOf.get(b.id)!));
  const base = asset.name.replace(/\s*\((9:16|1:1|4:5|16:9|2:3|1\.91:1)\)\s*$/, '').trim() || 'Ad';
  const files = await downloadLinks(rows, (r) => `${base} ${aspectOf.get(r.id)!.replace(':', 'x')}`);
  return { name: base, files: files.map((f) => ({ ...f, aspect: aspectOf.get(f.id)! })) };
});
