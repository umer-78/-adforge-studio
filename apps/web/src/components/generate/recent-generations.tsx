'use client';

import { useQuery } from '@tanstack/react-query';
import type { Capability } from '@adforge/core';
import { Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api-client';
import type { GenerationView, Page } from '@/lib/types';
import { qs } from '@/lib/utils';
import { GenerationCard } from './generation-card';

/** The latest runs of some capabilities, refreshed while any are in progress. */
export function RecentGenerations({ capabilities, limit = 6, title = 'Recent results' }: { capabilities: Capability[]; limit?: number; title?: string }) {
  const q = useQuery({
    queryKey: ['generations', 'recent', capabilities.join(','), limit],
    queryFn: () => api.get<Page<GenerationView>>(`/generations${qs({ capability: capabilities, limit })}`),
    refetchInterval: (query) => (query.state.data?.items.some((g) => g.status === 'queued' || g.status === 'running') ? 5000 : false),
  });
  if (q.isLoading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
        ))}
      </div>
    );
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((g) => (
          <GenerationCard key={g.id} gen={g} />
        ))}
      </div>
    </div>
  );
}
