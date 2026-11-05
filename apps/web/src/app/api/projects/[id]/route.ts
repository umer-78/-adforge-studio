import * as z from 'zod';
import { check, owned, route } from '@/lib/server/api';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  archived: z.boolean().optional(),
});

export const PATCH = route({ body: patchSchema }, async ({ sb, caller, params, body }) => {
  const project = await owned(sb, 'projects', params.id!, caller, 'This project');
  return check(
    await sb
      .from('projects')
      .update({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.archived !== undefined ? { archived_at: body.archived ? new Date().toISOString() : null } : {}),
      })
      .eq('id', project.id)
      .select('*')
      .single(),
    'Could not save the project',
  );
});

/** Deletes the project; its files stay in the library. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const project = await owned(sb, 'projects', params.id!, caller, 'This project');
  check(await sb.from('projects').delete().eq('id', project.id), 'Could not delete the project');
  return { ok: true };
});
