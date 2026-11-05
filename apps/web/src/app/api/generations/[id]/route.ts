import { owned, route } from '@/lib/server/api';
import { toGenerationViews } from '@/lib/server/generation';

export const GET = route({}, async ({ sb, caller, params }) => {
  const gen = await owned(sb, 'generations', params.id!, caller, 'This generation');
  return (await toGenerationViews(sb, caller.workspaceId, [gen]))[0];
});
