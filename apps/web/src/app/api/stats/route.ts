import { route } from '@/lib/server/api';

export const GET = route({}, async ({ sb, caller }) => {
  const { data, error } = await sb.rpc('workspace_stats', { ws: caller.workspaceId });
  if (error) throw new Error(error.message);
  return data ?? {};
});
