import { route } from '@/lib/server/api';

export const GET = route({}, async ({ sb, caller }) => {
  const { data, error } = await sb.rpc('workspace_tags', { ws: caller.workspaceId });
  if (error) throw new Error(error.message);
  return { items: (data ?? []).map((t) => ({ tag: t.tag, uses: Number(t.uses) })) };
});
