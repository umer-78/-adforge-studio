import { characterSchema, type CharacterRow } from '@adforge/core';
import { badRequest, check, owned, route } from '@/lib/server/api';
import { toCharacterViews } from '@/lib/server/voices';

const patch = characterSchema.partial();

export const PATCH = route({ body: patch }, async ({ sb, caller, body, params }) => {
  const row = await owned(sb, 'characters', params.id!, caller, 'This character');
  if (body.voiceId) await owned(sb, 'voices', body.voiceId, caller, 'The voice');
  if (body.avatarAssetId) {
    const avatar = await owned(sb, 'assets', body.avatarAssetId, caller, 'The avatar image');
    if (avatar.type !== 'image') throw badRequest('Pick an image for the avatar.');
  }
  const update: Partial<CharacterRow> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.voiceId !== undefined) update.voice_id = body.voiceId;
  if (body.defaultEmotion !== undefined) update.default_emotion = body.defaultEmotion;
  if (body.defaultPace !== undefined) update.default_pace = body.defaultPace;
  if (body.avatarAssetId !== undefined) update.avatar_asset_id = body.avatarAssetId;
  if (body.color !== undefined) update.color = body.color;
  const saved = Object.keys(update).length ? check(await sb.from('characters').update(update).eq('id', row.id).select('*').single(), 'Could not save the character') : row;
  return (await toCharacterViews(sb, caller.workspaceId, [saved]))[0];
});

export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'characters', params.id!, caller, 'This character');
  check(await sb.from('characters').delete().eq('id', row.id), 'Could not delete the character');
});
