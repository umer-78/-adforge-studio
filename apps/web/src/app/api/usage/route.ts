import { budgetStatus } from '@adforge/core/server';
import * as z from 'zod';
import { check, route } from '@/lib/server/api';

/** Spend over time and by kind/provider, from the usage ledger. */
export const GET = route({ query: z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }) }, async ({ sb, caller, query }) => {
  const since = new Date(Date.now() - query.days * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const [rows, budget] = await Promise.all([
    sb.from('usage_ledger').select('created_at, kind, provider, model, cost_usd, units, unit').eq('workspace_id', caller.workspaceId).gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(10_000),
    budgetStatus(sb, caller.workspaceId),
  ]);
  const items = check(rows, 'Could not load usage');
  const daily = new Map<string, number>();
  for (let d = new Date(since); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) daily.set(d.toISOString().slice(0, 10), 0);
  const byKind = new Map<string, number>();
  const byProvider = new Map<string, number>();
  const byModel = new Map<string, { usd: number; count: number }>();
  let total = 0;
  for (const r of items) {
    const usd = Number(r.cost_usd);
    total += usd;
    const day = r.created_at.slice(0, 10);
    daily.set(day, (daily.get(day) ?? 0) + usd);
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + usd);
    byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + usd);
    if (r.model) {
      const m = byModel.get(r.model) ?? { usd: 0, count: 0 };
      byModel.set(r.model, { usd: m.usd + usd, count: m.count + 1 });
    }
  }
  const sorted = (m: Map<string, number>) => [...m].map(([key, usd]) => ({ key, usd: Math.round(usd * 10_000) / 10_000 })).sort((a, b) => b.usd - a.usd);
  return {
    totalUsd: Math.round(total * 10_000) / 10_000,
    budget,
    daily: [...daily].map(([date, usd]) => ({ date, usd: Math.round(usd * 10_000) / 10_000 })),
    byKind: sorted(byKind),
    byProvider: sorted(byProvider),
    topModels: [...byModel].map(([model, v]) => ({ model, usd: Math.round(v.usd * 10_000) / 10_000, count: v.count })).sort((a, b) => b.usd - a.usd).slice(0, 10),
    recent: items.slice(0, 50).map((r) => ({ at: r.created_at, kind: r.kind, provider: r.provider, model: r.model, usd: Number(r.cost_usd), units: Number(r.units), unit: r.unit })),
  };
});
