'use client';

import { CircleAlert, Send } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PlatformIcon } from '@/components/app/platform-icon';
import { PostCalendar } from '@/components/distribution/calendar';
import { Composer } from '@/components/distribution/composer';
import { fmtWhen, MetricsLine, PostSheet } from '@/components/distribution/post-sheet';
import { usePosts } from '@/components/distribution/use-distribution';
import { StatusPill } from '@/components/growth/shared';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import type { PostView } from '@/lib/types';
import { qs } from '@/lib/utils';

type Tab = 'compose' | 'calendar' | 'posts';

export function PublishView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initialAssets = (params.get('assets') ?? params.get('asset') ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const [tab, setTabState] = useState<Tab>(params.get('tab') === 'calendar' ? 'calendar' : params.get('tab') === 'posts' ? 'posts' : 'compose');
  const [open, setOpen] = useState<string | null>(params.get('post'));
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace(`${pathname}${qs({ tab: t === 'compose' ? undefined : t })}`, { scroll: false });
  };
  return (
    <div className="space-y-5">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'compose', label: 'Compose' },
          { value: 'calendar', label: 'Calendar' },
          { value: 'posts', label: 'All posts' },
        ]}
      />
      {tab === 'compose' && <Composer initialAssetIds={initialAssets} initialAbGroup={params.get('abGroup')} onPublished={() => setTab('posts')} />}
      {tab === 'calendar' && <PostCalendar onOpen={setOpen} />}
      {tab === 'posts' && <PostList onOpen={setOpen} />}
      <PostSheet id={open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'publishing', label: 'Publishing' },
  { value: 'published', label: 'Published' },
  { value: 'failed', label: 'Failed' },
] as const;

function PostList({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<(typeof FILTERS)[number]['value']>('all');
  const list = usePosts({ status: status === 'all' ? undefined : status });
  return (
    <div className="space-y-4">
      <Segmented size="sm" value={status} onChange={setStatus} options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState icon={<CircleAlert />} title="Could not load posts" />
      ) : !list.data?.items.length ? (
        <EmptyState icon={<Send />} title={status === 'all' ? 'Nothing posted yet' : 'No posts here'} description="Compose a post to publish now or schedule it." />
      ) : (
        <div className="space-y-2">
          {list.data.items.map((p) => (
            <PostRow key={p.id} post={p} onOpen={() => onOpen(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostRow({ post: p, onOpen }: { post: PostView; onOpen: () => void }) {
  const failed = p.targets.filter((t) => t.status === 'failed');
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 rounded-xl border bg-card p-3 text-left transition hover:border-primary/50 hover:shadow-md">
      <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.asset?.thumbnailUrl && <img src={p.asset.thumbnailUrl} alt="" className="size-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{p.title || p.caption || p.asset?.name || 'Post'}</span>
          {p.abVariant && <Badge variant="secondary">Variant {p.abVariant}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex -space-x-1">
            {p.platforms.map((pl) => (
              <PlatformIcon key={pl} platform={pl} className="size-4" />
            ))}
          </span>
          <span>{p.status === 'scheduled' ? `Goes out ${fmtWhen(p.scheduledAt)}` : p.publishedAt ? fmtWhen(p.publishedAt) : fmtWhen(p.createdAt)}</span>
          {p.status === 'published' || p.status === 'partially_published' ? <MetricsLine m={p.totals} /> : null}
          {failed.length > 0 && <span className="text-destructive">{failed.length} failed</span>}
        </div>
      </div>
      <StatusPill status={p.status} />
    </button>
  );
}
