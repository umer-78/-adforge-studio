import { owned, route } from '@/lib/server/api';
import { cancelGenerations, toGenerationViews } from '@/lib/server/generation';

/** Stops a queued or running generation; the worker also cancels it at the provider. */
export const POST = route({ scope: 'generate' }, async ({ sb, caller, params }) => {
  const gen = await owned(sb, 'generations', params.id!, caller, 'This generation');
  await cancelGenerations(sb, caller.workspaceId, [gen.id]);
  return (await toGenerationViews(sb, caller.workspaceId, [await owned(sb, 'generations', gen.id, caller)]))[0];
});
