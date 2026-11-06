'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useMemo } from 'react';
import { bestTimes, MIN_POSTS_FOR_OWN_TIMES, nextSlotTimes, type PostResult } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { useNow } from '@/lib/hooks/use-now';
import { toLocalInput } from './post-sheet';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Suggested times to schedule, from how this workspace's posts did on the chosen networks. */
export function BestTimes({ platforms, value, onPick }: { platforms: string[]; value: string; onPick: (local: string) => void }) {
  const now = useNow(60_000);
  const results = useQuery({ queryKey: ['posts', 'results'], queryFn: () => api.get<{ items: PostResult[] }>('/posts/results'), staleTime: 10 * 60_000 });
  const key = platforms.slice().sort().join(',');
  const best = useMemo(() => (results.data ? bestTimes(results.data.items, { platforms: key ? key.split(',') : [], timeZone: zone() }) : null), [results.data, key]);
  const times = useMemo(() => (best ? nextSlotTimes(best.slots.slice(0, 4), new Date(now), zone(), 4) : []), [best, now]);
  if (!best || !times.length) return null;
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Clock className="size-3.5 text-primary" /> Good times to post
      </div>
      <div className="flex flex-wrap gap-1.5">
        {times.map((t) => {
          const local = toLocalInput(t.toISOString());
          return (
            <Button key={local} size="xs" variant={value === local ? 'default' : 'secondary'} onClick={() => onPick(local)}>
              {fmt.format(t)}
            </Button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {best.source === 'yours'
          ? `From how your last ${best.posts} posts did, in your time zone.`
          : `Common starting points for ${platforms.length ? 'these networks' : 'Instagram and TikTok'}. After ${MIN_POSTS_FOR_OWN_TIMES} posts with results, your own audience decides.`}
      </p>
    </div>
  );
}
