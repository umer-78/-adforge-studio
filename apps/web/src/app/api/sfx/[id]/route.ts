import { sfxUpdateSchema } from '@adforge/core';
import { check, logActivity, owned, route } from '@/lib/server/api';
import { toSfxViews } from '@/lib/server/music';

export const PATCH = route({ body: sfxUpdateSchema }, async ({ sb, caller, params, body }) => {
  await owned(sb, 'sfx', params.id!, caller, 'This sound');
  const row = check(
    await sb
      .from('sfx')
      .update({ ...(body.name !== undefined ? { name: body.name } : {}), ...(body.category !== undefined ? { category: body.category } : {}), ...(body.tags !== undefined ? { tags: body.tags } : {}) })
      .eq('id', params.id!)
      .select('*')
      .single(),
    'Could not save the sound',
  );
  return (await toSfxViews(sb, caller.workspaceId, [row]))[0];
});

/** Takes the sound out of your effects. The file stays in the Library. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'sfx', params.id!, caller, 'This sound');
  check(await sb.from('sfx').delete().eq('id', row.id), 'Could not remove the sound');
  await logActivity(sb, caller, 'sfx.removed', 'sfx', row.id, { name: row.name });
});
