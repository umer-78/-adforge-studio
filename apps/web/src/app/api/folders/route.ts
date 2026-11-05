import * as z from 'zod';
import { check, route } from '@/lib/server/api';
import { assertInWorkspace } from '@/lib/server/uploads';

export const GET = route({ query: z.object({ projectId: z.string().uuid().optional() }) }, async ({ sb, caller, query }) => {
  let q = sb.from('folders').select('*').eq('workspace_id', caller.workspaceId).order('name');
  if (query.projectId) q = q.eq('project_id', query.projectId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { items: data ?? [] };
});

const createSchema = z.object({ name: z.string().trim().min(1).max(120), parentId: z.string().uuid().nullish(), projectId: z.string().uuid().nullish() });

export const POST = route({ body: createSchema }, async ({ sb, caller, body }) => {
  await Promise.all([assertInWorkspace(sb, caller, 'folders', body.parentId), assertInWorkspace(sb, caller, 'projects', body.projectId)]);
  return check(
    await sb.from('folders').insert({ workspace_id: caller.workspaceId, name: body.name, parent_id: body.parentId ?? null, project_id: body.projectId ?? null }).select('*').single(),
    'Could not create the folder',
  );
});
