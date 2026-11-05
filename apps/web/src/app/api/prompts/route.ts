import * as z from 'zod';
import { route } from '@/lib/server/api';

export const GET = route({ query: z.object({ saved: z.coerce.boolean().optional(), q: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }) }, async ({ sb, caller, query }) => {
  let req = sb.from('prompts').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(query.limit);
  if (query.saved) req = req.eq('is_saved', true);
  if (query.q) req = req.or(`idea.ilike.%${query.q.replace(/[%,()]/g, ' ')}%,prompt.ilike.%${query.q.replace(/[%,()]/g, ' ')}%,title.ilike.%${query.q.replace(/[%,()]/g, ' ')}%`);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return { items: data ?? [] };
});
