import type { Database, Json } from './database.types';

export type { Database, Json };

type PublicSchema = Database['public'];
export type TableName = keyof PublicSchema['Tables'];
export type Row<T extends TableName> = PublicSchema['Tables'][T]['Row'];
export type Insert<T extends TableName> = PublicSchema['Tables'][T]['Insert'];
export type Update<T extends TableName> = PublicSchema['Tables'][T]['Update'];

export type AssetRow = Row<'assets'>;
export type GenerationRow = Row<'generations'>;
export type JobRow = Row<'jobs'>;
export type TimelineRow = Row<'timelines'>;
export type RenderRow = Row<'renders'>;
export type PostRow = Row<'posts'>;
export type PostTargetRow = Row<'post_targets'>;
export type WorkspaceRow = Row<'workspaces'>;
export type ProductRow = Row<'products'>;
export type ScriptRow = Row<'scripts'>;
export type SocialAccountRow = Row<'social_accounts'>;
export type AdAccountRow = Row<'ad_accounts'>;
export type AdCampaignRow = Row<'ad_campaigns'>;
export type AdRow = Row<'ads'>;
export type CompetitorRow = Row<'competitors'>;
export type InspirationAdRow = Row<'inspiration_ads'>;
export type AdBlueprintRow = Row<'ad_blueprints'>;
export type VariantBatchRow = Row<'variant_batches'>;
export type AgentRunRow = Row<'agent_runs'>;
export type TemplateRow = Row<'templates'>;
export type BrandKitRow = Row<'brand_kits'>;
export type VoiceRow = Row<'voices'>;
export type CharacterRow = Row<'characters'>;
export type ConsentRow = Row<'consents'>;
export type MusicRow = Row<'music'>;
export type SfxRow = Row<'sfx'>;
export type AudioTrackRow = Row<'audio_tracks'>;

/** Shape stored in assets.playback. */
export interface PlaybackInfo {
  provider?: 'mux' | 'hls' | 'file';
  muxAssetId?: string;
  muxPlaybackId?: string;
  muxStatus?: 'preparing' | 'ready' | 'errored';
  hlsKey?: string;
  policy?: 'signed' | 'public';
}

/** Shape stored in assets.meta after processing. */
export interface AssetMeta {
  codec?: string;
  audioCodec?: string | null;
  bitrate?: number;
  hasAudio?: boolean;
  rotation?: number;
  colors?: string[];
  analysis?: unknown;
  score?: unknown;
  scenes?: number[];
  beats?: number[];
  bpm?: number;
  loudnessLufs?: number;
  silences?: [number, number][];
  role?: 'voice' | 'music' | 'sfx' | 'other';
  generator?: { provider: string; model: string };
  sourceUrl?: string;
  /** Set on library copies of a built-in sound effect. */
  builtinSfx?: string;
  [key: string]: unknown;
}

export const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value ?? null)) as Json;
