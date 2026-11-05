'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { GenParamsInput } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ApiError, errorMessage } from '@/lib/api-client';
import { CostSummary, useEstimate } from './cost-estimate';

/**
 * Shows the price of one generation before it runs. The trigger opens a small card with
 * the live estimate; confirming passes the approved price to `onConfirm`.
 */
export function CostConfirm({
  modelId,
  params,
  title,
  description,
  confirmLabel = 'Generate',
  onConfirm,
  children,
  align = 'end',
}: {
  modelId: string | undefined;
  params: GenParamsInput;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: (approvedUsd: number) => Promise<unknown>;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const est = useEstimate(open ? modelId : undefined, params, 1);
  const run = async () => {
    if (!est.data) return;
    setBusy(true);
    try {
      await onConfirm(est.data.estimate.usd);
      setOpen(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'price_changed') {
        toast.warning(e.message);
        void est.refetch();
      } else toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-72 space-y-3 p-4">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
        </div>
        <CostSummary data={est.data} loading={est.isFetching} error={est.error ? errorMessage(est.error) : null} />
        <Button variant="brand" size="sm" className="w-full" loading={busy} disabled={!est.data || !est.data.withinBudget || est.isFetching} onClick={() => void run()}>
          {confirmLabel}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
