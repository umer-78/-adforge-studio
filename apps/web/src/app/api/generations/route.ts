import { capabilitySchema } from '@adforge/core';
import * as z from 'zod';
import { route } from '@/lib/server/api';
import { toGenerationViews } from '@/lib/server/generation';

const query = z.object({
  capability: z.union([capabilitySchema, z.array(capabilitySchema)]).optional(),
  status: z.enum(['active', 'succeeded', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('generations').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(q.limit + 1);
  if (q.capability) req = req.in('capability', Array.isArray(q.capability) ? q.capability : [q.capability]);
  if (q.status === 'active') req = req.in('status', ['queued', 'running']);
  else if (q.status) req = req.eq('status', q.status);
  if (q.cursor) req = req.lt('created_at', q.cursor);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  const page = (data ?? []).slice(0, q.limit);
  return { items: await toGenerationViews(sb, caller.workspaceId, page), nextCursor: (data?.length ?? 0) > q.limit ? page[page.length - 1]!.created_at : null };
});
