'use client';

import { useQuery } from '@tanstack/react-query';
import { formatUsd, type LlmTask } from '@adforge/core';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const fetchPrice = (task: LlmTask) => api.get<{ usd: number }>(`/llm/estimate?task=${task}`).then((r) => r.usd);

export function useLlmPrice(task: LlmTask | null) {
  return useQuery({ queryKey: ['llm-price', task], queryFn: () => fetchPrice(task!), enabled: !!task, staleTime: 10 * 60_000, retry: false });
}

/** "≈ $0.04" for a writing task (plus an optional follow-up task), shown next to the button that runs it. */
export function LlmPrice({ task, also, className }: { task: LlmTask; also?: LlmTask | null; className?: string }) {
  const price = useLlmPrice(task);
  const extra = useLlmPrice(also ?? null);
  if (price.data == null || (also && extra.data == null)) return null;
  return <span className={cn('text-xs tabular-nums text-muted-foreground', className)}>≈ {formatUsd(price.data + (also ? (extra.data ?? 0) : 0))}</span>;
}
