'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatUsd, VARIANT_DIMENSIONS } from '@adforge/core';
import { VoicePreview, useVoices } from '@/components/app/voice-picker';
import { DIMENSION_LABEL, type Dimension } from '@/components/growth/labels';
import { JobLine, StatusPill } from '@/components/growth/shared';
import { useTimelines, useVariantBatches } from '@/components/growth/use-growth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Progress, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import type { VariantBatchView } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';


export function VariantsView() {
  const list = useVariantBatches();
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <BatchForm className="self-start xl:sticky xl:top-20" />
      <section className="min-w-0 space-y-4">
        <h2 className="font-semibold">Batches</h2>
        {list.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Layers />} title="No variants yet" description="Pick a finished edit and what to vary. Planning takes about a minute; then you review each version before anything renders." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.data.items.map((b) => (
              <BatchCard key={b.id} batch={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BatchForm({ className }: { className?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const timelines = useTimelines();
  const voices = useVoices();
  const [timelineId, setTimelineId] = useState(params.get('timelineId') ?? 'none');
  const [name, setName] = useState('');
  const [dims, setDims] = useState<Dimension[]>(['hook', 'cta']);
  const [count, setCount] = useState(4);
  const [voiceIds, setVoiceIds] = useState<string[]>([]);
  const toggle = (d: Dimension) => setDims((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));
  const toggleVoice = (id: string) => setVoiceIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : v.length >= 10 ? v : [...v, id]));
  const key = useDebounced(JSON.stringify({ timelineId, dims: [...dims].sort(), count }), 300);
  const estimate = useQuery({
    queryKey: ['variants-estimate', key],
    queryFn: () => api.post<{ usd: number; voiceChars: number }>('/variants/estimate', { sourceTimelineId: timelineId, dimensions: dims, count }),
    enabled: timelineId !== 'none' && dims.length > 0,
    retry: false,
  });
  const source = timelines.data?.find((t) => t.id === timelineId);
  const create = useMutation({
    mutationFn: () =>
      api.post<VariantBatchView>('/variants', {
        name: name.trim() || `${source?.name ?? 'Edit'} variants`.slice(0, 200),
        sourceTimelineId: timelineId,
        dimensions: dims,
        count,
        ...(dims.includes('voice') ? { voiceIds } : {}),
      }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['variants'] });
      router.push(`/variants/${b.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const ready = timelineId !== 'none' && dims.length > 0 && (!dims.includes('voice') || voiceIds.length > 0);

  return (
    <div className={cn('space-y-4 rounded-2xl border bg-card p-5', className)}>
      <h2 className="font-semibold">New batch</h2>
      <Field label="Edit to vary" hint={timelines.data && !timelines.data.length ? 'Make an edit in the editor first.' : undefined}>
        <Select
          value={timelineId}
          onValueChange={setTimelineId}
          options={[{ value: 'none', label: 'Pick an edit', disabled: true }, ...(timelines.data ?? []).map((t) => ({ value: t.id, label: t.name, hint: `${t.aspect} · ${Math.round(t.durationS)}s · edited ${timeAgo(t.updatedAt)}` }))]}
        />
      </Field>
      <Field label="What to vary">
        <div className="grid grid-cols-2 gap-2">
          {VARIANT_DIMENSIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dims.includes(d)}
              onClick={() => toggle(d)}
              className={cn('rounded-xl border p-2.5 text-left transition', dims.includes(d) ? 'border-primary bg-primary/10' : 'hover:border-input hover:bg-accent/40')}
            >
              <div className="text-sm font-medium">{DIMENSION_LABEL[d].label}</div>
              <div className="text-[11px] text-muted-foreground">{DIMENSION_LABEL[d].hint}</div>
            </button>
          ))}
        </div>
      </Field>
      {dims.includes('voice') && (
        <Field label="Voices" hint="Each variant gets one, in turn. Add voices in Voice-over.">
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border p-1.5">
            {voices.data?.length ? (
              voices.data.map((v) => (
                <div key={v.id} className={cn('flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-accent/50', voiceIds.includes(v.providerVoiceId) && 'bg-primary/10')}>
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-0.5">
                    <input type="checkbox" className="accent-[var(--primary)]" checked={voiceIds.includes(v.providerVoiceId)} onChange={() => toggleVoice(v.providerVoiceId)} />
                    <span className="truncate">{v.name}</span>
                  </label>
                  <VoicePreview url={v.previewUrl} />
                </div>
              ))
            ) : (
              <p className="p-2 text-xs text-muted-foreground">
                No voices yet.{' '}
                <Link href="/voice" className="text-primary hover:underline">
                  Add one
                </Link>
                .
              </p>
            )}
          </div>
        </Field>
      )}
      <Field label="Versions" aside={<span className="font-medium text-foreground tabular-nums">{count}</span>}>
        <Slider min={2} max={10} step={1} value={[count]} onValueChange={(v) => setCount(v[0] ?? 4)} />
      </Field>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder={`${source?.name ?? 'Edit'} variants`} />
      </Field>
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Planning{dims.includes('voice') ? ' and new voice-overs' : ''}</span>
          <span className="font-medium tabular-nums">{estimate.isFetching ? '…' : estimate.data ? `≈ ${formatUsd(estimate.data.usd)}` : '–'}</span>
        </div>
        {estimate.isError && <p className="text-xs text-destructive">{errorMessage(estimate.error)}</p>}
        <p className="text-[11px] text-muted-foreground">Rendering runs on your own render worker and adds nothing.</p>
        <Button variant="brand" className="w-full" loading={create.isPending} disabled={!ready} onClick={() => create.mutate()}>
          <Sparkles className="size-4" /> Plan {count} variants
        </Button>
      </div>
    </div>
  );
}

function BatchCard({ batch: b }: { batch: VariantBatchView }) {
  const done = b.variants.filter((v) => v.status === 'done').length;
  const thumbs = b.variants.flatMap((v) => (v.asset?.thumbnailUrl ? [v.asset.thumbnailUrl] : [])).slice(0, 4);
  return (
    <Link href={`/variants/${b.id}`} className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium group-hover:text-primary">{b.name}</div>
          <div className="truncate text-xs text-muted-foreground">From {b.sourceTimelineName ?? 'a deleted edit'}</div>
        </div>
        <StatusPill status={b.status} />
      </div>
      <div className="flex flex-wrap gap-1">
        {b.dimensions.map((d) => (
          <span key={d} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
            {DIMENSION_LABEL[d as Dimension]?.label ?? d}
          </span>
        ))}
      </div>
      {thumbs.length > 0 && (
        <div className="flex gap-1.5">
          {thumbs.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={t} src={t} alt="" className="aspect-[9/16] w-12 rounded-md object-cover" />
          ))}
        </div>
      )}
      {b.status === 'planning' ? (
        <JobLine job={b.job} label="Planning" />
      ) : b.status === 'failed' && b.error ? (
        <p className="line-clamp-2 text-xs text-destructive">{b.error}</p>
      ) : (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              {done}/{b.variants.length || b.count} rendered
            </span>
            {b.costEstimateUsd != null && <span>≈ {formatUsd(b.costEstimateUsd)}</span>}
          </div>
          <Progress value={(done / Math.max(1, b.variants.length || b.count)) * 100} />
        </div>
      )}
      <div className="mt-auto text-[11px] text-muted-foreground">{timeAgo(b.createdAt)}</div>
    </Link>
  );
}
