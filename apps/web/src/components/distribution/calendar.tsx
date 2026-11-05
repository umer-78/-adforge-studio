'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PlatformIcon } from '@/components/app/platform-icon';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import type { PostView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { usePosts } from './use-distribution';

const DAY = 86_400_000;
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, i + 1).toLocaleDateString(undefined, { weekday: 'short' }));
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const postTime = (p: PostView) => p.scheduledAt ?? p.publishedAt ?? p.createdAt;

/** Month grid of scheduled and published posts (weeks start on Monday, local time). */
export function PostCalendar({ onOpen }: { onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const { start, days } = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const s = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const weeks = Math.ceil((offset + last.getDate()) / 7);
    return { start: s, days: Array.from({ length: weeks * 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i)) };
  }, [month]);
  const end = new Date(days[days.length - 1]!.getTime() + DAY);
  const list = usePosts({ from: start.toISOString(), to: end.toISOString(), limit: 200 });
  const byDay = useMemo(() => {
    const m = new Map<string, PostView[]>();
    for (const p of list.data?.items ?? []) {
      if (p.status === 'canceled') continue;
      const k = dayKey(new Date(postTime(p)));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [list.data]);
  const today = dayKey(new Date());

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="min-w-40 text-lg font-semibold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
          <ChevronRight className="size-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          Today
        </Button>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" /> Scheduled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" /> Published
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive" /> Failed
          </span>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = dayKey(d);
            const posts = byDay.get(k) ?? [];
            const inMonth = d.getMonth() === month.getMonth();
            return (
              <div key={k} className={cn('min-h-28 border-r border-b p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-muted/30 text-muted-foreground')}>
                <div className={cn('mb-1 flex size-6 items-center justify-center rounded-full text-xs', k === today && 'bg-primary font-semibold text-primary-foreground')}>{d.getDate()}</div>
                {list.isLoading ? (
                  inMonth && d.getDate() % 5 === 0 ? <Skeleton className="h-6 rounded-md" /> : null
                ) : (
                  <div className="space-y-1">
                    {posts.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onOpen(p.id)}
                        className={cn(
                          'flex w-full items-center gap-1 rounded-md border-l-2 bg-card px-1.5 py-1 text-left text-[11px] shadow-xs transition hover:bg-accent',
                          p.status === 'published' ? 'border-l-success' : p.status === 'failed' || p.status === 'partially_published' ? 'border-l-destructive' : 'border-l-primary',
                        )}
                      >
                        <span className="tabular-nums">{new Date(postTime(p)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                        <span className="flex -space-x-1">
                          {p.platforms.slice(0, 3).map((pl) => (
                            <PlatformIcon key={pl} platform={pl} className="size-3.5" />
                          ))}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{p.title || p.caption || p.asset?.name}</span>
                      </button>
                    ))}
                    {posts.length > 4 && <div className="px-1 text-[11px] text-muted-foreground">+{posts.length - 4} more</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
