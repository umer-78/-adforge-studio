import * as z from 'zod';
import { route } from '@/lib/server/api';
import { toJobView } from '@/lib/server/workspace';

const query = z.object({
  status: z.enum(['active', 'recent', 'failed']).default('recent'),
  type: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('jobs').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(q.limit);
  if (q.status === 'active') req = req.in('status', ['queued', 'running']);
  if (q.status === 'failed') req = req.eq('status', 'failed');
  if (q.status === 'recent') req = req.gte('created_at', new Date(Date.now() - 3 * 86400_000).toISOString());
  if (q.type) req = req.eq('type', q.type);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return { items: (data ?? []).map(toJobView) };
});
