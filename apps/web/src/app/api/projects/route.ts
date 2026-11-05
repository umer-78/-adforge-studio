import * as z from 'zod';
import { check, route } from '@/lib/server/api';

export const GET = route({ query: z.object({ archived: z.coerce.boolean().optional() }) }, async ({ sb, caller, query }) => {
  let q = sb.from('projects').select('*').eq('workspace_id', caller.workspaceId).order('updated_at', { ascending: false });
  q = query.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { items: data ?? [] };
});

const createSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000).nullish(), color: z.string().regex(/^#[0-9a-f]{6}$/i).nullish() });

export const POST = route({ body: createSchema }, async ({ sb, caller, body }) =>
  check(
    await sb.from('projects').insert({ workspace_id: caller.workspaceId, created_by: caller.userId, name: body.name, description: body.description ?? null, color: body.color ?? '#7C5CFF' }).select('*').single(),
    'Could not create the project',
  ),
);
