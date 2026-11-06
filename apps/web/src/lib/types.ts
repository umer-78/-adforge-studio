import type { AssetSource, AssetStatus, AssetType, BioTheme, Capability, LicenseKind, LicenseState, KeyProvider, ModelDef, ScriptLine, SizeMode } from '@adforge/core';

/** Asset as the browser sees it: rows plus short-lived signed URLs. */
export interface AssetView {
  id: string;
  /** Credit lines owed wherever this file is used (free media that asks for one, and anything made from it). */
  credits: string[];
  name: string;
  type: AssetType;
  mimeType: string;
  status: AssetStatus;
  source: AssetSource;
  sizeBytes: number;
  durationS: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  tags: string[];
  aiTags: string[];
  aiCaption: string | null;
  description: string | null;
  isFavorite: boolean;
  isAiGenerated: boolean;
  projectId: string | null;
  folderId: string | null;
  parentAssetId: string | null;
  generationId: string | null;
  licenseId: string | null;
  version: number;
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  role: 'voice' | 'music' | 'sfx' | 'other' | null;
  colors: string[];
  score: AdScoreView | null;
  /** Signed URL of the original file. */
  url: string | null;
  thumbnailUrl: string | null;
  /** Short silent hover preview for videos. */
  previewUrl: string | null;
  /** 720p editing proxy (videos) used by the editor preview. */
  proxyUrl: string | null;
  waveformUrl: string | null;
  playback: PlaybackView | null;
}

export interface PlaybackView {
  kind: 'mux' | 'hls' | 'file';
  src: string;
  poster: string | null;
  preparing: boolean;
}

export interface AdScoreView {
  overall: number;
  [key: string]: unknown;
}

export interface JobView {
  id: string;
  type: string;
  label: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  progressMessage: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
}

export interface Me {
  user: { id: string; email: string | null; name: string | null; avatarUrl: string | null };
  workspace: { id: string; name: string; slug: string; role: string; monthlyBudgetUsd: number; budgetHardStop: boolean; aiLabelDefault: boolean; settings: Record<string, unknown> };
  features: {
    storage: 'supabase' | 's3';
    maxUploadBytes: number;
    mux: boolean;
    llm: boolean;
    embeddings: boolean;
    fal: boolean;
    replicate: boolean;
    agnes: boolean;
    elevenlabs: boolean;
    transcription: boolean;
    encryption: boolean;
    social: Record<string, boolean>;
    ads: Record<string, boolean>;
    adLibrary: boolean;
  };
  providers: Record<string, boolean>;
  budget: { spentUsd: number; budgetUsd: number; remainingUsd: number; hardStop: boolean };
}

export interface ProviderView {
  id: KeyProvider;
  /** workspace: this workspace's own key. server: the key set on the server. none: not connected. */
  source: 'workspace' | 'server' | 'none';
  keyHint: string | null;
  label: string | null;
  updatedAt: string | null;
  serverKey: boolean;
}

export interface KeyCheckView {
  status: 'valid' | 'invalid' | 'unverified';
  message: string;
  account: string | null;
}

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: 'active' | 'expired' | 'revoked';
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  mine: boolean;
}

