'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Sparkles, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { VideoPlayer } from '@/components/app/media-player';
import { PlatformIcon, PLATFORM_META } from '@/components/app/platform-icon';
import { LlmPrice } from '@/components/scripts/llm-price';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Field, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import type { InspirationAdView, JobView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChipList, isBusy, JobLine, StatusPill } from './shared';
import { useCompetitors, useInspirationAd, useJob } from './use-growth';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null);

/** Saved ad: media, copy, run time, notes and the AI teardown. */
export function InspirationSheet({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const q = useInspirationAd(id);
  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        {q.isLoading || !q.data ? (
          <div className="space-y-3">
            <SheetHeader>
              <SheetTitle>{q.isError ? 'Ad not found' : 'Loading…'}</SheetTitle>
              {q.isError && <SheetDescription>{errorMessage(q.error)}</SheetDescription>}
            </SheetHeader>
            {!q.isError && <Skeleton className="aspect-[9/16] w-full rounded-xl" />}
          </div>
        ) : (
          <Body key={q.data.id} ad={q.data} onClose={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({ ad, onClose }: { ad: InspirationAdView; onClose: () => void }) {
  const qc = useQueryClient();
  const competitors = useCompetitors();
  const [notes, setNotes] = useState(ad.notes ?? '');
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const sync = (next: InspirationAdView) => {
    qc.setQueryData(['inspiration-ad', ad.id], next);
    qc.invalidateQueries({ queryKey: ['inspiration'] });
  };
  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch<InspirationAdView>(`/inspiration/${ad.id}`, body), onSuccess: sync, onError: (e) => toast.error(errorMessage(e)) });
  const analyze = useMutation({ mutationFn: () => api.post<JobView>(`/inspiration/${ad.id}/analyze`), onSuccess: (j) => setJobId(j.id), onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({
    mutationFn: () => api.delete(`/inspiration/${ad.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspiration'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  useEffect(() => {
    if (job.data && !isBusy(job.data)) {
      if (job.data.status === 'succeeded') qc.invalidateQueries({ queryKey: ['inspiration-ad', ad.id] });
      if (job.data.status === 'failed') toast.error(job.data.error ?? 'The analysis failed.');
    }
  }, [job.data, ad.id, qc]);

  const a = ad.analysis;
  const longRunner = (ad.daysRunning ?? 0) >= 30;
  const media = ad.asset;

  return (
    <div className="space-y-5">
      <SheetHeader>
        <div className="flex items-center gap-2">
          <PlatformIcon platform={ad.platform} className="size-5" />
          <SheetTitle className="truncate">{ad.brand}</SheetTitle>
          <button type="button" aria-label={ad.isFavorite ? 'Remove from favorites' : 'Add to favorites'} className={cn('ml-1 rounded p-1 transition hover:bg-accent', ad.isFavorite ? 'text-amber-400' : 'text-muted-foreground')} onClick={() => patch.mutate({ isFavorite: !ad.isFavorite })}>
            <Star className={cn('size-4', ad.isFavorite && 'fill-current')} />
          </button>
        </div>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <StatusPill status={ad.status} label={ad.status === 'active' ? 'Running' : ad.status === 'inactive' ? 'Stopped' : 'Unknown'} />
          {ad.daysRunning != null && <Badge variant={longRunner ? 'success' : 'outline'}>{ad.daysRunning} days running</Badge>}
          <span className="text-xs">{PLATFORM_META[ad.platform]?.label ?? ad.platform}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="overflow-hidden rounded-xl border bg-black">
        {media?.type === 'video' ? (
          <VideoPlayer playback={media.playback} src={media.proxyUrl ?? media.url} poster={media.thumbnailUrl} className="aspect-[9/16] max-h-[60vh] w-full" />
        ) : ad.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.thumbnailUrl} alt="" className="max-h-[60vh] w-full object-contain" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-white/60">No media saved. Open the source to watch it.</div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="brand" size="sm" asChild>
          <Link href={`/clone?inspirationId=${ad.id}`}>
            <Copy className="size-4" /> Clone this ad
          </Link>
        </Button>
        {ad.sourceUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={ad.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Source
            </a>
          </Button>
        )}
        <Confirm title="Remove this ad from your swipe file?" confirmLabel="Remove" destructive onConfirm={() => remove.mutateAsync()}>
          <Button variant="ghost" size="sm" className="ml-auto">
            <Trash2 className="size-4" /> Remove
          </Button>
        </Confirm>
      </div>

      {(ad.headline || ad.body || ad.cta) && (
        <div className="space-y-1.5 rounded-xl border p-4 text-sm">
          {ad.headline && <div className="font-medium">{ad.headline}</div>}
          {ad.body && <p className="whitespace-pre-line text-muted-foreground">{ad.body}</p>}
          {ad.cta && <Badge variant="secondary">{ad.cta}</Badge>}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 text-xs">
        {[
          ['Started', fmtDate(ad.startedAt)],
          ['Stopped', fmtDate(ad.stoppedAt) ?? (ad.status === 'active' ? 'Still running' : null)],
          ['First saved', fmtDate(ad.firstSeenAt)],
          ['Last seen', fmtDate(ad.lastSeenAt)],
        ].map(([k, v]) =>
          v ? (
            <div key={k}>
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ) : null,
        )}
      </dl>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Teardown</h3>
          <div className="flex items-center gap-2">
            <LlmPrice task="analyzeAdStructure" />
            <Button size="xs" variant={a ? 'outline' : 'default'} loading={analyze.isPending || isBusy(job.data)} onClick={() => analyze.mutate()}>
              <Sparkles className="size-3.5" /> {a ? 'Analyze again' : 'Analyze'}
            </Button>
          </div>
        </div>
        {isBusy(job.data) && <JobLine job={job.data} label="Analyzing" />}
        {a ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <Fact label="Hook" value={a.hook} />
              <Fact label="Angle" value={a.angle} />
              <Fact label="Format" value={a.format} />
              <Fact label="Call to action" value={a.cta} />
            </div>
            <Fact label="Visual style" value={a.visualStyle} />
            <List label="Structure" items={a.structure} ordered />
            <List label="Why it works" items={a.whyItWorks} />
            <List label="Emotional triggers" items={a.emotionalTriggers} />
            <List label="Weak spots" items={a.weaknesses} />
            <List label="Ideas for us" items={a.ideasForUs} highlight />
          </div>
        ) : (
          !isBusy(job.data) && <p className="text-xs text-muted-foreground">Get the hook, angle, structure and what to borrow for your own ads.</p>
        )}
      </section>

      <Field label="Tags">
        <ChipList items={ad.tags} onChange={(tags) => patch.mutate({ tags })} max={30} maxLength={60} placeholder="Add a tag" />
      </Field>
      <Field label="Competitor">
        <Select value={ad.competitorId ?? 'none'} onValueChange={(v) => patch.mutate({ competitorId: v === 'none' ? null : v })} options={[{ value: 'none', label: 'None' }, ...(competitors.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
      </Field>
      <Field label="Notes">
        <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (ad.notes ?? '') && patch.mutate({ notes: notes.trim() || null })} maxLength={5000} placeholder="What to steal, what to avoid…" />
      </Field>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-lg bg-secondary/60 p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function List({ label, items, ordered, highlight }: { label: string; items: string[]; ordered?: boolean; highlight?: boolean }) {
  if (!items.length) return null;
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <div className={cn(highlight && 'rounded-lg border border-primary/30 bg-primary/5 p-3')}>
      <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">{label}</div>
      <Tag className={cn('space-y-0.5 pl-4 text-sm', ordered ? 'list-decimal' : 'list-disc')}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </Tag>
    </div>
  );
}
