import { PROVIDER_INFO, getModel, type KeyProvider } from '@adforge/core';

export const USAGE_KIND_LABEL: Record<string, string> = {
  generation: 'Video and image generation',
  llm: 'Writing and research',
  transcription: 'Transcription',
  embedding: 'Search indexing',
  moderation: 'Moderation',
  tts: 'Voice-over',
  music: 'Music and sound',
  render: 'Rendering',
  storage: 'Storage',
  streaming: 'Streaming',
  publish: 'Publishing',
  other: 'Other',
};

const OTHER_PROVIDERS: Record<string, string> = { mux: 'Mux', meta: 'Meta', tiktok: 'TikTok', supabase: 'Supabase', s3: 'Storage' };

export const usageKindLabel = (kind: string) => USAGE_KIND_LABEL[kind] ?? kind;
export const providerName = (id: string) => (id in PROVIDER_INFO ? PROVIDER_INFO[id as KeyProvider].label : (OTHER_PROVIDERS[id] ?? id));
export const modelName = (id: string) => getModel(id)?.label ?? id;
