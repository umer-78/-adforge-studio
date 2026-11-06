'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Check, ExternalLink, ImageOff, Pause, Play, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatDuration, STOCK_KIND_LABELS, STOCK_LICENSES, stockLicenseTerms, type StockItem, type StockKind, type StockProvider, type StockSearchResult } from '@adforge/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView } from '@/lib/types';
import { waitUntilReady } from '@/lib/upload';
import { cn, qs } from '@/lib/utils';

interface ProviderView {
  id: StockProvider;
  label: string;
  url: string;
  kinds: StockKind[];
  enabled: boolean;
}
type StockResponse = StockSearchResult & { provider: StockProvider | null; providers: ProviderView[] };
type Orientation = 'any' | 'portrait' | 'landscape' | 'square';

const SUGGESTIONS: Record<StockKind, string[]> = {
  photo: ['coffee', 'skincare', 'city at night', 'workout', 'summer beach', 'laptop desk'],
  video: ['slow motion pour', 'aerial city', 'happy customer', 'cooking', 'ocean waves', 'unboxing'],
  music: ['upbeat', 'corporate', 'lofi', 'cinematic', 'acoustic', 'electronic'],
  sound: ['whoosh', 'click', 'pop', 'applause', 'notification', 'camera shutter'],
};

const keyOf = (i: Pick<StockItem, 'provider' | 'id'>) => `${i.provider}:${i.id}`;

/**
 * Search free libraries and bring files into the Library with their license recorded. In pick mode
 * the chosen file is imported, processed and handed back, ready to use.
 */
