'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Copy, Ellipsis, FileText, Files, LayoutTemplate, Pencil, Plus, Search, Square, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ASPECT_SIZES, formatDuration, type AspectRatio } from '@adforge/core';
import { AssetPicker } from '@/components/app/asset-picker';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api-client';
import { useDebounced } from '@/lib/hooks/use-debounced';
import type { Page, TemplateView, TimelineSummaryView } from '@/lib/types';
import { cn, qs, timeAgo } from '@/lib/utils';
import { TemplateGallery } from './template-gallery';
import { useOnChange } from '@/lib/hooks/use-on-change';

const ASPECTS = Object.keys(ASPECT_SIZES) as AspectRatio[];

export function AspectPicker({ value, onChange }: { value: AspectRatio; onChange: (v: AspectRatio) => void }) {
  return <Segmented size="sm" value={value} onChange={onChange} options={ASPECTS.map((a) => ({ value: a, label: a, title: ASPECT_SIZES[a].label }))} />;
}

/** Creates an edit and opens it. */
export function useCreateEdit() {
  const router = useRouter();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ id: string }>('/timelines', body),
    onSuccess: ({ id }) => router.push(`/editor/${id}`),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function EditsView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 250);
  const [creating, setCreating] = useState(sp.get('new') === '1');
  const [renaming, setRenaming] = useState<TimelineSummaryView | null>(null);

  useOnChange([sp], () => {
    if (sp.get('new') === '1') setCreating(true);
  });

  const list = useInfiniteQuery({
    queryKey: ['timelines', query],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.get<Page<TimelineSummaryView>>(`/timelines${qs({ q: query, cursor: pageParam, limit: 40 })}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const refresh = () => void qc.invalidateQueries({ queryKey: ['timelines'] });

  const duplicate = useMutation({
    mutationFn: (t: TimelineSummaryView) => api.post<{ id: string }>(`/timelines/${t.id}/duplicate`, {}),
    onSuccess: () => {
      toast.success('Duplicated');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const closeCreate = (v: boolean) => {
    setCreating(v);
    if (!v && sp.get('new')) router.replace(pathname, { scroll: false });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search edits" className="pl-8" aria-label="Search edits" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" asChild>
            <Link href="/templates">
              <LayoutTemplate /> Templates
            </Link>
          </Button>
          <Button variant="brand" onClick={() => setCreating(true)}>
            <Plus /> New edit
          </Button>
        </div>
      </div>

      {list.isPending ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
          ))}
        </div>
      ) : list.isError ? (
        <Notice tone="error">{errorMessage(list.error)}</Notice>
      ) : !items.length ? (
        <EmptyState
          icon={<Clapperboard className="size-5" />}
          title={query ? 'No edits match' : 'No edits yet'}
          description={query ? 'Try another name.' : 'Start from a blank canvas, a proven ad template, your files, or a script.'}
          action={
            !query && (
              <Button variant="brand" onClick={() => setCreating(true)}>
                <Plus /> New edit
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((t) => (
            <EditCard key={t.id} t={t} onRename={() => setRenaming(t)} onDuplicate={() => duplicate.mutate(t)} onDeleted={refresh} />
          ))}
        </div>
      )}
      {list.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}

      <NewEditDialog open={creating} onOpenChange={closeCreate} />
      <RenameDialog edit={renaming} onClose={() => setRenaming(null)} onDone={refresh} />
    </div>
  );
}

function EditCard({ t, onRename, onDuplicate, onDeleted }: { t: TimelineSummaryView; onRename: () => void; onDuplicate: () => void; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [w, h] = (t.aspect || '9:16').split(':').map(Number) as [number, number];
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card transition hover:border-primary/40">
      <Link href={`/editor/${t.id}`} className="block">
        <div className="grid aspect-[4/5] place-items-center overflow-hidden bg-surface-2">
          {t.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.thumbnailUrl} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="rounded-md border-2 border-current/40" style={{ width: w >= h ? 56 : (56 * w) / h, height: w >= h ? (56 * h) / w : 56 }} />
              <span className="text-[11px]">{t.aspect}</span>
            </div>
          )}
        </div>
        <div className="space-y-0.5 p-3">
          <div className="truncate text-sm font-medium">{t.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {t.aspect} · {formatDuration(t.durationS)} · {timeAgo(t.updatedAt)}
          </div>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-xs" variant="secondary" className="absolute top-2 right-2 opacity-0 shadow-md transition group-hover:opacity-100 data-[state=open]:opacity-100" aria-label="Edit options">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirming(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Confirm
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete “${t.name}”?`}
        description="The edit goes away. Exported videos stay in your library."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await api.delete(`/timelines/${t.id}`);
            toast.success('Edit deleted');
            onDeleted();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}

function RenameDialog({ edit, onClose, onDone }: { edit: TimelineSummaryView | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  useOnChange([edit], () => { setName(edit?.name ?? ''); });
  const save = useMutation({
    mutationFn: async () => {
      if (!edit) return;
      await api.patch(`/timelines/${edit.id}`, { name: name.trim(), baseVersion: edit.version });
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Dialog open={!!edit} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename edit</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus aria-label="Name" />
          {save.error && <Notice tone="error">{errorMessage(save.error)}</Notice>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewEditDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState('blank');
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [name, setName] = useState('');
  const [picking, setPicking] = useState(false);
  const [usingId, setUsingId] = useState<string | null>(null);
  const create = useCreateEdit();
  const title = name.trim() || undefined;

  const useTemplate = (t: TemplateView) => {
    setUsingId(t.id);
    create.mutate({ templateId: t.id, aspect, name: title ?? t.name }, { onSettled: () => setUsingId(null) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New edit</DialogTitle>
          <DialogDescription>Pick a shape and a starting point. You can change the shape later in the editor.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <AspectPicker value={aspect} onChange={setAspect} />
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Name (optional)" className="h-8 max-w-60" aria-label="Edit name" />
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="blank">
              <Square className="size-4" /> Blank
            </TabsTrigger>
            <TabsTrigger value="template">
              <LayoutTemplate className="size-4" /> Template
            </TabsTrigger>
            <TabsTrigger value="files">
              <Files className="size-4" /> From files
            </TabsTrigger>
            <TabsTrigger value="script">
              <FileText className="size-4" /> From a script
            </TabsTrigger>
          </TabsList>
          <TabsContent value="blank" className="pt-4">
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
              <div className={cn('rounded-lg border-2 border-primary/50 bg-primary/5')} style={{ width: ASPECT_SIZES[aspect].width >= ASPECT_SIZES[aspect].height ? 160 : (160 * ASPECT_SIZES[aspect].width) / ASPECT_SIZES[aspect].height, height: ASPECT_SIZES[aspect].width >= ASPECT_SIZES[aspect].height ? (160 * ASPECT_SIZES[aspect].height) / ASPECT_SIZES[aspect].width : 160 }} />
              <p className="text-sm text-muted-foreground">
                {ASPECT_SIZES[aspect].label} · {ASPECT_SIZES[aspect].width}×{ASPECT_SIZES[aspect].height}
              </p>
              <Button variant="brand" loading={create.isPending} onClick={() => create.mutate({ aspect, name: title ?? 'Untitled edit' })}>
                Create blank edit
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="template" className="pt-4">
            <TemplateGallery aspect={aspect} onUse={useTemplate} busyId={usingId} compact />
          </TabsContent>
          <TabsContent value="files" className="pt-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">Pick clips, photos and music from your library. They are laid out in the order you pick them, photos for 3 seconds each, with music underneath.</p>
              <Button variant="brand" loading={create.isPending} onClick={() => setPicking(true)}>
                Choose files
              </Button>
            </div>
            <AssetPicker
              open={picking}
              onOpenChange={setPicking}
              types={['video', 'image', 'audio']}
              multiple
              title="Choose files for the edit"
              onPick={(assets) => assets.length && create.mutate({ assetIds: assets.map((a) => a.id).slice(0, 50), aspect, name: title ?? assets[0]!.name })}
            />
          </TabsContent>
          <TabsContent value="script" className="pt-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">Write or generate an ad script, voice it, and build the edit from its beats with captions and on-screen text in place.</p>
              <Button variant="secondary" asChild>
                <Link href="/scripts">Open the Script Studio</Link>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
