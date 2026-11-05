import type { ServiceClient } from '@adforge/core/server';
import * as z from 'zod';
import { check, logActivity, notFound, route } from '@/lib/server/api';

async function ownTemplate(sb: ServiceClient, workspaceId: string, id: string) {
  const { data } = await sb.from('templates').select('id, name').eq('id', id).eq('workspace_id', workspaceId).eq('kind', 'timeline').maybeSingle();
  if (!data) throw notFound('That template');
  return data;
}

const patchSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(500).optional() });

export const PATCH = route({ body: patchSchema }, async ({ sb, caller, params, body }) => {
  const t = await ownTemplate(sb, caller.workspaceId, params.id!);
  check(await sb.from('templates').update({ ...(body.name ? { name: body.name } : {}), ...(body.description !== undefined ? { description: body.description || null } : {}) }).eq('id', t.id), 'Could not update the template');
  return { id: t.id };
});

/** Built-in templates can't be deleted; this removes one the workspace saved. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const t = await ownTemplate(sb, caller.workspaceId, params.id!);
  check(await sb.from('templates').delete().eq('id', t.id), 'Could not delete the template');
  await logActivity(sb, caller, 'template.deleted', 'template', t.id, { name: t.name });
});
