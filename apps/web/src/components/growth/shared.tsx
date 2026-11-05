'use client';

import { CircleAlert, Plus, X } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/misc';
import type { JobView } from '@/lib/types';
import { cn } from '@/lib/utils';

export const hostOf = (url: string | null | undefined) => {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export const isBusy = (job: JobView | null | undefined) => !!job && (job.status === 'queued' || job.status === 'running');

/** Progress of a background job, with its latest message. */
export function JobLine({ job, label, className }: { job: JobView | null | undefined; label: string; className?: string }) {
  if (!job) return null;
  if (job.status === 'failed')
    return (
      <p className={cn('flex items-start gap-1.5 text-xs text-destructive', className)}>
        <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {job.error ?? `${label} failed.`}
      </p>
    );
  if (!isBusy(job)) return null;
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{job.progressMessage ?? (job.status === 'queued' ? 'Waiting to start…' : `${label}…`)}</span>
        {job.progress > 0 && <span className="tabular-nums">{Math.round(job.progress)}%</span>}
      </div>
      <Progress value={job.progress} indeterminate={job.status === 'queued' || job.progress <= 0} />
    </div>
  );
}

const TONE: Record<string, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  ready: 'success',
  done: 'success',
  published: 'success',
  active: 'success',
  completed: 'secondary',
  succeeded: 'success',
  running: 'default',
  waiting: 'default',
  awaiting_approval: 'warning',
  skipped: 'outline',
  importing: 'default',
  analyzing: 'default',
  planning: 'default',
  rendering: 'default',
  building: 'default',
  launching: 'default',
  publishing: 'default',
  processing: 'default',
  uploading: 'default',
  scheduled: 'default',
  partially_published: 'warning',
  paused: 'warning',
  draft: 'outline',
  planned: 'outline',
  pending: 'outline',
  inactive: 'outline',
  unknown: 'outline',
  canceled: 'outline',
  archived: 'outline',
  failed: 'destructive',
  rejected: 'destructive',
  expired: 'destructive',
  revoked: 'destructive',
};

export function StatusPill({ status, label, className }: { status: string; label?: ReactNode; className?: string }) {
  const tone = TONE[status] ?? 'outline';
  const busy = tone === 'default' && status !== 'scheduled';
  return (
    <Badge variant={tone} className={cn('capitalize', className)}>
      {busy && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {label ?? status.replace(/_/g, ' ')}
    </Badge>
  );
}

/** Editable list of short strings shown as chips. Enter adds, Backspace on empty removes the last. */
export function ChipList({ items, onChange, placeholder = 'Add…', max = 20, maxLength = 500, className }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; maxLength?: number; className?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v) || items.length >= max) return;
    onChange([...items, v.slice(0, maxLength)]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !draft && items.length) onChange(items.slice(0, -1));
  };
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-surface p-1.5', className)}>
      {items.map((it) => (
        <span key={it} className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs">
          <span className="truncate">{it}</span>
          <button type="button" aria-label={`Remove ${it}`} className="text-muted-foreground hover:text-foreground" onClick={() => onChange(items.filter((x) => x !== it))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      {items.length < max && (
        <div className="flex min-w-40 flex-1 items-center">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add} placeholder={placeholder} maxLength={maxLength} className="h-7 border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0" />
          {draft.trim() && (
            <button type="button" aria-label="Add" className="px-1 text-muted-foreground hover:text-foreground" onMouseDown={(e) => e.preventDefault()} onClick={add}>
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Money with the right symbol when the currency is known. */
export function money(v: number | null | undefined, currency?: string | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '–';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 2) }).format(v);
  } catch {
    return `${v.toFixed(digits)} ${currency ?? ''}`.trim();
  }
}
