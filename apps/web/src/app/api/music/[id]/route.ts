import { musicUpdateSchema } from '@adforge/core';
import { check, logActivity, owned, route } from '@/lib/server/api';
import { toMusicViews } from '@/lib/server/music';

export const PATCH = route({ body: musicUpdateSchema }, async ({ sb, caller, params, body }) => {
  await owned(sb, 'music', params.id!, caller, 'This track');
  const row = check(
    await sb
      .from('music')
      .update({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.genre !== undefined ? { genre: body.genre || null } : {}),
        ...(body.mood !== undefined ? { mood: body.mood || null } : {}),
        ...(body.isAudioLogo !== undefined ? { is_audio_logo: body.isAudioLogo } : {}),
        ...(body.musicalKey !== undefined ? { musical_key: body.musicalKey || null } : {}),
        ...(body.bpm !== undefined ? { bpm: body.bpm } : {}),
        ...(body.lyrics !== undefined ? { lyrics: body.lyrics || null } : {}),
      })
      .eq('id', params.id!)
      .select('*')
      .single(),
    'Could not save the track',
  );
  return (await toMusicViews(sb, caller.workspaceId, [row]))[0];
});

/** Takes the track out of the music library. The file itself stays in the Library. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'music', params.id!, caller, 'This track');
  check(await sb.from('music').delete().eq('id', row.id), 'Could not remove the track');
  await logActivity(sb, caller, 'music.removed', 'music', row.id, { title: row.title });
});
