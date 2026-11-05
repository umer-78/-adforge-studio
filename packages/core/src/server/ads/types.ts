import type { AdPlatform } from '../../constants';
import type { TokenSet } from '../social/types';

export type AdObjective = 'traffic' | 'sales' | 'engagement' | 'awareness' | 'leads' | 'video_views';

export interface AdAccountInfo {
  externalId: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
  status: 'active' | 'error';
  statusDetail: string | null;
  meta: Record<string, unknown>;
}

export interface AdAccountRef {
  externalId: string;
  currency: string | null;
  name: string | null;
  meta: Record<string, unknown>;
}

export interface LaunchAd {
  /** Our ad row id; used to report progress per ad. */
  key: string;
  name: string;
  headline: string;
  primaryText: string;
  media: { kind: 'video' | 'image'; url: string; coverUrl?: string | null; width: number | null; height: number | null; durationS: number | null };
  existing?: { videoId?: string | null; creativeId?: string | null; adId?: string | null };
}

export interface LaunchInput {
  accessToken: string;
  account: AdAccountRef;
  campaign: {
    name: string;
    objective: AdObjective;
    /** In the account currency's major unit, e.g. 20 = $20.00/day. */
    dailyBudget: number;
    countries: string[];
    ageMin: number;
    ageMax: number;
    landingUrl: string;
    cta: string;
    existing?: { campaignId?: string | null; adsetId?: string | null };
  };
  ads: LaunchAd[];
  /** Called as soon as an external object exists so a retry can resume instead of duplicating. */
  onCreated?: (kind: 'campaign' | 'adset' | 'video' | 'creative' | 'ad', key: string | null, externalId: string) => Promise<void>;
}

export interface LaunchResult {
  campaignId: string;
  adsetId: string;
  ads: { key: string; adId: string | null; creativeId: string | null; videoId: string | null; error: string | null }[];
  notes: string[];
}

export interface AdInsights {
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
  raw: Record<string, unknown>;
}

export type ReviewState = { status: 'active' | 'paused' | 'pending_review' | 'rejected' | 'archived' | 'unknown'; detail: string | null };

export interface AdsPlatform {
  id: AdPlatform;
  label: string;
  configured(): boolean;
  authorizeUrl(p: { state: string; redirectUri: string }): string;
  exchange(code: string, redirectUri: string): Promise<TokenSet & { advertiserIds?: string[] }>;
  accounts(token: TokenSet & { advertiserIds?: string[] }): Promise<AdAccountInfo[]>;
  /** Creates campaign, ad set and ads. Everything is created paused. */
  launch(input: LaunchInput): Promise<LaunchResult>;
  setStatus(token: string, account: AdAccountRef, ids: { campaignId: string; adsetId: string | null; adId: string }, status: 'active' | 'paused'): Promise<void>;
  insights(token: string, account: AdAccountRef, adIds: string[]): Promise<Record<string, AdInsights>>;
  review(token: string, account: AdAccountRef, adIds: string[]): Promise<Record<string, ReviewState>>;
}

export const emptyInsights = (raw: Record<string, unknown> = {}): AdInsights => ({
  impressions: null,
  clicks: null,
  spend: null,
  ctr: null,
  cpc: null,
  cpm: null,
  conversions: null,
  cpa: null,
  roas: null,
  videoViews: null,
  thruplays: null,
  raw,
});
