'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Minimal accessible bar chart: one series, hover readout, animated in. */
export function BarChart({ data, format = (v) => String(v), height = 140, className, label }: { data: { label: string; value: number }[]; format?: (v: number) => string; height?: number; className?: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const active = hover != null ? data[hover] : null;
  return (
    <figure className={cn('space-y-2', className)} aria-label={label}>
      <div className="flex h-5 items-baseline justify-between text-xs text-muted-foreground">
        <span>{active ? active.label : label}</span>
        <span className="font-medium text-foreground tabular-nums">{active ? format(active.value) : ''}</span>
      </div>
      <div className="flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={d.label} className="group flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} title={`${d.label}: ${format(d.value)}`}>
            <div
              className={cn('bar-grow w-full rounded-t-[3px] bg-chart-1/70 transition-[background-color] duration-200', hover === i && 'bg-chart-1')}
              style={{ height: `${Math.max(d.value > 0 ? 3 : 1, (d.value / max) * 100)}%`, animationDelay: `${120 + i * 22}ms` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {data.map((d) => `${d.label}: ${format(d.value)}`).join(', ')}
      </figcaption>
    </figure>
  );
}

/** Horizontal share bars for a breakdown (spend by kind, posts by platform…). One hue: the label names each bar, the length shows its share. */
export function ShareBars({ data, format = (v) => String(v) }: { data: { key: string; label?: string; value: number }[]; format?: (v: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.key} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground capitalize">{d.label ?? d.key}</span>
            <span className="tabular-nums">{format(d.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="grow-x h-full rounded-full transition-[width] duration-700 ease-out-expo" style={{ width: `${(d.value / total) * 100}%`, background: 'var(--viz-1)', transitionDelay: `${i * 40}ms`, animationDelay: `${300 + i * 80}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
