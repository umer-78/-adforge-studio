'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { AdsSetupView, AnalyticsView, CampaignView, Page, PostView, SocialAccountsView, SocialPlatformId } from '@/lib/types';
import { qs } from '@/lib/utils';

const LIVE_POST = new Set(['publishing']);
const LIVE_CAMPAIGN = new Set(['launching']);
const LIVE_AD = new Set(['uploading']);

export function useSocialAccounts() {
  return useQuery({ queryKey: ['social-accounts'], queryFn: () => api.get<SocialAccountsView>('/social-accounts'), staleTime: 30_000 });
}

export interface AccountOptions {
  platform: SocialPlatformId;
  provider: 'native' | 'ayrshare';
  tiktok?: { username: string; nickname: string; avatarUrl: string | null; privacyLevels: string[]; commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxDurationS: number };
  boards?: { id: string; name: string; privacy?: string }[];
}

/** What the composer must offer for an account (TikTok creator settings, Pinterest boards). */
export function useAccountOptions(id: string | null, platform: SocialPlatformId | null) {
  return useQuery({
    queryKey: ['account-options', id],
    queryFn: () => api.get<AccountOptions>(`/social-accounts/${id}/options`),
    enabled: !!id && (platform === 'tiktok' || platform === 'pinterest'),
    staleTime: 60_000,
    retry: false,
  });
}

export function usePosts(filters: { status?: string; from?: string; to?: string; abGroup?: string; assetId?: string; limit?: number }) {
  return useQuery({
    queryKey: ['posts', filters],
    queryFn: () => api.get<Page<PostView>>(`/posts${qs({ ...filters, limit: filters.limit ?? 100 })}`),
    refetchInterval: (q) => (q.state.data?.items.some((p) => LIVE_POST.has(p.status) || p.targets.some((t) => t.status === 'publishing' || t.status === 'processing')) ? 4000 : false),
  });
}

export function useAdsSetup() {
  return useQuery({ queryKey: ['ads-setup'], queryFn: () => api.get<AdsSetupView>('/ad-accounts'), staleTime: 30_000 });
}

export function useCampaigns(filters: { status?: string; variantBatchId?: string } = {}) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: () => api.get<Page<CampaignView>>(`/campaigns${qs({ ...filters, limit: 100 })}`),
    refetchInterval: (q) => (q.state.data?.items.some((c) => LIVE_CAMPAIGN.has(c.status) || c.ads.some((a) => LIVE_AD.has(a.status))) ? 4000 : false),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.get<CampaignView>(`/campaigns/${id}`),
    refetchInterval: (q) => (q.state.data && (LIVE_CAMPAIGN.has(q.state.data.status) || q.state.data.ads.some((a) => LIVE_AD.has(a.status))) ? 4000 : false),
  });
}

export function useAnalytics(days: number) {
  return useQuery({ queryKey: ['analytics', days], queryFn: () => api.get<AnalyticsView>(`/analytics?days=${days}`), staleTime: 60_000, placeholderData: (prev) => prev });
}
