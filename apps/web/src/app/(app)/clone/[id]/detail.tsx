'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Captions, Clapperboard, ExternalLink, FileText, Mic, Music, PenLine, RefreshCw, Scissors, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { VideoPlayer } from '@/components/app/media-player';
import { hostOf, isBusy, JobLine, StatusPill } from '@/components/growth/shared';
import { useClone, useReadyProducts } from '@/components/growth/use-growth';
import { LlmPrice } from '@/components/scripts/llm-price';
import { BEAT_STYLE, formatSeconds, type Beat } from '@/components/scripts/use-scripts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api-client';
import type { AdBeatView, BlueprintView } from '@/lib/types';
import { cn } from '@/lib/utils';

const beatStyle = (role: string) => BEAT_STYLE[(role in BEAT_STYLE ? role : 'other') as Beat];

export function CloneDetail({ id }: { id: string }) {
  const q = useClone(id);
  if (q.isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />;
  if (q.isError || !q.data) return <EmptyState title="Clone not found" description={q.error ? errorMessage(q.error) : 'It may have been deleted.'} action={<Button asChild variant="outline"><Link href="/clone">Back to Ad Clone</Link></Button>} />;
  return <Loaded b={q.data} />;
}

function Loaded({ b }: { b: BlueprintView }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(b.name);
  const [active, setActive] = useState<number | null>(null);
  const update = (next: BlueprintView) => {
    qc.setQueryData(['clone', b.id], next);
    qc.invalidateQueries({ queryKey: ['clones'] });
  };
  const rename = useMutation({ mutationFn: (n: string) => api.patch<BlueprintView>(`/clones/${b.id}`, { name: n }), onSuccess: update, onError: (e) => toast.error(errorMessage(e)) });
  const analyze = useMutation({ mutationFn: () => api.post<BlueprintView>(`/clones/${b.id}/analyze`), onSuccess: update, onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({
    mutationFn: () => api.delete(`/clones/${b.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clones'] });
      router.push('/clone');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const s = b.structure;
  const total = s ? Math.max(s.durationS, ...s.beats.map((x) => x.endS), 0.1) : 1;
  const ref = b.reference;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <Link href="/clone" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Ad Clone
          </Link>
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== b.name && rename.mutate(name.trim())}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              maxLength={200}
              aria-label="Clone name"
              className="h-auto max-w-xl border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none hover:border-input focus-visible:px-2"
            />
            <StatusPill status={b.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" loading={analyze.isPending} disabled={b.status === 'analyzing' || isBusy(b.job)} onClick={() => analyze.mutate()}>
            <RefreshCw className="size-4" /> Analyze again
          </Button>
          <Confirm title="Delete this clone?" description="The beat map is removed. Scripts and edits made from it stay." confirmLabel="Delete" destructive onConfirm={() => remove.mutateAsync()}>
            <Button variant="ghost" size="icon-sm" aria-label="Delete clone">
              <Trash2 className="size-4" />
            </Button>
          </Confirm>
        </div>
      </div>

      {b.status === 'failed' && (
        <Notice tone="error" title="The analysis failed" action={<Button size="sm" variant="outline" loading={analyze.isPending} onClick={() => analyze.mutate()}>Try again</Button>}>
          {b.error ?? 'Try again, or use a clearer copy of the ad.'}
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_22rem]">
        <section className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="overflow-hidden rounded-2xl border bg-black">
            {ref?.type === 'video' ? (
              <VideoPlayer playback={ref.playback} src={ref.proxyUrl ?? ref.url} poster={ref.thumbnailUrl} className="aspect-[9/16] w-full" />
            ) : ref?.thumbnailUrl || b.inspiration?.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ref?.thumbnailUrl ?? b.inspiration!.thumbnailUrl!} alt="Reference ad" className="aspect-[9/16] w-full object-contain" />
            ) : (
              <div className="flex aspect-[9/16] w-full items-center justify-center text-sm text-white/60">No preview</div>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {b.inspiration ? (
              <Link href={`/inspiration?ad=${b.inspiration.id}`} className="hover:text-primary">
                Saved ad from {b.inspiration.brand}
                {b.inspiration.headline ? ` · ${b.inspiration.headline}` : ''}
              </Link>
            ) : ref ? (
              <Link href={`/library/${ref.id}`} className="hover:text-primary">
                {ref.name}
              </Link>
            ) : null}
          </div>
        </section>

        <section className="min-w-0 space-y-5">
          {b.status === 'analyzing' || !s ? (
            <div className="space-y-4 rounded-2xl border bg-card p-5">
              <JobLine job={b.job} label="Mapping the beats" />
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-4 rounded-2xl border bg-card p-5">
                <p className="text-sm">{s.summary}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary" className="capitalize">
                    {s.format.replace(/_/g, ' ')}
                  </Badge>
                  <Badge variant="outline">Hook: {s.hookType}</Badge>
                  <Badge variant="outline">{formatSeconds(s.durationS)}</Badge>
                  <Badge variant="outline">
                    <Scissors /> {Math.round(s.cutsPerMinute)} cuts/min
                  </Badge>
                  <Badge variant="outline">
                    <Music /> {s.musicMood}
                  </Badge>
                  {s.hasVoiceover && (
                    <Badge variant="outline">
                      <Mic /> Voice-over
                    </Badge>
                  )}
                  {s.hasCaptions && (
                    <Badge variant="outline">
                      <Captions /> Captions
                    </Badge>
                  )}
                </div>
                <div className="flex h-9 w-full overflow-hidden rounded-lg border" role="list" aria-label="Beat timeline">
                  {s.beats.map((beat, i) => (
                    <button
                      key={i}
                      type="button"
                      role="listitem"
                      title={`${beatStyle(beat.role).label} · ${formatSeconds(beat.startS)}–${formatSeconds(beat.endS)}`}
                      onMouseEnter={() => setActive(i)}
                      onMouseLeave={() => setActive(null)}
                      onClick={() => document.getElementById(`beat-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                      className={cn('h-full border-r text-[10px] font-medium transition last:border-r-0', beatStyle(beat.role).className, active === i && 'brightness-125')}
                      style={{ width: `${(Math.max(beat.endS - beat.startS, 0.2) / total) * 100}%` }}
                    >
                      <span className="hidden truncate px-1 sm:inline">{beatStyle(beat.role).label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <ol className="space-y-2">
                {s.beats.map((beat, i) => (
                  <BeatRow key={i} index={i} beat={beat} active={active === i} onHover={setActive} />
                ))}
              </ol>
              {s.whyItWorks.length > 0 && (
                <div className="rounded-2xl border bg-card p-5">
                  <h3 className="mb-2 font-semibold">Why it works</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {s.whyItWorks.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <AdaptPanel b={b} onUpdate={update} />
          {s?.adaptationNotes && (
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-1 text-sm font-semibold">Notes for your version</h3>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{s.adaptationNotes}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function BeatRow({ index, beat, active, onHover }: { index: number; beat: AdBeatView; active: boolean; onHover: (i: number | null) => void }) {
  const style = beatStyle(beat.role);
  return (
    <li
      id={`beat-${index}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      className={cn('grid gap-3 rounded-xl border bg-card p-4 transition sm:grid-cols-[6rem_minmax(0,1fr)]', active && 'border-primary/50 shadow-md')}
    >
      <div className="space-y-1">
        <span className={cn('inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium', style.className)}>{style.label}</span>
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatSeconds(beat.startS)}–{formatSeconds(beat.endS)}
        </div>
      </div>
      <div className="min-w-0 space-y-1.5 text-sm">
        <p>{beat.description}</p>
        {beat.onScreenText && (
          <p className="text-xs">
            <span className="text-muted-foreground">On screen: </span>“{beat.onScreenText}”
          </p>
        )}
        {beat.voiceover && (
          <p className="text-xs">
            <span className="text-muted-foreground">Voice-over: </span>“{beat.voiceover}”
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
          <span className="rounded bg-secondary px-1.5 py-0.5">{beat.shotType}</span>
          <span className="rounded bg-secondary px-1.5 py-0.5">{beat.camera}</span>
          {beat.transition && <span className="rounded bg-secondary px-1.5 py-0.5">→ {beat.transition}</span>}
        </div>
      </div>
    </li>
  );
}

function AdaptPanel({ b, onUpdate }: { b: BlueprintView; onUpdate: (b: BlueprintView) => void }) {
  const products = useReadyProducts();
  const [productId, setProductId] = useState(b.productId ?? 'none');
  const adapt = useMutation({ mutationFn: () => api.post<BlueprintView>(`/clones/${b.id}/adapt`, { productId }), onSuccess: onUpdate, onError: (e) => toast.error(errorMessage(e)) });
  const writing = b.status === 'ready' && isBusy(b.job);
  const canWrite = b.status === 'ready' && !!b.structure?.beats.length && productId !== 'none' && !writing;
  return (
    <section className="relative space-y-4 overflow-hidden rounded-2xl border bg-card p-5">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-brand/20 blur-3xl" />
      <div className="relative">
        <h2 className="font-semibold">Your version</h2>
        <p className="text-xs text-muted-foreground">An original script on this structure, with a storyboard and an edit you can open in the editor.</p>
      </div>
      {products.data && !products.data.length ? (
        <p className="text-sm text-muted-foreground">
          <Link href="/products" className="text-primary hover:underline">
            Import a product page
          </Link>{' '}
          to write your version.
        </p>
      ) : (
        <Field label="Product">
          <Select value={productId} onValueChange={setProductId} options={[{ value: 'none', label: 'Pick a product', disabled: true }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.title ?? hostOf(p.sourceUrl) }))]} />
        </Field>
      )}
      {writing && <JobLine job={b.job} label="Writing your version" />}
      {b.job?.status === 'failed' && b.status === 'ready' && <JobLine job={b.job} label="Writing" />}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="brand" loading={adapt.isPending} disabled={!canWrite} onClick={() => adapt.mutate()}>
          <PenLine className="size-4" /> {b.scriptId ? 'Write another version' : 'Write my version'}
        </Button>
        <LlmPrice task="writeScript" />
      </div>
      {(b.scriptId || b.timelineId) && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {b.scriptId && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/scripts/${b.scriptId}`}>
                <FileText className="size-4" /> Script
              </Link>
            </Button>
          )}
          {b.timelineId && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/editor/${b.timelineId}`}>
                <Clapperboard className="size-4" /> Open edit
              </Link>
            </Button>
          )}
          {b.product && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/products/${b.product.id}`}>
                <ExternalLink className="size-4" /> {b.product.title ?? 'Product'}
              </Link>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
