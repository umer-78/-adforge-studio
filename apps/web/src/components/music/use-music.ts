'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { LicenseState } from '@adforge/core';
import { api } from '@/lib/api-client';
import type { MusicView, Page, SfxView } from '@/lib/types';
import { qs } from '@/lib/utils';

export type MusicFilter = 'all' | 'generated' | 'added' | 'logos';

/** Music library pages. Keyed under 'assets' so file changes (processing, beats) refresh it. */
export function useMusic(filter: MusicFilter, q: string, opts: { cleared?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: ['assets', 'music', filter, q, !!opts.cleared],
    queryFn: ({ pageParam }) => api.get<Page<MusicView>>(`/music${qs({ filter, q: q || undefined, cleared: opts.cleared ? '1' : undefined, limit: 30, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useSfx(q: string, category: string | null) {
  return useQuery({
    queryKey: ['assets', 'sfx', q, category],
    queryFn: () => api.get<{ mine: SfxView[]; builtin: SfxView[] }>(`/sfx${qs({ q: q || undefined, category: category ?? undefined })}`),
    placeholderData: (prev) => prev,
  });
}

export const LICENSE_STATE: Record<LicenseState, { label: string; tone: string; hint: string }> = {
  cleared: { label: 'Cleared for ads', tone: 'bg-success/10 text-success', hint: 'Commercial use is covered.' },
  non_commercial: { label: 'Not for ads', tone: 'bg-destructive/10 text-destructive', hint: 'The license does not cover commercial use. Exports and publishing will be blocked.' },
  expired: { label: 'License expired', tone: 'bg-destructive/10 text-destructive', hint: 'The license has expired. Renew it or replace the track.' },
  missing: { label: 'No license', tone: 'bg-warning/10 text-warning', hint: 'Record where this track comes from before using it in an ad.' },
};
