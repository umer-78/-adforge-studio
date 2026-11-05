'use client';

import { useQuery } from '@tanstack/react-query';
import { formatBytes } from '@adforge/core';
import { useMemo, useState } from 'react';
import { useJobs } from '@/components/shell/jobs-tray';
import { api } from '@/lib/api-client';
import type { PostView } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ------------------------------ Storage split ----------------------------- */

/** Three validated chart colors: video, images, and everything else folded together. */
const SPLIT = [
  { key: 'video', label: 'Video', color: 'var(--viz-1)' },
  { key: 'image', label: 'Images', color: 'var(--viz-2)' },
  { key: 'other', label: 'Audio, 3D and versions', color: 'var(--viz-3)' },
] as const;

/** One stacked bar of storage by file type, with a legend that carries the numbers. */
export function StorageSplit({ byType }: { byType: Record<string, number> }) {
  const parts = SPLIT.map((s) => ({
    ...s,
    bytes: s.key === 'other' ? Object.entries(byType).reduce((sum, [k, v]) => (k === 'video' || k === 'image' ? sum : sum + Number(v || 0)), 0) : Number(byType[s.key] ?? 0),
  }));
  const total = parts.reduce((s, p) => s + p.bytes, 0);
  if (total <= 0) return <p className="text-xs text-muted-foreground">Nothing stored yet.</p>;
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${formatBytes(p.bytes)}`).join(', ')}>
        {parts
          .filter((p) => p.bytes > 0)
          .map((p, i) => (
            <div key={p.key} title={`${p.label}: ${formatBytes(p.bytes)}`} className="grow-x h-full first:rounded-l-full last:rounded-r-full" style={{ flexGrow: p.bytes, flexBasis: 0, background: p.color, animationDelay: `${150 + i * 90}ms` }} />
          ))}
      </div>
      <ul className="space-y-1.5 text-xs">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="tabular-nums">{formatBytes(p.bytes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------- Sparkline ------------------------------- */

const W = 240;
const H = 64;

/** Generations per day as a line that draws itself in, with a readout on hover. */
export function Sparkline({ days, unit }: { days: { date: string; count: number }[]; unit: [string, string] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const step = days.length > 1 ? W / (days.length - 1) : W;
  const pts = days.map((d, i) => [i * step, H - 6 - (d.count / max) * (H - 14)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const active = hover != null ? days[hover] : null;
  const total = days.reduce((s, d) => s + d.count, 0);
  if (!days.length) return null;
  return (
    <figure className="space-y-1.5">
      <figcaption className="flex h-4 items-baseline justify-between text-xs text-muted-foreground">
        <span>{active ? fmtDay(active.date) : `Last ${days.length} days`}</span>
        <span className="font-medium text-foreground tabular-nums">{active ? `${active.count} ${active.count === 1 ? unit[0] : unit[1]}` : `${total} in all`}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full overflow-visible" onMouseLeave={() => setHover(null)} role="img" aria-label={days.map((d) => `${fmtDay(d.date)}: ${d.count}`).join(', ')}>
        <defs>
          <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#spark-fill)" className="fade-late" />
        <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} className="draw-line" />
        {active && hover != null && (
          <>
            <line x1={pts[hover]![0]} x2={pts[hover]![0]} y1={0} y2={H} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
            <circle cx={pts[hover]![0]} cy={pts[hover]![1]} r={3.5} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
        {pts.map(([x], i) => (
          <rect key={i} x={x - step / 2} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
    </figure>
  );
}

/* ------------------------------- Week strip ------------------------------- */

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** The next seven days, with a dot for every scheduled post. */
export function WeekStrip() {
  const range = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }, []);
  const posts = useQuery({
    queryKey: ['posts', 'week', range.start.toISOString()],
    queryFn: () => api.get<{ items: PostView[] }>(`/posts?from=${encodeURIComponent(range.start.toISOString())}&to=${encodeURIComponent(range.end.toISOString())}&limit=100`),
  });
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(range.start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const counts = new Map<string, number>();
  for (const p of posts.data?.items ?? []) {
    if (p.status !== 'scheduled' || !p.scheduledAt) continue;
    const at = new Date(p.scheduledAt);
    if (at < range.start || at >= range.end) continue;
    counts.set(dayKey(at), (counts.get(dayKey(at)) ?? 0) + 1);
  }
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="Scheduled posts in the next seven days">
      {days.map((d, i) => {
        const n = counts.get(dayKey(d)) ?? 0;
        const label = d.toLocaleDateString(undefined, { weekday: 'short' });
        return (
          <li key={dayKey(d)} aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long' })}: ${n} post${n === 1 ? '' : 's'}`} className={cn('rise-in flex flex-col items-center gap-1.5 rounded-lg border border-transparent py-2', i === 0 && 'border-primary/40 bg-primary/5')} style={{ animationDelay: `${120 + i * 45}ms` }}>
            <span className={cn('text-[10px] uppercase tracking-wide', i === 0 ? 'text-primary' : 'text-muted-foreground')}>{label.slice(0, 2)}</span>
            <span className="flex h-7 flex-col items-center justify-end gap-0.5">
              {Array.from({ length: Math.min(n, 3) }, (_, k) => (
                <span key={k} className="size-1.5 rounded-full bg-primary" />
              ))}
              {n === 0 && <span className="size-1.5 rounded-full bg-surface-3" />}
            </span>
            <span className="text-[11px] font-medium tabular-nums">{n > 3 ? `${n}` : d.getDate()}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------- Live jobs ------------------------------- */

/** What is running right now, with progress that moves; a calm pulse when the queue is empty. */
export function LiveJobs() {
  const jobs = useJobs('active');
  const items = jobs.data?.items ?? [];
  if (jobs.isLoading) return null;
  if (!items.length)
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/50" />
          <span className="relative size-2 rounded-full bg-emerald-400" />
        </span>
        Queue is clear
      </div>
    );
  return (
    <ul className="space-y-2.5">
      {items.slice(0, 2).map((j) => (
        <li key={j.id} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate">{j.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{j.status === 'queued' ? 'Queued' : `${Math.round(j.progress * 100)}%`}</span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out-expo" style={{ width: `${Math.max(4, j.progress * 100)}%` }} />
            <div className="shimmer-bar absolute inset-0" />
          </div>
          {j.progressMessage && <div className="text-[11px] text-muted-foreground">{j.progressMessage}</div>}
        </li>
      ))}
    </ul>
  );
}
