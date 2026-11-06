import * as z from 'zod';
import { badRequest, route } from '@/lib/server/api';
import { assetsByIds, downloadLinks } from '@/lib/server/assets';

const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

/** Download links for the chosen files, in the order given, so the browser can save them as one ZIP. */
export const POST = route({ body: bodySchema, limit: ['asset-zip', 240, 3600] }, async ({ sb, caller, body }) => {
  const rows = await assetsByIds(sb, caller.workspaceId, body.ids);
  const byId = new Map(rows.filter((r) => !r.deleted_at && r.status === 'ready').map((r) => [r.id, r]));
  const ordered = [...new Set(body.ids)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  if (!ordered.length) throw badRequest('None of these files are ready to download.');
  return { files: await downloadLinks(ordered) };
});
