import 'server-only';
import { isRecord, type CharacterRow, type VoiceRow } from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';
import { assetViewMap } from './assets';
import type { CharacterView, VoiceView } from '@/lib/types';

export function toVoiceView(v: VoiceRow): VoiceView {
  const labels = isRecord(v.labels) ? Object.fromEntries(Object.entries(v.labels).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
  return {
    id: v.id,
    providerVoiceId: v.provider_voice_id,
    name: v.name,
    provider: v.provider,
    isCloned: v.is_cloned,
    previewUrl: v.preview_url,
    labels,
    consentId: v.consent_id,
    createdAt: v.created_at,
  };
}

export async function toCharacterViews(sb: ServiceClient, workspaceId: string, rows: CharacterRow[]): Promise<CharacterView[]> {
  const voiceIds = [...new Set(rows.map((r) => r.voice_id).filter((x): x is string => !!x))];
  const [{ data: voices }, avatars] = await Promise.all([
    voiceIds.length ? sb.from('voices').select('*').eq('workspace_id', workspaceId).in('id', voiceIds) : Promise.resolve({ data: [] as VoiceRow[] }),
    assetViewMap(sb, workspaceId, rows.map((r) => r.avatar_asset_id)),
  ]);
  const byId = new Map((voices ?? []).map((v) => [v.id, toVoiceView(v)]));
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    voiceId: c.voice_id,
    voice: c.voice_id ? (byId.get(c.voice_id) ?? null) : null,
    defaultEmotion: c.default_emotion,
    defaultPace: Number(c.default_pace),
    avatarAssetId: c.avatar_asset_id,
    avatar: c.avatar_asset_id ? (avatars[c.avatar_asset_id] ?? null) : null,
    color: c.color,
    createdAt: c.created_at,
  }));
}
