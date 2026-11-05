import { recordUsage, transcribe } from '@adforge/core/server';
import { badRequest, route } from '@/lib/server/api';

const MAX_BYTES = 10 * 1024 ** 2;

/** Voice dictation fallback for browsers without built-in speech recognition. */
export const POST = route({ limit: ['dictation', 120, 3600] }, async ({ sb, caller, req }) => {
  const form = await req.formData();
  const file = form.get('audio');
  const durationS = Math.min(300, Math.max(1, Number(form.get('durationS') ?? 10) || 10));
  const language = typeof form.get('language') === 'string' ? String(form.get('language')).slice(0, 12) : undefined;
  if (!(file instanceof Blob) || file.size === 0) throw badRequest('Record something first.');
  if (file.size > MAX_BYTES) throw badRequest('Recordings are limited to about 5 minutes.');
  const out = await transcribe(caller.workspaceId, { audio: Buffer.from(await file.arrayBuffer()), filename: 'dictation.webm', durationS, language });
  await recordUsage(sb, { workspaceId: caller.workspaceId, userId: caller.userId, kind: 'transcription', provider: out.provider, model: out.model, units: durationS / 60, unit: 'minute', costUsd: out.costUsd, meta: { purpose: 'dictation' } });
  return { text: out.text.trim(), language: out.language ?? language ?? null };
});
