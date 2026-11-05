'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Radar, Search, Star } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AssetSlot } from '@/components/app/asset-picker';
import { PlatformIcon, PLATFORM_META } from '@/components/app/platform-icon';
import { InspirationSheet } from '@/components/growth/inspiration-sheet';
import { ChipList } from '@/components/growth/shared';
import { useCompetitors, useInspiration, type InspirationFilters } from '@/components/growth/use-growth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import type { AssetView, InspirationAdView } from '@/lib/types';
import { cn, qs } from '@/lib/utils';
import { CompetitorsPanel } from './competitors';
import { LibrarySearch } from './library-search';

type Tab = 'saved' | 'library' | 'competitors';
const PLATFORMS = ['meta', 'tiktok', 'youtube', 'instagram', 'x', 'linkedin', 'pinterest', 'other'] as const;

export function InspirationView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = params.get('tab') === 'library' ? 'library' : params.get('tab') === 'competitors' ? 'competitors' : 'saved';
  const openId = params.get('ad');
  const setParams = (next: Record<string, string | undefined>) => {
    const merged = { tab: tab === 'saved' ? undefined : tab, ad: openId ?? undefined, competitorId: params.get('competitorId') ?? undefined, ...next };
    router.replace(`${pathname}${qs(merged)}`, { scroll: false });
  };
  return (
    <div className="space-y-5">
      <Segmented
        value={tab}
        onChange={(t) => setParams({ tab: t === 'saved' ? undefined : t, ad: undefined })}
        options={[
          { value: 'saved', label: 'Swipe file' },
          { value: 'library', label: 'Ad Library search' },
          { value: 'competitors', label: 'Competitors' },
        ]}
      />
      {tab === 'saved' && <SwipeFile competitorId={params.get('competitorId') ?? undefined} onCompetitor={(id) => setParams({ competitorId: id })} onOpen={(id) => setParams({ ad: id })} />}
      {tab === 'library' && <LibrarySearch onOpen={(id) => setParams({ ad: id })} />}
      {tab === 'competitors' && <CompetitorsPanel onShowAds={(id) => setParams({ tab: undefined, competitorId: id })} />}
      <InspirationSheet id={openId} onOpenChange={(o) => !o && setParams({ ad: undefined })} />
    </div>
  );
}

function SwipeFile({ competitorId, onCompetitor, onOpen }: { competitorId?: string; onCompetitor: (id: string | undefined) => void; onOpen: (id: string) => void }) {
  const competitors = useCompetitors();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const [platform, setPlatform] = useState('all');
  const [status, setStatus] = useState('all');
  const [favorites, setFavorites] = useState(false);
  const [sort, setSort] = useState<'recent' | 'longest'>('longest');
  const [pages, setPages] = useState(1);
  const [adding, setAdding] = useState(false);
  const filters: InspirationFilters = { q: dq || undefined, platform: platform === 'all' ? undefined : platform, status: status === 'all' ? undefined : status, competitorId, favorites, sort };
  const key = JSON.stringify(filters);
  useEffect(() => setPages(1), [key]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand, copy, notes" className="h-8 pl-9" />
        </div>
        <Select size="sm" className="w-36" value={platform} onValueChange={setPlatform} options={[{ value: 'all', label: 'All platforms' }, ...PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p]?.label ?? p }))]} />
        <Select size="sm" className="w-32" value={status} onValueChange={setStatus} options={[{ value: 'all', label: 'Any status' }, { value: 'active', label: 'Running' }, { value: 'inactive', label: 'Stopped' }]} />
        <Select size="sm" className="w-44" value={competitorId ?? 'all'} onValueChange={(v) => onCompetitor(v === 'all' ? undefined : v)} options={[{ value: 'all', label: 'All competitors' }, ...(competitors.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        <Button size="sm" variant={favorites ? 'secondary' : 'ghost'} aria-pressed={favorites} onClick={() => setFavorites((v) => !v)}>
          <Star className={cn('size-4', favorites && 'fill-amber-400 text-amber-400')} /> Favorites
        </Button>
        <Segmented size="sm" value={sort} onChange={setSort} options={[{ value: 'longest', label: 'Longest running' }, { value: 'recent', label: 'Newest' }]} />
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Save an ad
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {Array.from({ length: pages }, (_, i) => (
          <SwipePage key={`${key}-${i}`} filters={filters} offset={i * 48} isLast={i === pages - 1} onMore={() => setPages((p) => p + 1)} onOpen={onOpen} />
        ))}
      </div>
      <SaveAdDialog open={adding} onOpenChange={setAdding} onSaved={(ad) => onOpen(ad.id)} />
    </div>
  );
}

function SwipePage({ filters, offset, isLast, onMore, onOpen }: { filters: InspirationFilters; offset: number; isLast: boolean; onMore: () => void; onOpen: (id: string) => void }) {
  const list = useInspiration(filters, offset);
  if (list.isLoading) return <>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)}</>;
  if (list.isError) return <EmptyState className="col-span-full" title="Could not load your swipe file" description={errorMessage(list.error)} />;
  const items = list.data?.items ?? [];
  if (!items.length && offset === 0)
    return (
      <EmptyState
        className="col-span-full"
        icon={<Radar />}
        title="Nothing saved yet"
        description="Search the Ad Library, follow competitors, or save an ad you found by hand. Long-running ads float to the top."
      />
    );
  return (
    <>
      {items.map((ad, i) => (
        <SwipeCard key={ad.id} ad={ad} index={i} onOpen={() => onOpen(ad.id)} />
      ))}
      {isLast && list.data?.nextOffset != null && (
        <div className="col-span-full flex justify-center">
          <Button variant="outline" onClick={onMore}>
            Show more ({list.data.total - (offset + items.length)} left)
          </Button>
        </div>
      )}
    </>
  );
}

