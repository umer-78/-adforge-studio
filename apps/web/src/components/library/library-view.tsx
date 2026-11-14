'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Download, FolderInput, LayoutGrid, List, Search, Share2, Sparkles, Star, Tag, Trash2, Upload, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatBytes, formatDuration } from '@adforge/core';
import { AssetCard, AssetThumb, AssetTypeIcon } from '@/components/app/asset-card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tip } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import type { AssetView, DownloadLink, Page } from '@/lib/types';
import { startUploads } from '@/lib/upload';
import { cn, qs, timeAgo } from '@/lib/utils';
import { saveAsZip } from '@/lib/zip-download';
import { LibrarySidebar, type LibraryFilter } from './library-sidebar';
import { MoveDialog, TagDialog, useBulk } from './organize-dialogs';
import { ShareDialog } from './share-dialog';
import { useProjects } from './use-library';
import { useOnChange } from '@/lib/hooks/use-on-change';

type TypeFilter = 'all' | 'video' | 'image' | 'audio' | 'model3d';

/** The media library: smart filters, projects, folders, search by meaning, bulk actions. */
export function LibraryView({ trash = false }: { trash?: boolean }) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const me = useMe();
  const filter: LibraryFilter = { projectId: sp.get('project') ?? undefined, folderId: sp.get('folder') ?? undefined, favorite: sp.get('favorite') === '1' || undefined, source: sp.get('source') ?? undefined };
  const type = (sp.get('type') as TypeFilter | null) ?? 'all';
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [semantic, setSemantic] = useState(sp.get('ai') === '1');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'move' | 'tag' | 'share' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const projects = useProjects();

  const setParams = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
    router.replace(`${pathname}${p.toString() ? `?${p}` : ''}`, { scroll: false });
  };
  useEffect(() => {
    const t = setTimeout(() => setParams({ q: q.trim() || undefined, ai: semantic && q.trim() ? '1' : undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, semantic]);

  const query = { q: sp.get('q') ?? undefined, semantic: sp.get('ai') === '1' || undefined, type: type === 'all' ? undefined : type, projectId: filter.projectId, folderId: filter.folderId, favorite: filter.favorite, source: filter.source, trash: trash || undefined };
  const list = useInfiniteQuery({
    queryKey: ['assets', 'library', query],
    queryFn: ({ pageParam }) => api.get<Page<AssetView>>(`/assets${qs({ ...query, limit: 60, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (qq) => (qq.state.data?.pages.some((p) => p.items.some((a) => a.status === 'processing' || a.status === 'uploading')) ? 5000 : false),
  });
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  useOnChange([sp], () => { setSelected(new Set()); });

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list]);

  // Files dropped here land in the open project/folder.
  useEffect(() => {
    if (trash) return;
    document.body.dataset.dropzone = 'local';
    return () => {
      delete document.body.dataset.dropzone;
    };
  }, [trash]);
  const upload = (files: File[]) => files.length && void startUploads(files, { projectId: filter.projectId ?? null, folderId: filter.folderId ?? null, queryClient: qc });

  const ids = [...selected];
  const clear = () => setSelected(new Set());
  const bulk = useBulk(clear);
  const empty = useMutation({
    mutationFn: () => api.delete('/assets/trash'),
    onSuccess: () => toast.success('Emptying the trash. Files disappear as they are deleted.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const toggle = (id: string, v: boolean) => setSelected((s) => {
    const n = new Set(s);
    if (v) n.add(id);
    else n.delete(id);
    return n;
  });
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const downloadOne = (id: string) => {
    const a = document.createElement('a');
    a.href = `/api/assets/${id}/download`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const downloadSelected = async () => {
    if (ids.length === 1) return downloadOne(ids[0]!);
    setZipProgress(0);
    try {
      const { files } = await api.post<{ files: DownloadLink[] }>('/assets/download-links', { ids });
      await saveAsZip(files, `AdForge ${new Date().toISOString().slice(0, 10)} (${files.length} files)`, setZipProgress);
      toast.success(`Saved ${files.length} files as a ZIP`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setZipProgress(null);
    }
  };
  const projectName = projects.data?.find((p) => p.id === filter.projectId)?.name;

  const sidebar = <LibrarySidebar value={filter} onChange={(f) => setParams({ project: f.projectId, folder: f.folderId, favorite: f.favorite ? '1' : undefined, source: f.source })} />;

  return (
    <div
      className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"
      onDragOver={(e) => !trash && e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (trash || !e.dataTransfer.files.length) return;
        e.preventDefault();
        upload([...e.dataTransfer.files]);
      }}
    >
      {!trash && <aside className="hidden lg:block">{sidebar}</aside>}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {!trash && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  {projectName ?? 'Browse'}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-4">
                <SheetHeader>
                  <SheetTitle>Library</SheetTitle>
                </SheetHeader>
                <div className="mt-4">{sidebar}</div>
              </SheetContent>
            </Sheet>
          )}
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={semantic ? 'Describe it: “red car at night”, “person unboxing”…' : 'Search names, tags and transcripts'} className="pr-24 pl-9" />
            {me.data?.features.embeddings && (
              <Tip content="Search by meaning with AI">
                <button type="button" onClick={() => setSemantic((v) => !v)} className={cn('absolute top-1/2 right-1.5 flex h-6 -translate-y-1/2 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition', semantic ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
                  <Sparkles className="size-3" /> AI
                </button>
              </Tip>
            )}
          </div>
          <Segmented
            size="sm"
            value={type}
            onChange={(v) => setParams({ type: v === 'all' ? undefined : v })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'video', label: 'Video' },
              { value: 'image', label: 'Image' },
              { value: 'audio', label: 'Audio' },
              { value: 'model3d', label: '3D' },
            ]}
          />
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'grid', label: <LayoutGrid />, title: 'Grid' }, { value: 'list', label: <List />, title: 'List' }]} />
          {trash ? (
            <Confirm title="Empty the trash?" description="Every file in the trash is deleted for good. This cannot be undone." confirmLabel="Empty trash" destructive onConfirm={() => empty.mutate()}>
              <Button variant="destructive" size="sm" disabled={!items.length}>
                <Trash2 className="size-4" /> Empty trash
              </Button>
            </Confirm>
          ) : (
            <>
              <Button variant="brand" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> Upload
              </Button>
              <input ref={fileRef} type="file" multiple hidden accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/x-wav,.glb,.gltf" onChange={(e) => (upload([...(e.target.files ?? [])]), (e.target.value = ''))} />
            </>
          )}
        </div>
        {filter.projectId && !trash && (
          <div className="flex items-center justify-between rounded-xl border bg-surface-2 px-3 py-2 text-sm">
            <span>
              Project: <span className="font-medium">{projectName}</span>
            </span>
            <Button size="xs" variant="ghost" onClick={() => setDialog('share')}>
              <Share2 className="size-3.5" /> Share project
            </Button>
          </div>
        )}

        {list.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="aspect-video rounded-xl" />
            ))}
          </div>
        ) : list.error ? (
          <EmptyState title="Could not load the library" description={errorMessage(list.error)} action={<Button onClick={() => void list.refetch()}>Retry</Button>} />
        ) : !items.length ? (
          trash ? (
            <EmptyState icon={<Trash2 />} title="Trash is empty" description="Deleted files wait here before they are removed for good." />
          ) : sp.get('q') ? (
            <EmptyState icon={<Search />} title="No matches" description={semantic ? 'Try describing it differently.' : 'Try another word, or turn on AI search to search by meaning.'} />
          ) : (
            <EmptyState icon={<Upload />} title="Drop files here" description="Videos, photos, audio and 3D models up to 5 GB. Uploads resume if your connection drops." action={<Button variant="brand" onClick={() => fileRef.current?.click()}>Choose files</Button>} />
          )
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((a) => (
              <AssetCard key={a.id} asset={a} selected={selected.has(a.id)} onSelect={(v) => toggle(a.id, v)} onOpen={() => (selected.size ? toggle(a.id, !selected.has(a.id)) : router.push(`/library/${a.id}`))} footer={<div className="text-[11px] text-muted-foreground">{trash && a.deletedAt ? `Deleted ${timeAgo(a.deletedAt)}` : timeAgo(a.createdAt)}</div>} />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            {items.map((a) => (
              <div key={a.id} className={cn('flex items-center gap-3 border-b px-3 py-2 last:border-0 hover:bg-accent/50', selected.has(a.id) && 'bg-primary/5')}>
                <Checkbox checked={selected.has(a.id)} onCheckedChange={(v) => toggle(a.id, !!v)} aria-label="Select" />
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => router.push(`/library/${a.id}`)}>
                  <AssetThumb asset={a} className="h-10 w-16 shrink-0 rounded-md" hoverPlay={false} />
                  <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                </button>
                <AssetTypeIcon type={a.type} className="hidden text-muted-foreground sm:block" />
                <span className="hidden w-16 text-right text-xs text-muted-foreground tabular-nums sm:block">{a.durationS != null ? formatDuration(a.durationS) : ''}</span>
                <span className="hidden w-20 text-right text-xs text-muted-foreground tabular-nums md:block">{formatBytes(a.sizeBytes)}</span>
                <span className="hidden w-24 text-right text-xs text-muted-foreground md:block">{timeAgo(a.createdAt)}</span>
                {a.isFavorite && <Star className="size-3.5 fill-warning text-warning" />}
              </div>
            ))}
          </div>
        )}
        <div ref={sentinel} />
        {list.isFetchingNextPage && <Skeleton className="h-24 rounded-xl" />}
      </div>

      {selected.size > 0 && (
        <div className="glass fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-2xl border p-1.5 pl-4 shadow-2xl animate-in slide-in-from-bottom-4">
          <span className="mr-2 text-sm font-medium tabular-nums">{selected.size} selected</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(items.map((a) => a.id)))}>
            Select all
          </Button>
          {trash ? (
            <>
              <Button size="sm" variant="ghost" loading={bulk.isPending} onClick={() => bulk.mutate({ ids, action: 'restore' })}>
                <ArchiveRestore className="size-4" /> Restore
              </Button>
              <Confirm title={`Delete ${ids.length} files forever?`} description="They are removed from storage and cannot be recovered." confirmLabel="Delete forever" destructive onConfirm={() => bulk.mutate({ ids, action: 'delete' })}>
                <Button size="sm" variant="ghost" className="text-destructive">
                  <Trash2 className="size-4" /> Delete forever
                </Button>
              </Confirm>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => bulk.mutate({ ids, action: 'favorite' })}>
                <Star className="size-4" /> Favorite
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog('tag')}>
                <Tag className="size-4" /> Tag
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog('move')}>
                <FolderInput className="size-4" /> Move
              </Button>
              <Button size="sm" variant="ghost" loading={zipProgress !== null} onClick={() => void downloadSelected()}>
                <Download className="size-4" /> {zipProgress !== null ? `${Math.round(zipProgress * 100)}%` : ids.length > 1 ? 'Download ZIP' : 'Download'}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" loading={bulk.isPending && bulk.variables?.action === 'trash'} onClick={() => bulk.mutate({ ids, action: 'trash' }, { onSuccess: () => toast.success(`Moved ${ids.length} to trash`) })}>
                <Trash2 className="size-4" /> Trash
              </Button>
            </>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={clear}>
            <X className="size-4" />
          </Button>
        </div>
      )}
      <MoveDialog ids={ids} open={dialog === 'move'} onOpenChange={(v) => setDialog(v ? 'move' : null)} onDone={clear} />
      <TagDialog ids={ids} open={dialog === 'tag'} onOpenChange={(v) => setDialog(v ? 'tag' : null)} onDone={clear} />
      {filter.projectId && <ShareDialog open={dialog === 'share'} onOpenChange={(v) => setDialog(v ? 'share' : null)} projectId={filter.projectId} name={projectName ?? 'Project'} />}
    </div>
  );
}
