'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FolderOpen, Gift, Search, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AssetType, StockKind } from '@adforge/core';
import { StockBrowser } from '@/components/stock/stock-browser';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { api } from '@/lib/api-client';
import type { AssetView, Page } from '@/lib/types';
import { startUploads } from '@/lib/upload';
import { cn, qs } from '@/lib/utils';
import { AssetThumb } from './asset-card';

const ACCEPT: Record<AssetType, string> = { video: 'video/*', image: 'image/*', audio: 'audio/*', model3d: '.glb,.gltf' };
const STOCK_FOR: Record<AssetType, StockKind[]> = { image: ['photo'], video: ['video'], audio: ['music', 'sound'], model3d: [] };

/** Pick one or more files from the library, or upload new ones in place. */
export function AssetPicker({
  open,
  onOpenChange,
  types,
  multiple,
  max = 1,
  title,
  description,
  onPick,
  initial = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  types: AssetType[];
  multiple?: boolean;
  max?: number;
  title?: string;
  description?: ReactNode;
  onPick: (assets: AssetView[]) => void;
  initial?: AssetView[];
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<AssetView[]>(initial);
  const [source, setSource] = useState<'library' | 'free'>('library');
  const fileRef = useRef<HTMLInputElement>(null);
  const stockKinds = types.flatMap((t) => STOCK_FOR[t]);
  // Start fresh each time the picker opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelected(initial);
      setSource('library');
    }
  }
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const type = types.length === 1 ? types[0] : undefined;
  const list = useInfiniteQuery({
    queryKey: ['assets', 'picker', types.join(','), debounced],
    queryFn: ({ pageParam }) => api.get<Page<AssetView>>(`/assets${qs({ q: debounced, type, limit: 48, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open,
  });
  const items = (list.data?.pages.flatMap((p) => p.items) ?? []).filter((a) => types.includes(a.type));
  const toggle = (a: AssetView) => {
    if (a.status !== 'ready') return;
    if (!multiple) {
      onPick([a]);
      onOpenChange(false);
      return;
    }
    setSelected((s) => (s.some((x) => x.id === a.id) ? s.filter((x) => x.id !== a.id) : s.length >= max ? s : [...s, a]));
  };
  /** A free file arrives imported and ready: use it straight away, or add it to the selection. */
  const pickFree = (a: AssetView) => {
    if (!multiple) {
      onPick([a]);
      onOpenChange(false);
      return;
    }
    setSelected((s) => (s.some((x) => x.id === a.id) || s.length >= max ? s : [...s, a]));
    setSource('library');
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{title ?? `Choose ${types.length === 1 ? (types[0] === 'model3d' ? 'a 3D model' : `${types[0] === 'image' ? 'an' : 'a'} ${types[0]}`) : 'files'}`}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {stockKinds.length > 0 && (
          <Segmented
            className="self-start"
            value={source}
            onChange={setSource}
            options={[
              { value: 'library', label: (<><FolderOpen /> Your files</>) },
              { value: 'free', label: (<><Gift /> Free media</>) },
            ]}
          />
        )}
        {source === 'free' ? (
          <div className="-mx-1 min-h-64 overflow-y-auto px-1 scrollbar-thin">
            <StockBrowser kinds={stockKinds} onPicked={pickFree} pickLabel={multiple ? 'Add' : 'Use'} />
          </div>
        ) : (
          <>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, tag or what's in it" className="pl-9" />
          </div>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload /> Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple={multiple}
            accept={types.map((t) => ACCEPT[t]).join(',')}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void startUploads(files, { queryClient: qc });
            }}
          />
        </div>
        <div className="-mx-1 min-h-64 overflow-y-auto px-1 scrollbar-thin">
          {list.isLoading ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="Nothing here yet" description="Upload a file or generate one, then pick it here." />
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {items.map((a) => {
                const on = selected.some((s) => s.id === a.id);
                return (
                  <button key={a.id} type="button" onClick={() => toggle(a)} disabled={a.status !== 'ready'} className={cn('group relative overflow-hidden rounded-xl border text-left transition', on ? 'border-primary ring-2 ring-primary/40' : 'hover:border-input', a.status !== 'ready' && 'cursor-wait opacity-70')}>
                    <AssetThumb asset={a} className="aspect-square" />
                    <div className="truncate px-2 py-1.5 text-xs">{a.name}</div>
                    {on && (
                      <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-white shadow">
                        <Check className="size-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {list.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="ghost" size="sm" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </div>
          </>
        )}
        {multiple && (
          <DialogFooter>
            <div className="mr-auto self-center text-xs text-muted-foreground">
              {selected.length} of up to {max} selected
            </div>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onPick(selected);
                onOpenChange(false);
              }}
            >
              Use {selected.length || ''} selected
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A single input slot (start image, input video…) showing the chosen file. */
export function AssetSlot({ label, types, value, onChange, required, hint }: { label: string; types: AssetType[]; value: AssetView | null; onChange: (a: AssetView | null) => void; required?: boolean; hint?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[13px] font-medium">
        <span>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
        {value && (
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      <button type="button" onClick={() => setOpen(true)} className={cn('group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-dashed p-2 text-left transition hover:border-primary/60 hover:bg-primary/5', value && 'border-solid')}>
        {value ? (
          <>
            <AssetThumb asset={value} className="size-14 shrink-0 rounded-lg" hoverPlay={false} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{value.name}</div>
              <div className="text-xs text-muted-foreground">{value.status === 'ready' ? 'Click to change' : 'Processing…'}</div>
            </div>
          </>
        ) : (
          <div className="flex h-14 w-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Upload className="size-4" /> Choose or upload
          </div>
        )}
      </button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <AssetPicker open={open} onOpenChange={setOpen} types={types} onPick={(a) => onChange(a[0] ?? null)} />
    </div>
  );
}
