'use client';

import Link from 'next/link';
import { formatUsd } from '@adforge/core';
import { Tip } from '@/components/ui/tooltip';
import { useMe } from '@/lib/hooks/use-me';
import { cn } from '@/lib/utils';

export function BudgetMeter({ collapsed }: { collapsed?: boolean }) {
  const { data } = useMe();
  if (!data) return null;
  const { spentUsd, budgetUsd } = data.budget;
  const pct = budgetUsd > 0 ? Math.min(1, spentUsd / budgetUsd) : 0;
  const tone = pct > 0.9 ? 'bg-destructive' : pct > 0.7 ? 'bg-warning' : 'bg-brand';
  const body = (
    <Link href="/settings/usage" className={cn('block rounded-xl border bg-surface-2/60 transition hover:bg-surface-2', collapsed ? 'p-2' : 'p-3')}>
      {!collapsed && (
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">AI spend this month</span>
          <span className="font-medium tabular-nums">{formatUsd(spentUsd)}</span>
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full transition-[width] duration-700', tone)} style={{ width: `${Math.max(2, pct * 100)}%` }} />
      </div>
      {!collapsed && <div className="mt-1.5 text-[11px] text-muted-foreground">of {formatUsd(budgetUsd)} budget{data.workspace.budgetHardStop ? ' · hard stop' : ''}</div>}
    </Link>
  );
  return collapsed ? <Tip content={`${formatUsd(spentUsd)} of ${formatUsd(budgetUsd)} this month`} side="right">{body}</Tip> : body;
}
