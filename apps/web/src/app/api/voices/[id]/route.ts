import { asJson, AppError } from '@adforge/core';
import { elevenDeleteVoice, requireProviderKey } from '@adforge/core/server';
import * as z from 'zod';
import { check, logActivity, owned, route } from '@/lib/server/api';
import { toVoiceView } from '@/lib/server/voices';

const patch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  labels: z.record(z.string(), z.string().max(80)).optional(),
});

export const PATCH = route({ body: patch }, async ({ sb, caller, body, params }) => {
  const row = await owned(sb, 'voices', params.id!, caller, 'This voice');
  const update = { ...(body.name ? { name: body.name } : {}), ...(body.labels ? { labels: asJson(body.labels) } : {}) };
  const saved = Object.keys(update).length ? check(await sb.from('voices').update(update).eq('id', row.id).select('*').single(), 'Could not save the voice') : row;
  return toVoiceView(saved);
});

/** Removes the voice; a cloned voice is also deleted from ElevenLabs, as promised in its consent. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'voices', params.id!, caller, 'This voice');
  if (row.is_cloned) {
    const key = await requireProviderKey(caller.workspaceId, 'elevenlabs');
    await elevenDeleteVoice(key, row.provider_voice_id).catch((err: unknown) => {
      // Already gone on ElevenLabs is fine; anything else must not leave a clone behind silently.
      if (!(err instanceof AppError && err.status === 422 && /not.?found|does not exist/i.test(err.message))) throw err;
    });
  }
  check(await sb.from('voices').delete().eq('id', row.id), 'Could not delete the voice');
  await logActivity(sb, caller, 'voice.delete', 'voice', row.id, { name: row.name, cloned: row.is_cloned });
});
