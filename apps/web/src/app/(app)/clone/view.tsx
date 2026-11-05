'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Film, Radar } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { AssetSlot } from '@/components/app/asset-picker';
import { hostOf, JobLine, StatusPill } from '@/components/growth/shared';
import { useClones, useReadyProducts } from '@/components/growth/use-growth';
import { LlmPrice } from '@/components/scripts/llm-price';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView, BlueprintView, InspirationAdView } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';

export function CloneView() {
  const list = useClones();
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <CloneForm className="self-start xl:sticky xl:top-20" />
      <section className="min-w-0 space-y-4">
        <h2 className="font-semibold">Your clones</h2>
        {list.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : !list.data?.items.length ? (
          <EmptyState icon={<Copy />} title="No clones yet" description="Pick a video that performs (yours or a competitor's from Inspiration) and the product to sell. You get its structure and a new script on it." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.data.items.map((b) => (
              <BlueprintCard key={b.id} blueprint={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CloneForm({ className }: { className?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [source, setSource] = useState<'video' | 'saved'>(params.get('inspirationId') ? 'saved' : 'video');
  const [name, setName] = useState('');
  const [reference, setReference] = useState<AssetView | null>(null);
  const [inspirationId, setInspirationId] = useState(params.get('inspirationId') ?? 'none');
  const [productId, setProductId] = useState(params.get('productId') ?? 'none');
  const products = useReadyProducts();
  const saved = useQuery({
    queryKey: ['inspiration', 'clone-picker'],
    queryFn: () => api.get<{ items: InspirationAdView[] }>('/inspiration?limit=100&sort=longest').then((r) => r.items),
    staleTime: 30_000,
  });
  const create = useMutation({
    mutationFn: () =>
      api.post<BlueprintView>('/clones', {
        name: name.trim() || defaultName(),
        ...(source === 'video' && reference ? { referenceAssetId: reference.id } : {}),
        ...(source === 'saved' && inspirationId !== 'none' ? { inspirationAdId: inspirationId } : {}),
        ...(productId !== 'none' ? { productId } : {}),
      }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['clones'] });
      router.push(`/clone/${b.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pickedSaved = saved.data?.find((s) => s.id === inspirationId);
  const pickedProduct = products.data?.find((p) => p.id === productId);
  function defaultName() {
    const from = source === 'saved' ? pickedSaved?.brand : reference?.name;
    return [from, pickedProduct?.title].filter(Boolean).join(' → ').slice(0, 200) || 'Ad clone';
  }
  const ready = source === 'video' ? !!reference : inspirationId !== 'none';

  return (
    <div className={cn('space-y-4 rounded-2xl border bg-card p-5', className)}>
      <h2 className="font-semibold">New clone</h2>
      <Field label="Winning ad">
        <Segmented size="sm" value={source} onChange={setSource} options={[{ value: 'video', label: 'From library' }, { value: 'saved', label: 'From Inspiration' }]} />
      </Field>
      {source === 'video' ? (
        <AssetSlot label="Reference video" types={['video', 'image']} value={reference} onChange={setReference} required hint="Upload or pick the ad. A video gives the most accurate beat map." />
      ) : saved.data && !saved.data.length ? (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          Nothing saved yet.{' '}
          <Link href="/inspiration" className="text-primary hover:underline">
            Save ads in Inspiration
          </Link>{' '}
          first.
        </p>
      ) : (
        <Field label="Saved ad" hint={pickedSaved?.daysRunning != null ? `Running ${pickedSaved.daysRunning} days` : 'Long-running ads usually make money.'}>
          <Select
            value={inspirationId}
            onValueChange={setInspirationId}
            options={[{ value: 'none', label: 'Pick a saved ad', disabled: true }, ...(saved.data ?? []).map((s) => ({ value: s.id, label: `${s.brand}${s.headline ? ` · ${s.headline.slice(0, 50)}` : ''}`, hint: [s.platform, s.daysRunning != null ? `${s.daysRunning}d` : null].filter(Boolean).join(' · ') }))]}
          />
        </Field>
      )}
      <Field label="Your product" hint={products.data && !products.data.length ? 'Import a product page in URL to Video to sell it here.' : 'Optional. Without one you get the beat map only.'}>
        <Select value={productId} onValueChange={setProductId} options={[{ value: 'none', label: 'Beat map only' }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.title ?? hostOf(p.sourceUrl), hint: p.brandName ?? hostOf(p.sourceUrl) }))]} />
      </Field>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder={defaultName()} />
      </Field>
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button variant="brand" loading={create.isPending} disabled={!ready} onClick={() => create.mutate()}>
          <Copy className="size-4" /> {productId !== 'none' ? 'Clone for my product' : 'Map the structure'}
        </Button>
        <LlmPrice task="analyzeAdStructure" also={productId !== 'none' ? 'writeScript' : null} />
      </div>
    </div>
  );
}

function BlueprintCard({ blueprint: b }: { blueprint: BlueprintView }) {
  const thumb = b.reference?.thumbnailUrl ?? b.inspiration?.thumbnailUrl ?? null;
  const beats = b.structure?.beats.length ?? 0;
  return (
    <Link href={`/clone/${b.id}`} className="group flex gap-4 rounded-xl border bg-card p-3 transition hover:border-primary/50 hover:shadow-lg">
      <div className="relative aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-muted-foreground">{b.inspiration ? <Radar className="size-5" /> : <Film className="size-5" />}</div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 truncate font-medium group-hover:text-primary">{b.name}</div>
          <StatusPill status={b.status} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {b.inspiration && <span>From {b.inspiration.brand}</span>}
          {b.product && <span>For {b.product.title ?? 'product'}</span>}
          {beats > 0 && <span>{beats} beats</span>}
          {b.structure && <span className="capitalize">{b.structure.format.replace(/_/g, ' ')}</span>}
        </div>
        {b.status === 'failed' ? <p className="line-clamp-2 text-xs text-destructive">{b.error ?? 'The analysis failed.'}</p> : <JobLine job={b.job} label={b.status === 'analyzing' ? 'Mapping the beats' : 'Writing your version'} />}
        {b.structure?.summary && b.status === 'ready' && <p className="line-clamp-2 text-xs text-muted-foreground">{b.structure.summary}</p>}
        <div className="mt-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {b.scriptId && <span className="text-primary">Script ready</span>}
          <span className="ml-auto">{timeAgo(b.updatedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