function SwipeCard({ ad, index, onOpen }: { ad: InspirationAdView; index: number; onOpen: () => void }) {
  const qc = useQueryClient();
  const fav = useMutation({
    mutationFn: () => api.patch<InspirationAdView>(`/inspiration/${ad.id}`, { isFavorite: !ad.isFavorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inspiration'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const thumb = ad.thumbnailUrl ?? ad.asset?.thumbnailUrl;
  const long = (ad.daysRunning ?? 0) >= 30;
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card transition duration-300 ease-out-expo animate-in fade-in slide-in-from-bottom-2 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl" style={{ animationDelay: `${Math.min(index, 15) * 30}ms`, animationFillMode: 'both' }}>
      <button type="button" onClick={onOpen} className="absolute inset-0 z-10" aria-label={`Open ${ad.brand} ad`} />
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-full object-cover transition duration-500 ease-out-expo group-hover:scale-[1.04]" />
        ) : (
          <div className="flex size-full flex-col justify-end gap-2 bg-gradient-to-br from-surface-3 to-muted p-4">
            {ad.headline && <div className="line-clamp-2 text-sm font-medium">{ad.headline}</div>}
            {ad.body && <p className="line-clamp-5 text-xs text-muted-foreground">{ad.body}</p>}
          </div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <PlatformIcon platform={ad.platform} className="size-5" />
          {ad.status === 'active' && <span className="rounded-full bg-success/90 px-1.5 py-0.5 text-[10px] font-medium text-white">Running</span>}
        </div>
        {ad.daysRunning != null && (
          <div className={cn('absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums shadow', long ? 'bg-brand text-white' : 'bg-black/60 text-white')}>{ad.daysRunning}d</div>
        )}
        <button
          type="button"
          aria-label={ad.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => fav.mutate()}
          className={cn('absolute top-2 right-2 z-20 rounded-full bg-black/50 p-1.5 text-white transition hover:bg-black/70', !ad.isFavorite && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
        >
          <Star className={cn('size-3.5', ad.isFavorite && 'fill-amber-400 text-amber-400')} />
        </button>
      </div>
      <div className="space-y-1 p-3">
        <div className="truncate text-sm font-medium">{ad.brand}</div>
        {ad.headline && thumb && <div className="line-clamp-1 text-xs text-muted-foreground">{ad.headline}</div>}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {ad.analysis && <Badge variant="secondary">Analyzed</Badge>}
          {ad.tags.slice(0, 2).map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

function SaveAdDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: (ad: InspirationAdView) => void }) {
  const qc = useQueryClient();
  const competitors = useCompetitors();
  const empty = { brand: '', platform: 'tiktok', sourceUrl: '', headline: '', body: '', cta: '', notes: '', competitorId: 'none' };
  const [f, setF] = useState(empty);
  const [asset, setAsset] = useState<AssetView | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setF(empty);
      setAsset(null);
      setTags([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = useMutation({
    mutationFn: () => {
      const url = f.sourceUrl.trim();
      if (url && !/^https?:\/\//i.test(url)) throw new Error('The source link must start with http:// or https://');
      return api.post<InspirationAdView>('/inspiration', {
        brand: f.brand.trim(),
        platform: f.platform,
        sourceUrl: url || null,
        assetId: asset?.id ?? null,
        headline: f.headline.trim() || null,
        body: f.body.trim() || null,
        cta: f.cta.trim() || null,
        tags,
        notes: f.notes.trim() || null,
        competitorId: f.competitorId === 'none' ? null : f.competitorId,
      });
    },
    onSuccess: (ad) => {
      qc.invalidateQueries({ queryKey: ['inspiration'] });
      onOpenChange(false);
      onSaved(ad);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof empty) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Save an ad</DialogTitle>
          <DialogDescription>Upload the video (screen recordings work) so it can be analyzed and cloned, or keep just the link and copy.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
          <AssetSlot label="Video or image" types={['video', 'image']} value={asset} onChange={setAsset} hint="Only save ads you may keep for reference." />
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Brand">
                <Input value={f.brand} onChange={(e) => set('brand')(e.target.value)} maxLength={200} placeholder="Brand name" />
              </Field>
              <Field label="Platform">
                <Select value={f.platform} onValueChange={set('platform')} options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p]?.label ?? p }))} />
              </Field>
            </div>
            <Field label="Link">
              <Input value={f.sourceUrl} onChange={(e) => set('sourceUrl')(e.target.value)} maxLength={2000} placeholder="https://www.tiktok.com/@brand/video/…" inputMode="url" />
            </Field>
            <Field label="Headline">
              <Input value={f.headline} onChange={(e) => set('headline')(e.target.value)} maxLength={500} />
            </Field>
            <Field label="Ad text">
              <Textarea rows={3} value={f.body} onChange={(e) => set('body')(e.target.value)} maxLength={5000} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Call to action">
                <Input value={f.cta} onChange={(e) => set('cta')(e.target.value)} maxLength={120} placeholder="Shop now" />
              </Field>
              <Field label="Competitor">
                <Select value={f.competitorId} onValueChange={set('competitorId')} options={[{ value: 'none', label: 'None' }, ...(competitors.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
              </Field>
            </div>
            <Field label="Tags">
              <ChipList items={tags} onChange={setTags} max={30} maxLength={60} placeholder="ugc, hook, unboxing…" />
            </Field>
            <Field label="Notes">
              <Textarea rows={2} value={f.notes} onChange={(e) => set('notes')(e.target.value)} maxLength={5000} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.brand.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
