import * as z from 'zod';
import { route } from '@/lib/server/api';

export const GET = route({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }) }, async ({ sb, caller, query }) => {
  const { data, error } = await sb.from('activity').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(query.limit);
  if (error) throw new Error(error.message);
  return { items: data ?? [] };
});