export function StockBrowser({
  kinds = ['photo', 'video', 'music', 'sound'],
  initialKind,
  onPicked,
  pickLabel = 'Use',
  compact,
}: {
  kinds?: StockKind[];
  initialKind?: StockKind;
  /** Pick mode: called with the imported file once it is ready. */
  onPicked?: (asset: AssetView) => void;
  pickLabel?: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<StockKind>(initialKind && kinds.includes(initialKind) ? initialKind : kinds[0]!);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState<StockProvider | null>(null);
  const [orientation, setOrientation] = useState<Orientation>('any');
  const [credit, setCredit] = useState(false);
  const [imported, setImported] = useState<Record<string, AssetView>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 500);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => () => audio.current?.pause(), []);

  const visual = kind === 'photo' || kind === 'video';
  const search = useInfiniteQuery({
    queryKey: ['stock', kind, q, provider, visual ? orientation : 'any', credit],
    queryFn: ({ pageParam }) => api.get<StockResponse>(`/stock${qs({ kind, q, provider: provider ?? undefined, page: pageParam, orientation: visual && orientation !== 'any' ? orientation : undefined, credit: credit || undefined })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore && last.page < 20 ? last.page + 1 : undefined),
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const first = search.data?.pages[0];
  const items = dedupe(search.data?.pages.flatMap((p) => p.items) ?? []);
  const providers = (first?.providers ?? []).filter((p) => p.kinds.includes(kind));
  const enabled = providers.filter((p) => p.enabled);
  const active = first?.provider ?? null;
  const openverse = active === 'openverse';

  const importOne = useMutation({
    mutationFn: async (item: StockItem) => {
      const res = await api.post<{ asset: AssetView; existing: boolean }>('/stock', { provider: item.provider, kind: item.kind, id: item.id });
      return { ...res, ready: onPicked ? await waitUntilReady(res.asset, 5 * 60_000) : res.asset };
    },
    onMutate: (item) => setBusy((b) => ({ ...b, [keyOf(item)]: true })),
    onSettled: (_d, _e, item) => setBusy((b) => ({ ...b, [keyOf(item)]: false })),
    onSuccess: ({ ready, existing }, item) => {
      setImported((m) => ({ ...m, [keyOf(item)]: ready }));
      void qc.invalidateQueries({ queryKey: ['assets'] });
      if (item.kind === 'music') void qc.invalidateQueries({ queryKey: ['music'] });
      if (item.kind === 'sound') void qc.invalidateQueries({ queryKey: ['sfx'] });
      if (onPicked) onPicked(ready);
      else toast.success(existing ? 'Already in your library' : 'Added to your library', { description: item.credit ? 'This license asks for a credit. It is saved with the file.' : undefined });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const togglePlay = (item: StockItem) => {
    const key = keyOf(item);
    if (playing === key) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    if (!item.previewUrl) return;
    audio.current?.pause();
    const el = new Audio(item.previewUrl);
    el.onended = () => setPlaying((p) => (p === key ? null : p));
    el.onerror = () => {
      setPlaying((p) => (p === key ? null : p));
      toast.error('This preview could not be played.');
    };
    audio.current = el;
    void el.play().catch(() => undefined);
    setPlaying(key);
  };

  const action = (item: StockItem) => {
    const key = keyOf(item);
    const done = imported[key];
    if (done && !onPicked)
      return (
        <Button asChild size="xs" variant="secondary">
          <Link href={`/library/${done.id}`}>
            <Check className="size-3.5" /> In library
          </Link>
        </Button>
      );
    return (
      <Button size="xs" variant={onPicked ? 'brand' : 'outline'} loading={!!busy[key]} disabled={!!busy[key]} onClick={() => importOne.mutate(item)}>
        {!busy[key] && <Plus className="size-3.5" />} {onPicked ? pickLabel : 'Import'}
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      <div className={cn('flex flex-wrap items-center gap-2', compact && 'flex-col items-stretch')}>
        {kinds.length > 1 && (
          <Segmented
            size={compact ? 'sm' : 'default'}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setProvider(null);
              audio.current?.pause();
              setPlaying(null);
            }}
            options={kinds.map((k) => ({ value: k, label: STOCK_KIND_LABELS[k] }))}
          />
        )}
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setQ(text.trim())} placeholder={`Search free ${STOCK_KIND_LABELS[kind].toLowerCase()}`} className="pl-9" aria-label="Search free media" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {visual && (
          <Segmented
            size="sm"
            value={orientation}
            onChange={setOrientation}
            options={[
              { value: 'any', label: 'Any shape' },
              { value: 'portrait', label: 'Vertical' },
              { value: 'landscape', label: 'Horizontal' },
              { value: 'square', label: 'Square' },
            ]}
          />
        )}
        {enabled.length > 1 && (
          <Select className="h-7 w-36 text-xs" value={active ?? enabled[0]!.id} onValueChange={(v) => setProvider(v as StockProvider)} options={enabled.map((p) => ({ value: p.id, label: p.label }))} />
        )}
        {(openverse || (!active && kind !== 'video')) && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={credit} onCheckedChange={setCredit} />
            Include files that need a credit (CC BY)
          </label>
        )}
      </div>

      {q.length < 2 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Try one of these:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS[kind].map((s) => (
              <Button key={s} size="xs" variant="secondary" onClick={() => (setText(s), setQ(s))}>
                {s}
              </Button>
            ))}
          </div>
        </div>
      ) : search.isPending ? (
        <Grid compact={compact} visual={visual}>
          {Array.from({ length: visual ? 8 : 5 }, (_, i) => (
            <Skeleton key={i} className={visual ? 'aspect-[4/5] rounded-xl' : 'h-14 rounded-xl'} />
          ))}
        </Grid>
      ) : search.isError ? (
        <Notice tone="error" title="The search did not work" action={<Button size="xs" variant="outline" onClick={() => void search.refetch()}>Try again</Button>}>
          {errorMessage(search.error)}
        </Notice>
      ) : !active ? (
        <Notice tone="info" title={`${STOCK_KIND_LABELS[kind]} need a free key`}>
          Stock videos come from Pexels or Pixabay, which give free API keys. Add <code className="font-mono text-xs">PEXELS_API_KEY</code> or <code className="font-mono text-xs">PIXABAY_API_KEY</code> to the website&apos;s environment settings, then search again.
        </Notice>
      ) : items.length === 0 ? (
        <EmptyState icon={<ImageOff />} title="Nothing found" description={openverse && !credit ? 'Try other words, or include files that need a credit.' : 'Try other words.'} />
      ) : (
        <>
          <Grid compact={compact} visual={visual}>
            {items.map((item) => (visual ? <VisualTile key={keyOf(item)} item={item} action={action(item)} /> : <AudioTile key={keyOf(item)} compact={compact} item={item} playing={playing === keyOf(item)} onToggle={() => togglePlay(item)} action={action(item)} />))}
          </Grid>
          {search.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" loading={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      {active && (
        <p className="text-xs text-muted-foreground">
          {kind === 'video' || kind === 'photo' ? `${STOCK_KIND_LABELS[kind]} from ` : 'Search by '}
          <a href={providers.find((p) => p.id === active)?.url} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">
            {providers.find((p) => p.id === active)?.label}
          </a>
          . Every result allows commercial use. Files that need a credit keep it with them, and Publish reminds you to add it.
        </p>
      )}
    </div>
  );
}

function dedupe(items: StockItem[]): StockItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(keyOf(i)) ? false : (seen.add(keyOf(i)), true)));
}

function Grid({ compact, visual, children }: { compact?: boolean; visual: boolean; children: ReactNode }) {
  return <div className={cn(visual ? (compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5') : 'grid gap-2')}>{children}</div>;
}

function LicenseBadge({ item }: { item: StockItem }) {
  const lic = STOCK_LICENSES[item.license];
  return (
    <Tip content={stockLicenseTerms(item.license)}>
      <Badge variant={lic.credit ? 'warning' : 'success'} className="cursor-default">
        {lic.credit ? `${lic.label} · credit` : lic.label}
      </Badge>
    </Tip>
  );
}

function VisualTile({ item, action }: { item: StockItem; action: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="group overflow-hidden rounded-xl border bg-card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="relative aspect-[4/5] bg-surface-2">
        {item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" />
          </div>
        )}
        {item.kind === 'video' && hover && item.previewUrl && <video src={item.previewUrl} muted loop autoPlay playsInline className="absolute inset-0 size-full object-cover" />}
        {item.durationS != null && <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">{formatDuration(item.durationS)}</span>}
        <div className="absolute top-2 left-2">
          <LicenseBadge item={item} />
        </div>
      </div>
      <div className="space-y-2 p-2.5">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium" title={item.title}>
            {item.title}
          </div>
          <a href={item.pageUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground">
            {item.creator ?? 'Unknown creator'}
            {item.source ? ` · ${item.source}` : ''} <ExternalLink className="size-3 shrink-0" />
          </a>
        </div>
        {action}
      </div>
    </div>
  );
}

function AudioTile({ item, playing, onToggle, action, compact }: { item: StockItem; playing: boolean; onToggle: () => void; action: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-2.5', !compact && 'sm:flex-nowrap')}>
      <Button size="icon-sm" variant="secondary" onClick={onToggle} disabled={!item.previewUrl} aria-label={playing ? 'Pause preview' : 'Play preview'}>
        {playing ? <Pause /> : <Play />}
      </Button>
      <div className={cn('min-w-0 flex-1 basis-[calc(100%-3.25rem)]', !compact && 'sm:basis-0')}>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={item.title}>
            {item.title}
          </span>
          {playing && <AudioLines className="size-3.5 shrink-0 animate-pulse text-primary" aria-label="Playing" />}
        </div>
        <a href={item.pageUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground">
          {item.creator ?? 'Unknown creator'}
          {item.source ? ` · ${item.source}` : ''}
          {item.durationS != null ? ` · ${formatDuration(item.durationS)}` : ''} <ExternalLink className="size-3 shrink-0" />
        </a>
      </div>
      <div className={cn('flex w-full items-center justify-between gap-2 pl-11', !compact && 'sm:w-auto sm:pl-0')}>
        <LicenseBadge item={item} />
        {action}
      </div>
    </div>
  );
}