export interface UsageView {
  totalUsd: number;
  budget: { spentUsd: number; budgetUsd: number; remainingUsd: number; hardStop: boolean };
  daily: { date: string; usd: number }[];
  byKind: { key: string; usd: number }[];
  byProvider: { key: string; usd: number }[];
  topModels: { model: string; usd: number; count: number }[];
  recent: { at: string; kind: string; provider: string; model: string | null; usd: number; units: number; unit: string }[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** A model as the studio's picker sees it. */
export interface ModelView {
  id: string;
  label: string;
  vendor: string;
  provider: string;
  capability: Capability;
  output: string;
  description: string;
  badges: string[];
  inputs: ModelDef['inputs'] | null;
  controls: ModelDef['controls'];
  defaults: ModelDef['defaults'];
  recommended: boolean;
  available: boolean;
  /** Price of the defaults, for the picker. */
  fromUsd: number;
  etaS: number;
}

export interface GenerationView {
  id: string;
  capability: string;
  model: string;
  modelLabel: string;
  provider: string;
  prompt: string | null;
  params: Record<string, unknown>;
  status: string;
  progress: number;
  error: string | null;
  costEstimateUsd: number | null;
  costActualUsd: number | null;
  etaSeconds: number | null;
  variantGroup: string | null;
  variantIndex: number | null;
  createdAt: string;
  completedAt: string | null;
  outputs: AssetView[];
  inputs: AssetView[];
}

export interface ScriptView {
  id: string;
  title: string;
  format: 'ad' | 'dialogue';
  status: 'generating' | 'draft' | 'final' | 'failed';
  error: string | null;
  language: string;
  platform: string | null;
  hook: string | null;
  lineCount: number;
  durationS: number;
  timelineId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A frame or voice take made for one script line. */
export interface LineMedia {
  asset: AssetView;
  /** Text the voice was made from, to flag takes that no longer match the line. */
  sourceText: string | null;
}

export interface LinePending {
  generationId: string;
  status: string;
  progress: number;
  error: string | null;
}

export interface ScriptDetailView extends ScriptView {
  brief: {
    product?: string;
    productId?: string;
    audience?: string;
    goal?: string;
    tone?: string;
    platform?: string;
    durationS?: number;
    angle?: string;
    hook?: string;
    cta?: string;
    musicMood?: string;
    notes?: string;
    characterIds?: string[];
  };
  lines: ScriptLine[];
  captions: string | null;
  hashtags: string[];
  /** By line id: the frame shown (picked, else newest) and all takes. */
  frames: Record<string, LineMedia[]>;
  voices: Record<string, LineMedia[]>;
  pending: { frames: Record<string, LinePending>; voices: Record<string, LinePending> };
  job: JobView | null;
}

export interface VoiceView {
  id: string;
  providerVoiceId: string;
  name: string;
  provider: string;
  isCloned: boolean;
  previewUrl: string | null;
  labels: Record<string, string>;
  consentId: string | null;
  createdAt: string;
}

export interface CharacterView {
  id: string;
  name: string;
  description: string | null;
  voiceId: string | null;
  voice: VoiceView | null;
  defaultEmotion: string;
  defaultPace: number;
  avatarAssetId: string | null;
  avatar: AssetView | null;
  color: string | null;
  createdAt: string;
}

export interface BrandKitView {
  id: string;
  name: string;
  isDefault: boolean;
  /** Hex colours in order, for quick pickers. */
  colors: string[];
  palette: { name: string; hex: string }[];
  fonts: { display?: string; body?: string };
  tone: string | null;
  logoAssetId: string | null;
  logo: AssetView | null;
  introAssetId: string | null;
  intro: AssetView | null;
  outroAssetId: string | null;
  outro: AssetView | null;
  watermarkAssetId: string | null;
  watermarkAsset: AssetView | null;
  watermark: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; opacity: number; scale: number };
  captionStyleId: string | null;
  updatedAt: string;
}

export interface LicenseView {
  id: string;
  kind: LicenseKind;
  commercialUse: boolean;
  source: string | null;
  provider: string | null;
  termsUrl: string | null;
  notes: string | null;
  expiresAt: string | null;
  proofAssetId: string | null;
  state: LicenseState;
  createdAt: string;
}

export interface MusicView {
  id: string;
  title: string;
  genre: string | null;
  mood: string | null;
  bpm: number | null;
  musicalKey: string | null;
  durationS: number | null;
  instrumental: boolean;
  lyrics: string | null;
  isAudioLogo: boolean;
  /** Beat times in seconds, once detected. */
  beats: number[];
  loudnessLufs: number | null;
  generated: boolean;
  asset: AssetView | null;
  license: LicenseView | null;
  licenseState: LicenseState;
  createdAt: string;
  updatedAt: string;
}

export interface SfxView {
  id: string;
  name: string;
  category: string;
  tags: string[];
  durationS: number | null;
  /** Set for the built-in library; the file is served by the app. */
  builtinId: string | null;
  url: string | null;
  asset: AssetView | null;
  licenseState: LicenseState;
  generated: boolean;
  createdAt: string | null;
}

export interface TimelineSummaryView {
  id: string;
  name: string;
  aspect: string;
  width: number;
  height: number;
  fps: number;
  durationS: number;
  version: number;
  projectId: string | null;
  thumbnailUrl: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface TimelineDetailView extends TimelineSummaryView {
  data: unknown;
  /** Every file the edit uses, keyed by id, with preview URLs. */
  assets: Record<string, AssetView>;
}

export interface TemplateView {
  id: string;
  name: string;
  category: 'ugc' | 'product' | 'promo' | 'story' | 'social-proof' | 'mine';
  description: string;
  durationS: number;
  /** Saved templates keep the shape they were made in; built-ins adapt to any shape. */
  aspect: string | null;
  builtin: boolean;
  updatedAt: string | null;
}

export interface SnapshotView {
  id: string;
  version: number;
  label: string | null;
  createdAt: string;
}

/** What an export of the saved edit would run into, checked before exporting. */
export interface ExportPreflightView {
  version: number;
  durationS: number;
  empty: boolean;
  emptySlots: string[];
  missingFiles: number;
  failedFiles: string[];
  processingFiles: string[];
  licenseIssues: { assetId: string; name: string; problem: 'non_commercial' | 'expired' | 'unlicensed_music' }[];
}

export interface RenderView {
  id: string;
  timelineId: string | null;
  preset: string;
  presetLabel: string;
  format: string;
  width: number;
  height: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  error: string | null;
  output: AssetView | null;
  /** Audio in the export that is not cleared for commercial use. */
  licenseIssues: { assetId: string; name: string; problem: string }[];
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------- Growth ---------------------------------- */

export interface ProductCopy {
  category: string;
  benefits: string[];
  features: string[];
  audience: string;
  painPoints: string[];
  usps: string[];
  offer: string | null;
  ctaSuggestions: string[];
  hooks: string[];
  tone: string;
}

export interface ProductView {
  id: string;
  sourceUrl: string;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  brandName: string | null;
  copy: ProductCopy;
  colors: string[];
  images: AssetView[];
  logo: AssetView | null;
  status: 'importing' | 'ready' | 'failed';
  error: string | null;
  job: JobView | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdBeatView {
  startS: number;
  endS: number;
  role: string;
  description: string;
  onScreenText: string | null;
  voiceover: string | null;
  shotType: string;
  camera: string;
  transition: string | null;
}

export interface AdStructureView {
  summary: string;
  format: string;
  hookType: string;
  durationS: number;
  cutsPerMinute: number;
  musicMood: string;
  hasVoiceover: boolean;
  hasCaptions: boolean;
  beats: AdBeatView[];
  whyItWorks: string[];
  adaptationNotes: string;
}

export interface BlueprintView {
  id: string;
  name: string;
  status: 'analyzing' | 'ready' | 'failed';
  error: string | null;
  structure: AdStructureView | null;
  reference: AssetView | null;
  inspirationAdId: string | null;
  inspiration: { id: string; brand: string; headline: string | null; thumbnailUrl: string | null } | null;
  productId: string | null;
  product: { id: string; title: string | null; status: ProductView['status'] } | null;
  scriptId: string | null;
  timelineId: string | null;
  job: JobView | null;
  createdAt: string;
  updatedAt: string;
}

export interface InspirationAnalysisView {
  hook: string;
  angle: string;
  format: string;
  structure: string[];
  emotionalTriggers: string[];
  cta: string;
  visualStyle: string;
  whyItWorks: string[];
  weaknesses: string[];
  ideasForUs: string[];
}

export interface InspirationAdView {
  id: string;
  /** The platform's id for the ad, e.g. its Ad Library id. */
  externalId: string | null;
  brand: string;
  platform: 'meta' | 'tiktok' | 'youtube' | 'instagram' | 'x' | 'linkedin' | 'pinterest' | 'other';
  sourceUrl: string | null;
  asset: AssetView | null;
  thumbnailUrl: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  tags: string[];
  notes: string | null;
  status: 'active' | 'inactive' | 'unknown';
  firstSeenAt: string;
  lastSeenAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
  /** Days between the ad starting and stopping (or now): long runners usually make money. */
  daysRunning: number | null;
  metrics: Record<string, unknown>;
  analysis: InspirationAnalysisView | null;
  isFavorite: boolean;
  competitorId: string | null;
  createdAt: string;
}

/** A live result from Meta's Ad Library search. */
export interface LibraryAdView {
  externalId: string;
  pageId: string | null;
  brand: string;
  body: string | null;
  headline: string | null;
  description: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  active: boolean;
  daysRunning: number | null;
  platforms: string[];
  languages: string[];
  euReach: number | null;
  libraryUrl: string;
  /** Already in the swipe file. */
  savedId: string | null;
}

export interface CompetitorView {
  id: string;
  name: string;
  website: string | null;
  metaPageId: string | null;
  tiktokHandle: string | null;
  countries: string[];
  notes: string | null;
  isActive: boolean;
  adCount: number;
  activeAdCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface VariantView {
  label: string;
  hook: string | null;
  cta: string | null;
  voiceStyle: string | null;
  voiceId: string | null;
  captionStyleId: string | null;
  musicMood: string | null;
  firstShot: string | null;
  hypothesis: string;
  status: 'planned' | 'building' | 'rendering' | 'done' | 'failed';
  timelineId: string | null;
  renderId: string | null;
  assetId: string | null;
  notes: string[];
  error: string | null;
  asset: AssetView | null;
}

export interface VariantBatchView {
  id: string;
  name: string;
  sourceTimelineId: string | null;
  sourceTimelineName: string | null;
  dimensions: string[];
  count: number;
  status: 'planning' | 'ready' | 'rendering' | 'done' | 'failed';
  variants: VariantView[];
  costEstimateUsd: number | null;
  abGroup: string;
  error: string | null;
  job: JobView | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------- Distribution ------------------------------- */

export type SocialPlatformId = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'x' | 'pinterest';

export interface ConnectorView {
  id: 'youtube' | 'tiktok' | 'meta' | 'linkedin' | 'x' | 'pinterest';
  label: string;
  platforms: SocialPlatformId[];
  configured: boolean;
}

export interface SocialAccountView {
  id: string;
  platform: SocialPlatformId;
  provider: 'native' | 'ayrshare';
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: 'active' | 'expired' | 'revoked' | 'error';
  statusDetail: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
}

export interface SocialAccountsView {
  accounts: SocialAccountView[];
  connectors: ConnectorView[];
  /** An Ayrshare key is set, so accounts linked there can be imported. */
  ayrshare: boolean;
}

export interface PostMetricsView {
  views: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  /** Fraction, e.g. 0.018 for 1.8%. */
  ctr: number | null;
  watchTimeS: number | null;
}

export interface PostTargetView {
  id: string;
  socialAccountId: string;
  platform: SocialPlatformId;
  account: { handle: string | null; displayName: string | null; avatarUrl: string | null; provider: 'native' | 'ayrshare' } | null;
  captionOverride: string | null;
  options: Record<string, unknown>;
  status: 'pending' | 'publishing' | 'processing' | 'published' | 'failed' | 'canceled';
  externalUrl: string | null;
  error: string | null;
  /** What happened to the post's first comment here; null until the post is out or when there is none. */
  firstComment: { status: 'posted' | 'failed' | 'unsupported'; error: string | null } | null;
  attempts: number;
  publishedAt: string | null;
  metrics: PostMetricsView;
  metricsUpdatedAt: string | null;
}

export interface PostView {
  id: string;
  title: string | null;
  caption: string;
  /** Posted as a comment under each published copy, where the network allows it. */
  firstComment: string | null;
  /** Approval trail when the workspace reviews posts: who sent it, when it was reviewed, and any note. */
  review: { submittedBy: string | null; reviewedAt: string | null; note: string | null } | null;
  hashtags: string[];
  status: 'draft' | 'pending_approval' | 'scheduled' | 'publishing' | 'published' | 'partially_published' | 'failed' | 'canceled';
  scheduledAt: string | null;
  publishedAt: string | null;
  abGroup: string | null;
  abVariant: 'A' | 'B' | 'C' | 'D' | null;
  aiLabel: boolean;
  asset: AssetView | null;
  platforms: SocialPlatformId[];
  targets: PostTargetView[];
  /** Summed over published targets. */
  totals: PostMetricsView;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformCheckView {
  platform: SocialPlatformId;
  label: string;
  issues: { level: 'error' | 'warning'; message: string }[];
}

export interface AdMetricsView {
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  /** Percent, e.g. 1.8 for 1.8%. */
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  conversions: number | null;
  cpa: number | null;
  roas: number | null;
  videoViews: number | null;
  thruplays: number | null;
}

export interface AdAccountView {
  id: string;
  platform: 'meta' | 'tiktok';
  externalId: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
  status: 'active' | 'expired' | 'revoked' | 'error';
  statusDetail: string | null;
  /** Meta: Facebook Pages the ads can run as, with their linked Instagram accounts. */
  identities: { pageId: string; pageName: string; instagramUserId: string | null; instagramUsername: string | null }[];
  pageId: string | null;
  instagramUserId: string | null;
  pixelId: string | null;
  /** TikTok: the display identity created on the first launch. */
  identityId: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
}

export interface AdView {
  id: string;
  campaignId: string;
  asset: AssetView | null;
  variantLabel: string | null;
  headline: string | null;
  primaryText: string | null;
  cta: string | null;
  landingUrl: string | null;
  status: 'draft' | 'uploading' | 'paused' | 'active' | 'rejected' | 'failed' | 'archived';
  reviewStatus: string | null;
  isWinner: boolean;
  /** Created on the platform, so it can be activated or paused. */
  launched: boolean;
  metrics: AdMetricsView;
  metricsUpdatedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface CampaignView {
  id: string;
  adAccountId: string;
  account: { platform: 'meta' | 'tiktok'; name: string | null; currency: string | null; status: AdAccountView['status'] } | null;
  name: string;
  objective: string;
  dailyBudget: number;
  currency: string | null;
  countries: string[];
  ageMin: number;
  ageMax: number;
  landingUrl: string | null;
  cta: string;
  /** What the platform could not set up exactly as asked. */
  notes: string[];
  status: 'draft' | 'launching' | 'paused' | 'active' | 'completed' | 'failed';
  error: string | null;
  variantBatchId: string | null;
  launchedAt: string | null;
  ads: AdView[];
  totals: AdMetricsView;
  createdAt: string;
  updatedAt: string;
}

export interface AdsSetupView {
  platforms: { id: 'meta' | 'tiktok'; label: string; configured: boolean }[];
  accounts: AdAccountView[];
  adLibrary: boolean;
}

/* --------------------------------- Analytics -------------------------------- */

export interface PostDayView {
  day: string;
  views: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
}

export interface AdDayView {
  day: string;
  /** Null when ad accounts use different currencies. */
  spend: number | null;
  impressions: number;
  clicks: number;
  conversions: number;
  videoViews: number;
}

export interface AbVariantView {
  /** Post or ad id. */
  id: string;
  label: string;
  title: string | null;
  thumbnailUrl: string | null;
  status: string;
  platforms: string[];
  /** Views (posts) or impressions (ads). */
  trials: number;
  /** Engagements (posts) or clicks (ads). */
  successes: number;
  /** successes / trials as a fraction, null without trials. */
  rate: number | null;
}

export interface AbTestView {
  /** The posts' A/B group, or the campaign id for ads. */
  id: string;
  kind: 'posts' | 'ads';
  name: string;
  metric: 'engagement' | 'ctr';
  variants: AbVariantView[];
  /** Variant with the best rate once each variant has enough data. */
  leaderId: string | null;
  /** The leader beats the runner-up at 95% confidence (two-proportion z-test). */
  significant: boolean;
  /** Variants still below the minimum sample. */
  needsData: boolean;
  startedAt: string | null;
}

export interface AnalyticsView {
  days: number;
  since: string;
  posts: {
    counts: { published: number; scheduled: number; failed: number; drafts: number };
    /** Growth during the window, from the daily series. */
    period: Omit<PostDayView, 'day'>;
    daily: PostDayView[];
    byPlatform: { platform: SocialPlatformId; posts: number; totals: PostMetricsView }[];
    /** Posts published in the window with the most views (lifetime). */
    top: PostView[];
  };
  /** Null when the caller (an API key) lacks the ads scope. */
  ads: {
    currency: string | null;
    mixedCurrency: boolean;
    /** Growth during the window, rates recomputed from the sums; money fields are null when currencies are mixed. */
    period: AdMetricsView;
    daily: AdDayView[];
    /** Lifetime totals per currency. */
    byCurrency: { currency: string | null; totals: AdMetricsView }[];
    campaigns: { id: string; name: string; platform: 'meta' | 'tiktok' | null; status: CampaignView['status']; currency: string | null; ads: number; launchedAt: string | null; totals: AdMetricsView }[];
    /** Best launched ads by conversions, then click-through rate. */
    top: (AdView & { campaignName: string; currency: string | null })[];
  } | null;
  tests: AbTestView[];
}

/* ----------------------------------- Agent ---------------------------------- */

export type AgentStepId = 'research' | 'script' | 'generate' | 'launch' | 'optimize';

export interface AgentStepView {
  id: AgentStepId;
  label: string;
  status: 'pending' | 'running' | 'waiting' | 'done' | 'failed' | 'skipped';
  startedAt: string | null;
  finishedAt: string | null;
  costUsd: number;
  estimateUsd: number | null;
  output: Record<string, unknown>;
  edits: Record<string, unknown>;
  note: string | null;
  error: string | null;
}

export interface AgentConfigView {
  platforms: ('meta' | 'tiktok')[];
  adAccountId: string | null;
  dailyAdBudget: number | null;
  aspect: '9:16' | '1:1' | '4:5' | '16:9';
  durationS: number;
  videoModelId: string | null;
  voiceId: string | null;
  style: 'ugc' | 'polished';
  countries: string[];
  landingUrl: string | null;
}

export interface AgentRunView {
  id: string;
  goal: string;
  productId: string | null;
  productUrl: string | null;
  product: { id: string; title: string | null; status: ProductView['status']; image: AssetView | null } | null;
  budgetUsd: number | null;
  spentUsd: number;
  /**
   * Steps estimated at or under this amount run without asking (opt-in). 0 asks before every
   * step; launching ads always asks.
   */
  autoApproveUnderUsd: number;
  status: 'awaiting_approval' | 'running' | 'completed' | 'failed' | 'canceled';
  currentStep: AgentStepId | 'done';
  steps: AgentStepView[];
  config: AgentConfigView;
  /** The rendered ad from the generate step. */
  video: AssetView | null;
  /** Campaigns the launch step created, paused until someone activates them. */
  campaigns: { id: string; name: string; status: CampaignView['status']; platform: 'meta' | 'tiktok' | null; error: string | null }[];
  job: JobView | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Price of the next run of a step with the edits about to be approved. */
export interface AgentEstimateView {
  step: AgentStepId;
  usd: number;
  approx: boolean;
  detail: string | null;
  /** What is left of the run budget before this step. */
  runLeftUsd: number | null;
  withinRunBudget: boolean;
  monthly: { spentUsd: number; budgetUsd: number; remainingUsd: number; hardStop: boolean };
  withinMonthlyBudget: boolean;
}

/** Ballpark for a whole run before it starts; shots depend on the script, so it is a range. */
export interface AgentPlanEstimateView {
  research: number;
  script: number;
  generate: { low: number; high: number; shotsLow: number; shotsHigh: number; voice: number; modelId: string; modelLabel: string } | null;
  optimize: number;
  total: { low: number; high: number };
}

/* ------------------------------- Link in bio ------------------------------- */

export interface BioLinkView {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  clicks: number;
}

export interface BioPageView {
  id: string;
  slug: string;
  title: string;
  bio: string;
  avatarAssetId: string | null;
  avatarUrl: string | null;
  theme: BioTheme;
  published: boolean;
  views: number;
  links: BioLinkView[];
  createdAt: string;
}

export interface BioStats {
  days: { day: string; views: number; clicks: number }[];
  linkClicks: Record<string, number>;
}

/* ---------------------------------- Team ---------------------------------- */

export interface TeamMemberView {
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  joinedAt: string;
  isYou: boolean;
}

export interface InviteView {
  id: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  expiresAt: string;
  createdAt: string;
}

/** A signed link to one file, named for saving into a ZIP. */
export interface DownloadLink {
  id: string;
  name: string;
  bytes: number;
  url: string;
}

export interface SizeSlot {
  id: string;
  mode: SizeMode | null;
  original: boolean;
}
