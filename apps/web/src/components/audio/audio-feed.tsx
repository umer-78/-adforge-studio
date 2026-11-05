'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Clapperboard, Download, ExternalLink, Languages, MessagesSquare, Music, Repeat, Scissors, Sparkles, Star, X, Zap, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CAPABILITIES, formatUsd, type Capability } from '@adforge/core';
import { VideoPlayer } from '@/components/app/media-player';
import { WaveformPlayer } from '@/components/audio/waveform-player';
import { Button } from '@/components/ui/button';
import { EmptyState, Progress, Skeleton } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/spinner';
import { Tip } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api-client';
import { useOpenInEditor } from '@/lib/hooks/use-open-in-editor';
import type { AssetView, GenerationView, Page } from '@/lib/types';
import { cn, qs, timeAgo } from '@/lib/utils';

const ICONS: Partial<Record<Capability, LucideIcon>> = { tts: AudioLines, dialogue: MessagesSquare, sts: Repeat, isolate: Sparkles, dub: Languages, music: Music, sfx: Zap, stems: Scissors };
const STEMS = ['Vocals', 'Drums', 'Bass', 'Other'];
const ACTIVE = new Set(['queued', 'running']);

export function useAudioFeed(capabilities: Capability[]) {
  return useInfiniteQuery({
    queryKey: ['generations', 'audio', capabilities.join(',')],
    queryFn: ({ pageParam }) => api.get<Page<GenerationView>>(`/generations${qs({ capability: capabilities, limit: 20, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some((g) => ACTIVE.has(g.status))) ? 3000 : false),
  });
}

/** Recent audio generations for a studio tab, newest first, with players and actions. */
export function AudioFeed({ capabilities, emptyTitle, emptyDescription, className }: { capabilities: Capability[]; emptyTitle: string; emptyDescription?: string; className?: string }) {
  const feed = useAudioFeed(capabilities);
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  if (feed.isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!items.length) return <EmptyState icon={<AudioLines />} title={emptyTitle} description={emptyDescription} className={className} />;
  return (
    <div className={cn('space-y-2', className)}>
      {items.map((g) => (
        <AudioGenRow key={g.id} gen={g} />
      ))}
      {feed.hasNextPage && (
        <Button variant="ghost" className="w-full" loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
          Load more
        </Button>
      )}
    </div>
  );
}

export function AudioGenRow({ gen }: { gen: GenerationView }) {
  const qc = useQueryClient();
  const editor = useOpenInEditor();
  const Icon = ICONS[gen.capability as Capability] ?? AudioLines;
  const active = ACTIVE.has(gen.status);
  const cancel = useMutation({
    mutationFn: () => api.post(`/generations/${gen.id}/cancel`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['generations'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const favorite = useMutation({
    mutationFn: (a: AssetView) => api.patch(`/assets/${a.id}`, { isFavorite: !a.isFavorite }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['generations'] }),
  });
  const label = CAPABILITIES[gen.capability as Capability]?.label ?? gen.capability;
  const title = (gen.prompt ?? '').replace(/\[[^\]]*\]\s*/g, '').trim() || gen.inputs[0]?.name || label;
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', gen.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-2 text-[13px]" title={gen.prompt ?? ''}>
              {title}
            </p>
            <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
              <span>{gen.modelLabel}</span>
              <span className="tabular-nums">{formatUsd(gen.costActualUsd ?? gen.costEstimateUsd)}</span>
              <span>{timeAgo(gen.createdAt)}</span>
            </div>
          </div>
          {active ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Spinner className="size-3.5" /> {gen.status === 'queued' ? 'Waiting' : 'Working'}
              <Progress value={gen.progress} className="h-1 flex-1" />
              <Button size="xs" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                <X className="size-3.5" /> Cancel
              </Button>
            </div>
          ) : gen.status === 'failed' || gen.status === 'canceled' ? (
            <p className="text-xs text-destructive">{gen.status === 'canceled' ? 'Canceled.' : (gen.error ?? 'It failed.')}</p>
          ) : (
            gen.outputs.map((a, i) => (
              <div key={a.id} className="space-y-1">
                {gen.capability === 'stems' && <div className="text-[11px] font-medium text-muted-foreground">{STEMS[i] ?? `Part ${i + 1}`}</div>}
                <div className="flex items-center gap-1">
                  {a.type === 'video' ? (
                    <div className="aspect-video w-full max-w-sm overflow-hidden rounded-lg">
                      <VideoPlayer playback={a.playback} src={a.proxyUrl ?? a.url} poster={a.thumbnailUrl} />
                    </div>
                  ) : (
                    <WaveformPlayer assetId={a.id} src={a.url} waveformUrl={a.waveformUrl} durationS={a.durationS} height={36} className="min-w-0 flex-1" />
                  )}
                  <Tip content={a.isFavorite ? 'Unfavorite' : 'Favorite'}>
                    <Button size="icon-sm" variant="ghost" aria-label="Favorite" onClick={() => favorite.mutate(a)}>
                      <Star className={cn('size-4', a.isFavorite && 'fill-amber-400 text-amber-400')} />
                    </Button>
                  </Tip>
                  <Tip content="Download">
                    <Button size="icon-sm" variant="ghost" asChild>
                      <a href={`/api/assets/${a.id}/download`} aria-label="Download">
                        <Download className="size-4" />
                      </a>
                    </Button>
                  </Tip>
                  <Tip content="Put on a new edit">
                    <Button size="icon-sm" variant="ghost" aria-label="Open in the editor" loading={editor.isPending} onClick={() => editor.mutate({ assetIds: [a.id], name: title.slice(0, 80) })}>
                      <Clapperboard className="size-4" />
                    </Button>
                  </Tip>
                  <Tip content="Open in library">
                    <Button size="icon-sm" variant="ghost" asChild>
                      <Link href={`/library/${a.id}`} aria-label="Open in library">
                        <ExternalLink className="size-4" />
                      </Link>
                    </Button>
                  </Tip>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
