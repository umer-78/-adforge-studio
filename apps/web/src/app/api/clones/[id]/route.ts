import * as z from 'zod';
import { check, owned, route } from '@/lib/server/api';
import { toBlueprintViews } from '@/lib/server/growth';

export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'ad_blueprints', params.id!, caller, 'The ad clone');
  return (await toBlueprintViews(sb, caller.workspaceId, [row]))[0];
});

export const PATCH = route({ body: z.object({ name: z.string().trim().min(1).max(200) }) }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'ad_blueprints', params.id!, caller, 'The ad clone');
  const updated = check(await sb.from('ad_blueprints').update({ name: body.name }).eq('id', row.id).select('*').single(), 'Could not rename the ad clone');
  return (await toBlueprintViews(sb, caller.workspaceId, [updated]))[0];
});

/** Removes the analysis. Scripts and edits it produced stay. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'ad_blueprints', params.id!, caller, 'The ad clone');
  check(await sb.from('ad_blueprints').delete().eq('id', row.id), 'Could not delete the ad clone');
});
