'use client';

import { Table2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';

export interface Point {
  day: string;
  value: number;
}

const dayLabel = (day: string, long = false) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(long ? { weekday: 'short' } : {}), timeZone: 'UTC' });
const compact = (v: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v);

function ChartTooltip({ active, payload, label, format, name }: { active?: boolean; payload?: ReadonlyArray<{ value?: unknown }>; label?: unknown; format: (v: number) => string; name: string }) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="text-muted-foreground">{typeof label === 'string' ? dayLabel(label, true) : ''}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-0.5 w-3 rounded-full" style={{ background: 'var(--viz-1)' }} />
        <span className="text-sm font-semibold text-foreground tabular-nums">{format(v)}</span>
        <span className="text-muted-foreground">{name}</span>
      </div>
    </div>
  );
}

/**
 * One measure over days: an area for flows (views), columns for amounts (spend). Hover shows the
 * day's value; the table view keeps every value reachable without hovering.
 */
export function TimeSeries({ title, data, format, kind = 'area', height = 180, summary, className, empty }: { title: string; data: Point[]; format: (v: number) => string; kind?: 'area' | 'bar'; height?: number; summary?: ReactNode; className?: string; empty?: string }) {
  const id = useId().replace(/:/g, '');
  const [table, setTable] = useState(false);
  const hasData = data.some((d) => d.value > 0);
  const axis = { tickLine: false, axisLine: false, tick: { fill: 'var(--muted-foreground)', fontSize: 11 } } as const;
  return (
    <figure className={cn('space-y-3 rounded-2xl border bg-card p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <figcaption className="text-sm font-medium">{title}</figcaption>
          {summary && <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{summary}</div>}
        </div>
        <button type="button" onClick={() => setTable((v) => !v)} aria-pressed={table} className={cn('rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground', table && 'bg-accent text-foreground')} title={table ? 'Show chart' : 'Show as table'}>
          <Table2 className="size-4" />
          <span className="sr-only">{table ? 'Show chart' : 'Show as table'}</span>
        </button>
      </div>
      {table ? (
        <div className="max-h-[220px] overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Day</th>
                <th className="px-3 py-1.5 text-right font-medium">{title}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day} className="border-t">
                  <td className="px-3 py-1.5">{dayLabel(d.day, true)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !hasData ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground" style={{ height }}>
          {empty ?? 'Nothing in this period yet'}
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === 'bar' ? (
              <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => dayLabel(d)} minTickGap={28} />
                <YAxis {...axis} width={44} tickFormatter={compact} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} format={format} name={title.toLowerCase()} />} />
                <Bar dataKey="value" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive animationDuration={700} />
              </BarChart>
            ) : (
              <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => dayLabel(d)} minTickGap={28} />
                <YAxis {...axis} width={44} tickFormatter={compact} allowDecimals={false} />
                <Tooltip cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} format={format} name={title.toLowerCase()} />} />
                <Area type="monotone" dataKey="value" stroke="var(--viz-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill={`url(#g-${id})`} activeDot={{ r: 4, fill: 'var(--viz-1)', stroke: 'var(--card)', strokeWidth: 2 }} isAnimationActive animationDuration={700} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars for a comparison (variants, platforms), labeled directly; single hue, the leader marked in text. */
export function CompareBars({ rows, format, className }: { rows: { key: string; label: ReactNode; value: number | null; note?: ReactNode; highlight?: boolean }[]; format: (v: number) => string; className?: string }) {
  const max = Math.max(...rows.map((r) => r.value ?? 0), 0) || 1;
  return (
    <div className={cn('space-y-2.5', className)} role="list">
      {rows.map((r, i) => (
        <div key={r.key} role="listitem" className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 truncate">{r.label}</span>
            <span className="shrink-0 font-medium text-foreground tabular-nums">
              {r.value == null ? '–' : format(r.value)}
              {r.note && <span className="ml-1.5 font-normal text-muted-foreground">{r.note}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn('h-full rounded-full transition-[width] duration-700 ease-out-expo', !r.highlight && 'opacity-60')}
              style={{ width: `${r.value == null ? 0 : Math.max(2, (r.value / max) * 100)}%`, background: 'var(--viz-1)', transitionDelay: `${i * 60}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
