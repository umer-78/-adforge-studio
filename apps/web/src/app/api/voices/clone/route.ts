import { asJson } from '@adforge/core';
import { elevenCloneVoice, requireProviderKey, storage } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toVoiceView } from '@/lib/server/voices';

export const maxDuration = 120;

const body = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  consentId: z.string().uuid(),
  /** Library recordings of the speaker: 1–10 audio files, ideally 1–3 minutes in total. */
  assetIds: z.array(z.string().uuid()).min(1).max(10),
  removeNoise: z.boolean().default(true),
});

const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

/** Instant voice clone from consented recordings. */
export const POST = route({ body, scope: 'generate', limit: ['voice-clone', 20, 3600] }, async ({ sb, caller, body }) => {
  const consent = await owned(sb, 'consents', body.consentId, caller, 'The consent');
  if (consent.kind !== 'voice_clone' || consent.revoked_at) throw badRequest('Use an active voice-cloning consent.');
  const { data: assets, error } = await sb.from('assets').select('id, name, type, mime_type, status, size_bytes, duration_s, storage_driver, storage_key, deleted_at').eq('workspace_id', caller.workspaceId).in('id', body.assetIds);
  if (error) throw new Error(error.message);
  const list = body.assetIds.map((id) => assets?.find((a) => a.id === id));
  if (list.some((a) => !a || a.deleted_at)) throw badRequest('One of the recordings no longer exists.');
  const files = list as NonNullable<(typeof list)[number]>[];
  if (files.some((a) => a.type !== 'audio')) throw badRequest('Voice cloning needs audio recordings.');
  if (files.some((a) => a.status !== 'ready')) throw badRequest('Wait until the recordings finish processing.');
  const totalS = files.reduce((s, a) => s + Number(a.duration_s ?? 0), 0);
  if (totalS < 10) throw badRequest('Add at least 10 seconds of clear speech (1–3 minutes works best).');
  if (files.reduce((s, a) => s + Number(a.size_bytes), 0) > MAX_TOTAL_BYTES) throw badRequest('The recordings are too large together; keep them under 60 MB.');

  const key = await requireProviderKey(caller.workspaceId, 'elevenlabs');
  const blobs = await Promise.all(
    files.map(async (a) => ({ data: new Blob([new Uint8Array(await storage(a.storage_driver).getBuffer(a.storage_key))], { type: a.mime_type }), filename: a.name })),
  );
  const voiceId = await elevenCloneVoice(key, body.name, blobs, { description: body.description, removeNoise: body.removeNoise });
  const saved = check(
    await sb
      .from('voices')
      .insert({
        workspace_id: caller.workspaceId,
        provider: 'elevenlabs',
        provider_voice_id: voiceId,
        name: body.name,
        labels: asJson({ source: 'clone', speaker: consent.subject_name }),
        is_cloned: true,
        consent_id: consent.id,
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not save the cloned voice',
  );
  await logActivity(sb, caller, 'voice.clone', 'voice', saved.id, { name: saved.name, consentId: consent.id, seconds: Math.round(totalS) });
  return toVoiceView(saved);
});
