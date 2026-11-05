'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { BlueprintView, CompetitorView, InspirationAdView, JobView, Page, ProductView, TimelineSummaryView, VariantBatchView } from '@/lib/types';
import { qs } from '@/lib/utils';
import { isBusy } from './shared';

const poll = (busy: boolean, ms = 2500) => (busy ? ms : false);

export function useProducts(filters: { q?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => api.get<Page<ProductView>>(`/products${qs({ q: filters.q, status: filters.status, limit: 60 })}`),
    refetchInterval: (q) => poll(!!q.state.data?.items.some((p) => p.status === 'importing')),
  });
}

export function useProduct(id: string | null | undefined) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductView>(`/products/${id}`),
    enabled: !!id,
    refetchInterval: (q) => poll(q.state.data?.status === 'importing'),
  });
}

export function useClones() {
  return useQuery({
    queryKey: ['clones'],
    queryFn: () => api.get<Page<BlueprintView>>('/clones?limit=60'),
    refetchInterval: (q) => poll(!!q.state.data?.items.some((b) => b.status === 'analyzing' || isBusy(b.job))),
  });
}

export function useClone(id: string) {
  return useQuery({
    queryKey: ['clone', id],
    queryFn: () => api.get<BlueprintView>(`/clones/${id}`),
    refetchInterval: (q) => poll(!!q.state.data && (q.state.data.status === 'analyzing' || isBusy(q.state.data.job))),
  });
}

export function useVariantBatches() {
  return useQuery({
    queryKey: ['variants'],
    queryFn: () => api.get<Page<VariantBatchView>>('/variants?limit=60'),
    refetchInterval: (q) => poll(!!q.state.data?.items.some((b) => b.status === 'planning' || b.status === 'rendering' || isBusy(b.job)), 3000),
  });
}

export function useVariantBatch(id: string) {
  return useQuery({
    queryKey: ['variant', id],
    queryFn: () => api.get<VariantBatchView>(`/variants/${id}`),
    refetchInterval: (q) => poll(!!q.state.data && (q.state.data.status === 'planning' || q.state.data.status === 'rendering' || isBusy(q.state.data.job)), 3000),
  });
}

export interface InspirationFilters {
  q?: string;
  platform?: string;
  status?: string;
  competitorId?: string;
  favorites?: boolean;
  tag?: string;
  sort?: 'recent' | 'longest';
}

export function useInspiration(f: InspirationFilters, offset = 0) {
  return useQuery({
    queryKey: ['inspiration', f, offset],
    queryFn: () =>
      api.get<{ items: InspirationAdView[]; total: number; nextOffset: number | null }>(
        `/inspiration${qs({ q: f.q, platform: f.platform, status: f.status, competitorId: f.competitorId, favorites: f.favorites ? '1' : undefined, tag: f.tag, sort: f.sort, limit: 48, offset })}`,
      ),
    placeholderData: (prev) => prev,
  });
}

export function useCompetitors() {
  return useQuery({
    queryKey: ['competitors'],
    queryFn: () => api.get<{ items: CompetitorView[] }>('/competitors').then((r) => r.items),
    staleTime: 15_000,
  });
}

export function useReadyProducts() {
  return useQuery({
    queryKey: ['products', 'ready'],
    queryFn: () => api.get<Page<ProductView>>('/products?status=ready&limit=100').then((r) => r.items),
    staleTime: 60_000,
  });
}

export function useTimelines() {
  return useQuery({
    queryKey: ['timelines', 'all'],
    queryFn: () => api.get<Page<TimelineSummaryView>>('/timelines?limit=100').then((r) => r.items),
    staleTime: 30_000,
  });
}

/** Polls a background job until it finishes. */
export function useJob(id: string | null | undefined) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => api.get<JobView>(`/jobs/${id}`),
    enabled: !!id,
    refetchInterval: (q) => poll(!q.state.data || isBusy(q.state.data), 2000),
  });
}

export function useInspirationAd(id: string | null | undefined) {
  return useQuery({ queryKey: ['inspiration-ad', id], queryFn: () => api.get<InspirationAdView>(`/inspiration/${id}`), enabled: !!id });
}
