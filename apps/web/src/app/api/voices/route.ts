import { asJson, AppError } from '@adforge/core';
import { elevenAddSharedVoice, elevenVoices, requireProviderKey } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toVoiceView } from '@/lib/server/voices';

const CLONED = new Set(['cloned', 'professional', 'generated']);

export const GET = route({}, async ({ sb, caller }) => {
  const rows = check(await sb.from('voices').select('*').eq('workspace_id', caller.workspaceId).order('created_at'), 'Could not load voices');
  return { items: rows.map(toVoiceView) };
});

const body = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('account'),
    providerVoiceId: z.string().min(1).max(64),
    /** Needed for voices cloned outside AdForge. */
    consentId: z.string().uuid().optional(),
  }),
  z.object({
    source: z.literal('shared'),
    publicOwnerId: z.string().min(1).max(128),
    providerVoiceId: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(100),
    labels: z.record(z.string(), z.string().max(80)).optional(),
    previewUrl: z.string().url().startsWith('https://').max(1000).nullish(),
  }),
]);

/** Saves a voice from the ElevenLabs account or the shared library to this workspace. */
export const POST = route({ body, limit: ['voices', 120, 3600] }, async ({ sb, caller, body }) => {
  const key = await requireProviderKey(caller.workspaceId, 'elevenlabs');
  let row: { provider_voice_id: string; name: string; labels: Record<string, string>; preview_url: string | null; is_cloned: boolean; consent_id: string | null };
  if (body.source === 'account') {
    const voice = (await elevenVoices(key)).find((v) => v.voice_id === body.providerVoiceId);
    if (!voice) throw badRequest('That voice is not in your ElevenLabs account.');
    const cloned = CLONED.has(voice.category ?? '') && voice.category !== 'generated';
    if (cloned) {
      if (!body.consentId) throw new AppError('consent_required', 'This is a cloned voice. Record consent from the speaker before using it.', 400);
      const consent = await owned(sb, 'consents', body.consentId, caller, 'The consent');
      if (consent.kind !== 'voice_clone' || consent.revoked_at) throw badRequest('Use an active voice-cloning consent.');
    }
    row = { provider_voice_id: voice.voice_id, name: voice.name.slice(0, 100), labels: voice.labels ?? {}, preview_url: voice.preview_url ?? null, is_cloned: cloned, consent_id: cloned ? body.consentId! : null };
  } else {
    const id = await elevenAddSharedVoice(key, body.publicOwnerId, body.providerVoiceId, body.name);
    row = { provider_voice_id: id, name: body.name, labels: { ...body.labels, source: 'shared' }, preview_url: body.previewUrl ?? null, is_cloned: false, consent_id: null };
  }
  const saved = check(
    await sb
      .from('voices')
      .upsert({ workspace_id: caller.workspaceId, provider: 'elevenlabs', ...row, labels: asJson(row.labels), created_by: caller.userId }, { onConflict: 'workspace_id,provider,provider_voice_id' })
      .select('*')
      .single(),
    'Could not save the voice',
  );
  await logActivity(sb, caller, 'voice.add', 'voice', saved.id, { name: saved.name, source: body.source });
  return toVoiceView(saved);
});
