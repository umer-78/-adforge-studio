import type { Update } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, route } from '@/lib/server/api';
import { purgeAsset } from '@/lib/server/asset-ops';
import { assertInWorkspace } from '@/lib/server/uploads';

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(['trash', 'restore', 'delete', 'favorite', 'unfavorite', 'move', 'tag', 'untag']),
  projectId: z.string().uuid().nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

export const POST = route({ body: bulkSchema }, async ({ sb, caller, body }) => {
  const { data: rows, error } = await sb.from('assets').select('*').eq('workspace_id', caller.workspaceId).in('id', body.ids);
  if (error) throw new Error(error.message);
  const assets = rows ?? [];
  const ids = assets.map((a) => a.id);
  if (!ids.length) return { updated: 0 };
  const update = async (patch: Update<'assets'>) => check(await sb.from('assets').update(patch).in('id', ids).eq('workspace_id', caller.workspaceId), 'Could not update files');
  switch (body.action) {
    case 'trash':
      await update({ deleted_at: new Date().toISOString() });
      break;
    case 'restore':
      await update({ deleted_at: null });
      break;
    case 'favorite':
    case 'unfavorite':
      await update({ is_favorite: body.action === 'favorite' });
      break;
    case 'move':
      await Promise.all([assertInWorkspace(sb, caller, 'projects', body.projectId), assertInWorkspace(sb, caller, 'folders', body.folderId)]);
      await update({ ...(body.projectId !== undefined ? { project_id: body.projectId } : {}), ...(body.folderId !== undefined ? { folder_id: body.folderId } : {}) });
      break;
    case 'tag':
    case 'untag': {
      const tags = (body.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (!tags.length) throw badRequest('Add at least one tag.');
      for (const a of assets) {
        const next = body.action === 'tag' ? [...new Set([...(a.tags ?? []), ...tags])] : (a.tags ?? []).filter((t) => !tags.includes(t));
        check(await sb.from('assets').update({ tags: next }).eq('id', a.id), 'Could not update tags');
      }
      break;
    }
    case 'delete': {
      const trashed = assets.filter((a) => a.deleted_at);
      if (trashed.length !== assets.length) throw badRequest('Only files in the trash can be deleted for good.');
      for (const a of trashed) await purgeAsset(sb, a);
      break;
    }
  }
  return { updated: ids.length };
});
