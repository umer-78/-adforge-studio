import { characterSchema } from '@adforge/core';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toCharacterViews } from '@/lib/server/voices';

export const GET = route({}, async ({ sb, caller }) => {
  const rows = check(await sb.from('characters').select('*').eq('workspace_id', caller.workspaceId).order('created_at'), 'Could not load characters');
  return { items: await toCharacterViews(sb, caller.workspaceId, rows) };
});

export const POST = route({ body: characterSchema, limit: ['characters', 200, 3600] }, async ({ sb, caller, body }) => {
  if (body.voiceId) await owned(sb, 'voices', body.voiceId, caller, 'The voice');
  if (body.avatarAssetId) {
    const avatar = await owned(sb, 'assets', body.avatarAssetId, caller, 'The avatar image');
    if (avatar.type !== 'image') throw badRequest('Pick an image for the avatar.');
  }
  const row = check(
    await sb
      .from('characters')
      .insert({
        workspace_id: caller.workspaceId,
        name: body.name,
        description: body.description ?? null,
        voice_id: body.voiceId ?? null,
        default_emotion: body.defaultEmotion,
        default_pace: body.defaultPace,
        avatar_asset_id: body.avatarAssetId ?? null,
        color: body.color ?? null,
      })
      .select('*')
      .single(),
    'Could not save the character',
  );
  await logActivity(sb, caller, 'character.create', 'character', row.id, { name: row.name });
  return (await toCharacterViews(sb, caller.workspaceId, [row]))[0];
});
