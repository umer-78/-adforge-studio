'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Link2, RefreshCw, Search, ShoppingBag, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { hostOf, JobLine, money, StatusPill } from '@/components/growth/shared';
import { useProducts } from '@/components/growth/use-growth';
import { LlmPrice } from '@/components/scripts/llm-price';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import type { ProductView } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

type Filter = 'all' | 'ready' | 'importing' | 'failed';

export function ProductsView() {
  const router = useRouter();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const list = useProducts({ q: dq || undefined, status: filter === 'all' ? undefined : filter });

  const importUrl = useMutation({
    mutationFn: (u: string) => api.post<ProductView>('/products', { url: u }),
    onSuccess: (p) => {
      setUrl('');
      qc.invalidateQueries({ queryKey: ['products'] });
      router.push(`/products/${p.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const raw = url.trim();
    if (!raw) return;
    importUrl.mutate(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="relative overflow-hidden rounded-2xl border bg-card p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourstore.com/products/insulated-bottle" className="h-12 rounded-xl pl-10 text-[15px]" inputMode="url" autoComplete="url" aria-label="Product page link" />
          </div>
          <Button type="submit" variant="brand" size="lg" loading={importUrl.isPending} disabled={!url.trim()}>
            <Sparkles className="size-4" /> Read the page
          </Button>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Works with Shopify, WooCommerce and most store pages.</span>
          <LlmPrice task="extractProduct" />
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'ready', label: 'Ready' }, { value: 'importing', label: 'Reading' }, { value: 'failed', label: 'Failed' }]} />
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="h-8 pl-9" />
        </div>
      </div>

      {list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState icon={<CircleAlert />} title="Could not load products" description={errorMessage(list.error)} action={<Button variant="outline" onClick={() => list.refetch()}>Try again</Button>} />
      ) : !list.data?.items.length ? (
        <EmptyState
          icon={<ShoppingBag />}
          title={dq || filter !== 'all' ? 'No matching products' : 'No products yet'}
          description={dq || filter !== 'all' ? 'Try another search or filter.' : 'Paste a product link above. You get the facts, photos and selling angles in about a minute, ready to turn into ads.'}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.data.items.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product: p, index }: { product: ProductView; index: number }) {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.post<ProductView>(`/products/${p.id}/reimport`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const image = p.images[0] ?? p.logo;
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition duration-300 ease-out-expo animate-in fade-in slide-in-from-bottom-2 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl" style={{ animationDelay: `${Math.min(index, 12) * 40}ms`, animationFillMode: 'both' }}>
      <Link href={`/products/${p.id}`} className="absolute inset-0 z-10" aria-label={p.title ?? hostOf(p.sourceUrl)} />
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {image?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.thumbnailUrl} alt="" className="size-full object-cover transition duration-500 ease-out-expo group-hover:scale-[1.04]" />
        ) : p.status === 'importing' ? (
          <Skeleton className="size-full rounded-none" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ShoppingBag className="size-8" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <StatusPill status={p.status} label={p.status === 'importing' ? 'Reading' : undefined} />
        </div>
        {p.colors.length > 0 && (
          <div className="absolute right-2 bottom-2 flex -space-x-1">
            {p.colors.slice(0, 5).map((c) => (
              <span key={c} className="size-4 rounded-full border border-white/40 shadow" style={{ background: c }} />
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          <div className="truncate font-medium group-hover:text-primary">{p.title ?? (p.status === 'importing' ? 'Reading the page…' : hostOf(p.sourceUrl))}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{p.brandName ?? hostOf(p.sourceUrl)}</span>
            {p.price != null && <span className="ml-auto shrink-0 font-medium text-foreground tabular-nums">{money(p.price, p.currency)}</span>}
          </div>
        </div>
        {p.status === 'importing' && <JobLine job={p.job} label="Reading" />}
        {p.status === 'failed' && (
          <div className="relative z-20 space-y-2">
            <p className="line-clamp-2 text-xs text-destructive">{p.error ?? 'The page could not be read.'}</p>
            <Button size="xs" variant="outline" loading={retry.isPending} onClick={() => retry.mutate()}>
              <RefreshCw className="size-3" /> Try again
            </Button>
          </div>
        )}
        {p.status === 'ready' && p.copy.benefits.length > 0 && <p className="line-clamp-2 text-xs text-muted-foreground">{p.copy.benefits.slice(0, 3).join(' · ')}</p>}
        <div className="mt-auto text-[11px] text-muted-foreground">{timeAgo(p.createdAt)}</div>
      </div>
    </div>
  );
}
