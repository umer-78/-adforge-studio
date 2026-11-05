import { elevenSharedVoices, elevenVoices, requireProviderKey } from '@adforge/core/server';
import * as z from 'zod';
import { route } from '@/lib/server/api';

const query = z.object({
  scope: z.enum(['account', 'shared']).default('account'),
  search: z.string().trim().max(100).default(''),
  gender: z.enum(['male', 'female', 'neutral']).optional(),
  language: z.string().max(12).optional(),
});

export interface CatalogVoice {
  providerVoiceId: string;
  publicOwnerId: string | null;
  name: string;
  category: string | null;
  description: string | null;
  labels: Record<string, string>;
  previewUrl: string | null;
  cloned: boolean;
  savedId: string | null;
}

/** Voices available to add: the ElevenLabs account's own, or the public shared library. */
export const GET = route({ query, limit: ['voice-catalog', 240, 3600] }, async ({ sb, caller, query: q }) => {
  const key = await requireProviderKey(caller.workspaceId, 'elevenlabs');
  const { data: saved } = await sb.from('voices').select('id, provider_voice_id').eq('workspace_id', caller.workspaceId);
  const savedBy = new Map((saved ?? []).map((v) => [v.provider_voice_id, v.id]));
  if (q.scope === 'account') {
    const voices = await elevenVoices(key, q.search || undefined);
    const items: CatalogVoice[] = voices.map((v) => ({
      providerVoiceId: v.voice_id,
      publicOwnerId: null,
      name: v.name,
      category: v.category ?? null,
      description: v.description ?? null,
      labels: v.labels ?? {},
      previewUrl: v.preview_url ?? null,
      cloned: v.category === 'cloned' || v.category === 'professional',
      savedId: savedBy.get(v.voice_id) ?? null,
    }));
    return { items };
  }
  const voices = await elevenSharedVoices(key, q.search, { gender: q.gender, language: q.language });
  const items: CatalogVoice[] = voices.map((v) => ({
    providerVoiceId: v.voice_id,
    publicOwnerId: v.public_owner_id,
    name: v.name,
    category: v.category ?? null,
    description: v.description ?? null,
    labels: v.labels ?? {},
    previewUrl: v.preview_url ?? null,
    cloned: false,
    savedId: savedBy.get(v.voice_id) ?? null,
  }));
  return { items };
});
