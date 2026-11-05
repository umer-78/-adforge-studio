import * as z from 'zod';
import { badRequest, check, owned, route } from '@/lib/server/api';

export const PATCH = route({ body: z.object({ name: z.string().trim().min(1).max(120).optional(), parentId: z.string().uuid().nullable().optional() }) }, async ({ sb, caller, params, body }) => {
  const folder = await owned(sb, 'folders', params.id!, caller, 'This folder');
  if (body.parentId === folder.id) throw badRequest('A folder cannot contain itself.');
  return check(
    await sb
      .from('folders')
      .update({ ...(body.name ? { name: body.name } : {}), ...(body.parentId !== undefined ? { parent_id: body.parentId } : {}) })
      .eq('id', folder.id)
      .select('*')
      .single(),
    'Could not rename the folder',
  );
});

/** Deletes the folder; its files stay in the library (unfiled). */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const folder = await owned(sb, 'folders', params.id!, caller, 'This folder');
  check(await sb.from('assets').update({ folder_id: null }).eq('folder_id', folder.id), 'Could not unfile files');
  check(await sb.from('folders').delete().eq('id', folder.id), 'Could not delete the folder');
  return { ok: true };
});
