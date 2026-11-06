'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ExternalLink, MessageSquare, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { VideoPlayer } from '@/components/app/media-player';
import { PlatformIcon, PLATFORM_META } from '@/components/app/platform-icon';
import { StatusPill } from '@/components/growth/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api, errorMessage } from '@/lib/api-client';
import type { PostMetricsView, PostTargetView, PostView } from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/utils';

export const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/** Local datetime-local value for an ISO time. */
export function toLocalInput(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MetricsLine({ m, className }: { m: PostMetricsView; className?: string }) {
  const items: [string, number | null][] = [
    ['views', m.views],
    ['likes', m.likes],
    ['comments', m.comments],
    ['shares', m.shares],
    ['saves', m.saves],
    ['clicks', m.clicks],
  ];
  const shown = items.filter(([, v]) => v != null);
  if (!shown.length) return <span className={className}>No results yet</span>;
  return (
    <span className={className}>
      {shown.map(([k, v]) => `${formatNumber(v)} ${k}`).join(' · ')}
      {m.ctr != null && ` · ${formatPercent(m.ctr)} CTR`}
    </span>
  );
}

/** One post: preview, where it went, results, and the actions its state allows. */
export function PostSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const q = useQuery({
    queryKey: ['post', id],
    queryFn: () => api.get<PostView>(`/posts/${id}`),
    enabled: !!id,
    refetchInterval: (s) => (s.state.data && (s.state.data.status === 'publishing' || s.state.data.targets.some((t) => t.status === 'publishing' || t.status === 'processing')) ? 3000 : false),
  });
  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        {!q.data ? (
          <SheetHeader>
            <SheetTitle>{q.isError ? 'Post not found' : 'Loading…'}</SheetTitle>
            {q.isError ? <SheetDescription>{errorMessage(q.error)}</SheetDescription> : <Skeleton className="aspect-[9/16] w-full rounded-xl" />}
          </SheetHeader>
        ) : (
          <Body key={q.data.id} post={q.data} onClose={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({ post: p, onClose }: { post: PostView; onClose: () => void }) {
  const qc = useQueryClient();
  const [at, setAt] = useState(toLocalInput(p.scheduledAt));
  const sync = (next: PostView) => {
    qc.setQueryData(['post', p.id], next);
    qc.invalidateQueries({ queryKey: ['posts'] });
  };
  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch<PostView>(`/posts/${p.id}`, body), onSuccess: sync, onError: (e) => toast.error(errorMessage(e)) });
  const retry = useMutation({ mutationFn: () => api.post<PostView>(`/posts/${p.id}/retry`), onSuccess: sync, onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({
    mutationFn: () => api.delete(`/posts/${p.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pending = p.status === 'draft' || p.status === 'scheduled';
  const a = p.asset;
  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {p.title || (p.caption ? p.caption.slice(0, 60) : 'Post')}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <StatusPill status={p.status} />
          {p.abVariant && <Badge variant="secondary">Variant {p.abVariant}</Badge>}
          {p.aiLabel && <Badge variant="outline">AI label</Badge>}
          <span className="text-xs">{p.status === 'scheduled' ? `Goes out ${fmtWhen(p.scheduledAt)}` : p.publishedAt ? `Published ${fmtWhen(p.publishedAt)}` : ''}</span>
        </SheetDescription>
      </SheetHeader>
      {a && (
        <div className="overflow-hidden rounded-xl border bg-black">
          {a.type === 'video' ? (
            <VideoPlayer playback={a.playback} src={a.proxyUrl ?? a.url} poster={a.thumbnailUrl} className="max-h-[50vh] w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            a.thumbnailUrl && <img src={a.url ?? a.thumbnailUrl} alt={a.name} className="max-h-[50vh] w-full object-contain" />
          )}
        </div>
      )}
      {(p.caption || p.hashtags.length > 0) && (
        <div className="rounded-xl border p-3 text-sm whitespace-pre-line">
          {p.caption}
          {p.hashtags.length > 0 && <div className="mt-2 text-primary">{p.hashtags.map((h) => `#${h}`).join(' ')}</div>}
        </div>
      )}
      {p.firstComment && (
        <div className="rounded-xl border border-dashed p-3 text-sm whitespace-pre-line">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MessageSquare className="size-3.5" /> First comment
          </div>
          {p.firstComment}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Accounts</h3>
        {p.targets.map((t) => (
          <div key={t.id} className="space-y-1.5 rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <PlatformIcon platform={t.platform} className="size-5" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.account?.displayName ?? t.account?.handle ?? PLATFORM_META[t.platform]?.label}</span>
              <StatusPill status={t.status} />
            </div>
            {t.error && <p className="text-xs text-destructive">{t.error}</p>}
            {p.firstComment && t.firstComment && <FirstCommentLine state={t.firstComment} />}
            {t.status === 'published' && <MetricsLine m={t.metrics} className="block text-xs text-muted-foreground" />}
            {t.externalUrl && (
              <a href={t.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                View on {PLATFORM_META[t.platform]?.label ?? t.platform} <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        ))}
      </div>

      {pending && (
        <div className="space-y-3 rounded-xl border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid flex-1 gap-1 text-xs font-medium">
              {p.status === 'scheduled' ? 'Move to' : 'Schedule for'}
              <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} min={toLocalInput(new Date().toISOString())} />
            </label>
            <Button size="sm" variant="outline" loading={patch.isPending && !!patch.variables?.scheduledAt} onClick={() => patch.mutate({ scheduledAt: new Date(at).toISOString() })}>
              <CalendarClock className="size-4" /> {p.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Confirm title="Publish now?" description="It goes out to every account on this post right away." confirmLabel="Publish now" onConfirm={() => patch.mutateAsync({ scheduledAt: null })}>
              <Button size="sm">
                <Send className="size-4" /> Publish now
              </Button>
            </Confirm>
            <Confirm title="Cancel this post?" description="Nothing is published. You can still delete it afterwards." confirmLabel="Cancel post" destructive onConfirm={() => patch.mutateAsync({ status: 'canceled' })}>
              <Button size="sm" variant="ghost">
                <X className="size-4" /> Cancel post
              </Button>
            </Confirm>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        {(p.status === 'failed' || p.status === 'partially_published') && (
          <Button size="sm" loading={retry.isPending} onClick={() => retry.mutate()}>
            <RotateCcw className="size-4" /> Retry failed accounts
          </Button>
        )}
        {p.status !== 'publishing' && (
          <Confirm title="Delete this post from AdForge?" description={p.publishedAt ? 'It stays live on the platforms; only the record here and its results are removed.' : 'It is removed and will not be published.'} confirmLabel="Delete" destructive onConfirm={() => remove.mutateAsync()}>
            <Button size="sm" variant="ghost" className="ml-auto">
              <Trash2 className="size-4" /> Delete
            </Button>
          </Confirm>
        )}
      </div>
    </div>
  );
}

function FirstCommentLine({ state }: { state: NonNullable<PostTargetView['firstComment']> }) {
  if (state.status === 'posted') return <p className="text-xs text-success">First comment posted.</p>;
  if (state.status === 'unsupported') return <p className="text-xs text-muted-foreground">This network does not allow the first comment, so it was not posted.</p>;
  return <p className="text-xs text-destructive">First comment not posted{state.error ? `: ${state.error}` : '.'}</p>;
}
