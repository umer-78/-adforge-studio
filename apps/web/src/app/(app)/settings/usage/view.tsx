'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatUsd } from '@adforge/core';
import { ShareBars } from '@/components/charts/bar-chart';
import { TimeSeries } from '@/components/charts/time-series';
import { SettingsSection } from '@/components/settings/shared';
import { Notice, Progress, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { api, errorMessage } from '@/lib/api-client';
import type { UsageView } from '@/lib/types';
import { modelName, providerName, usageKindLabel } from '@/lib/usage-labels';
import { formatNumber, timeAgo } from '@/lib/utils';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

const money = (v: number) => formatUsd(v, { precise: v > 0 && v < 1 });

export function UsageSettings() {
  const [days, setDays] = useState<Period>('30');
  const usage = useQuery({ queryKey: ['usage', Number(days)], queryFn: () => api.get<UsageView>(`/usage?days=${days}`), placeholderData: keepPreviousData });
  const u = usage.data;
  return (
    <div className="space-y-6">
      {u ? <BudgetCard budget={u.budget} /> : <Skeleton className="h-28 rounded-xl" />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Spend</h2>
        <Segmented value={days} onChange={setDays} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} size="sm" />
      </div>
      {usage.isError && <Notice tone="error">Could not load usage. {errorMessage(usage.error)}</Notice>}
      {u ? (
        <>
          <TimeSeries title={`Spend per day, last ${days} days`} kind="bar" data={u.daily.map((d) => ({ day: d.date, value: d.usd }))} format={money} summary={money(u.totalUsd)} empty="Nothing was spent in this period." />
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsSection title="By kind of work">
              {u.byKind.length ? <ShareBars data={u.byKind.map((k) => ({ key: k.key, label: usageKindLabel(k.key), value: k.usd }))} format={money} /> : <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            </SettingsSection>
            <SettingsSection title="By provider">
              {u.byProvider.length ? <ShareBars data={u.byProvider.map((p) => ({ key: p.key, label: providerName(p.key), value: p.usd }))} format={money} /> : <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            </SettingsSection>
          </div>
          <SettingsSection title="Top models" description="The models that cost the most in this period.">
            {u.topModels.length ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 text-right font-medium">Uses</th>
                      <th className="px-3 py-2 text-right font-medium">Spend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {u.topModels.map((m) => (
                      <tr key={m.model}>
                        <td className="px-3 py-2">{modelName(m.model)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(m.count)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(m.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No model use in this period.</p>
            )}
          </SettingsSection>
          <SettingsSection title="Recent charges" description="The latest 50 entries in the usage ledger.">
            {u.recent.length ? (
              <div className="max-h-[420px] overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">What</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Amount</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {u.recent.map((r, i) => (
                      <tr key={`${r.at}-${i}`}>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground" title={new Date(r.at).toLocaleString()}>
                          {timeAgo(r.at)}
                        </td>
                        <td className="px-3 py-2">
                          <div>{usageKindLabel(r.kind)}</div>
                          <div className="text-xs text-muted-foreground">
                            {providerName(r.provider)}
                            {r.model ? ` · ${modelName(r.model)}` : ''}
                          </div>
                        </td>
                        <td className="hidden px-3 py-2 text-muted-foreground tabular-nums sm:table-cell">
                          {formatNumber(r.units, { maximumFractionDigits: 2 })} {r.unit}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(r.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No charges yet.</p>
            )}
          </SettingsSection>
        </>
      ) : (
        !usage.isError && <Skeleton className="h-72 rounded-2xl" />
      )}
    </div>
  );
}

function BudgetCard({ budget }: { budget: UsageView['budget'] }) {
  const pct = budget.budgetUsd > 0 ? (budget.spentUsd / budget.budgetUsd) * 100 : 0;
  const over = budget.budgetUsd > 0 && budget.spentUsd >= budget.budgetUsd;
  const Icon = budget.hardStop ? ShieldCheck : ShieldAlert;
  return (
    <SettingsSection
      title="This month"
      description={
        <>
          {budget.hardStop ? 'Paid work stops at the budget.' : 'You are warned at the budget, and paid work keeps running.'}{' '}
          <Link href="/settings" className="text-primary hover:underline">
            Change the budget
          </Link>
        </>
      }
      actions={<Icon className={budget.hardStop ? 'size-5 text-success' : 'size-5 text-warning'} />}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatUsd(budget.spentUsd)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          of {formatUsd(budget.budgetUsd)} · {formatUsd(budget.remainingUsd)} left
        </span>
      </div>
      <Progress value={Math.min(100, pct)} className={over ? '[&>div]:bg-destructive' : undefined} />
    </SettingsSection>
  );
}
