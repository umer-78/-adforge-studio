'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleAlert, Clock } from 'lucide-react';
import { formatUsd, type CostEstimate, type GenParamsInput } from '@adforge/core';
import { Spinner } from '@/components/ui/spinner';
import { Tip } from '@/components/ui/tooltip';
import { api } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import { cn } from '@/lib/utils';

export interface EstimateResponse {
  estimate: CostEstimate;
  budget: { spentUsd: number; budgetUsd: number; remainingUsd: number; hardStop: boolean };
  withinBudget: boolean;
}

/** Live price for the current settings, refreshed as they change. */
export function useEstimate(modelId: string | undefined, params: GenParamsInput, variants: number) {
  const key = useDebounced(JSON.stringify({ modelId, params, variants }), 300);
  return useQuery({
    queryKey: ['estimate', key],
    queryFn: () => api.post<EstimateResponse>('/generate/estimate', JSON.parse(key) as Record<string, unknown>),
    enabled: !!modelId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  const m = Math.round(seconds / 60);
  return `~${m} min`;
}

export function CostSummary({ data, loading, error, className }: { data: EstimateResponse | undefined; loading?: boolean; error?: string | null; className?: string }) {
  if (error) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-destructive', className)}>
        <CircleAlert className="size-3.5" /> {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
        <Spinner className="size-3.5" /> Pricing…
      </div>
    );
  }
  const { estimate, budget, withinBudget } = data;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
      <Tip content={<span className="block max-w-64">{estimate.detail}{estimate.approx ? '. Approximate: the provider bills by usage.' : ''}</span>}>
        <span className={cn('font-semibold tabular-nums text-foreground transition-opacity', loading && 'opacity-60')}>
          {estimate.approx ? '≈ ' : ''}
          {formatUsd(estimate.usd)}
        </span>
      </Tip>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Clock className="size-3" /> {formatEta(estimate.etaS)}
      </span>
      {budget.budgetUsd > 0 && (
        <span className={cn('text-muted-foreground', !withinBudget && 'font-medium text-destructive')}>
          {withinBudget ? `${formatUsd(budget.remainingUsd)} left this month` : 'Over your monthly budget'}
        </span>
      )}
    </div>
  );
}
