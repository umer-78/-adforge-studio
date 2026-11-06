import type { SocialPlatform } from '../../constants';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
}

export interface ConnectedAccount {
  platform: SocialPlatform;
  externalId: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  meta: Record<string, unknown>;
  /** Token for this account. Meta pages carry their own page token. */
  token: TokenSet;
}

/** One OAuth app can connect several platforms (Meta connects Facebook Pages and Instagram). */
export type ConnectorId = 'youtube' | 'tiktok' | 'meta' | 'linkedin' | 'x' | 'pinterest';

export interface Connector {
  id: ConnectorId;
  label: string;
  platforms: SocialPlatform[];
  pkce: boolean;
  configured(): boolean;
  authorizeUrl(p: { state: string; redirectUri: string; codeChallenge?: string }): string;
  exchange(code: string, redirectUri: string, verifier?: string | null): Promise<TokenSet>;
  refresh?(token: TokenSet): Promise<TokenSet>;
  accounts(token: TokenSet): Promise<ConnectedAccount[]>;
}

export interface PublishMedia {
  kind: 'video' | 'image';
  /** Signed URL the platform can pull from (valid for hours). */
  url: string;
  /** Local copy for platforms that need the bytes pushed. */
  filePath: string;
  sizeBytes: number;
  contentType: string;
  durationS: number | null;
  width: number | null;
  height: number | null;
  /** Optional cover/thumbnail image URL. */
  coverUrl?: string | null;
}

export interface PublishContext {
  accessToken: string;
  account: { externalId: string; handle: string | null; meta: Record<string, unknown> };
  media: PublishMedia;
  title: string | null;
  /** Final caption with hashtags, already trimmed to the platform limit. */
  caption: string;
  hashtags: string[];
  options: Record<string, unknown>;
  aiGenerated: boolean;
  link?: string | null;
}

export type PublishOutcome =
  | { status: 'published'; externalId: string; externalUrl: string | null }
  | { status: 'processing'; state: Record<string, unknown>; retryAfterS: number; externalId?: string | null };

export interface MetricsSnapshot {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  impressions: number | null;
  clicks: number | null;
  watchTimeS: number | null;
  ctr: number | null;
  raw: Record<string, unknown>;
}

export interface Publisher {
  platform: SocialPlatform;
  publish(ctx: PublishContext): Promise<PublishOutcome>;
  /** Continues a publish that returned `processing`. */
  check?(ctx: PublishContext, state: Record<string, unknown>): Promise<PublishOutcome>;
  metrics?(ctx: { accessToken: string; account: PublishContext['account'] }, externalId: string): Promise<MetricsSnapshot | null>;
  /** Comments on the account's own post (the first comment). Networks without it leave this out. */
  comment?(ctx: { accessToken: string; account: PublishContext['account'] }, externalId: string, text: string): Promise<{ id: string | null }>;
}

export const emptyMetrics = (raw: Record<string, unknown> = {}): MetricsSnapshot => ({
  views: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  impressions: null,
  clicks: null,
  watchTimeS: null,
  ctr: null,
  raw,
});
