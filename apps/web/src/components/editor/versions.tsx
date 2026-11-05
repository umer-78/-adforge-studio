'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import type { SnapshotView, TimelineDetailView } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { saveNow } from './autosave';
import { useEditor } from './store';

/** Replaces the editor state with the latest saved version from the server. */
export async function reloadLatest() {
  const id = useEditor.getState().id;
  if (!id) return;
  useEditor.getState().load(await api.get<TimelineDetailView>(`/timelines/${id}`));
}

/** Saves pending work and fails loudly when that is not possible, so nothing is restored over unsaved changes. */
async function saveOrThrow() {
  await saveNow();
  const s = useEditor.getState();
  if (s.saveStatus === 'conflict') throw new Error('This edit was changed somewhere else. Resolve that first.');
  if (s.saveStatus === 'error') throw new Error(s.saveError ?? 'The edit could not be saved.');
}

export function HistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>Name the current state to come back to it, or restore an earlier one. Restoring keeps what you have now as its own version.</DialogDescription>
        </DialogHeader>
        {open && <HistoryBody onRestored={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({ onRestored }: { onRestored: () => void }) {
  const qc = useQueryClient();
  const id = useEditor((s) => s.id)!;
  const version = useEditor((s) => s.version);
  const [label, setLabel] = useState('');
  const key = ['timeline-snapshots', id];
  const list = useQuery({ queryKey: key, queryFn: () => api.get<{ items: SnapshotView[] }>(`/timelines/${id}/snapshots`).then((r) => r.items) });
  const name = useMutation({
    mutationFn: async () => {
      await saveOrThrow();
      return api.post<SnapshotView>(`/timelines/${id}/snapshots`, { label: label.trim() });
    },
    onSuccess: () => {
      setLabel('');
      toast.success('Version saved');
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: (snapId: string) => api.delete(`/timelines/${id}/snapshots/${snapId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const restore = async (snap: SnapshotView) => {
    try {
      await saveOrThrow();
      await api.post(`/timelines/${id}/snapshots/${snap.id}`);
      await reloadLatest();
      void qc.invalidateQueries({ queryKey: key });
      toast.success(`Restored ${snap.label ? `“${snap.label}”` : `version ${snap.version}`}`);
      onRestored();
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) name.mutate();
        }}
      >
        <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Name this version, e.g. “Client v2”" aria-label="Version name" />
        <Button type="submit" loading={name.isPending} disabled={!label.trim()}>
          Save version
        </Button>
      </form>
      {name.error && <Notice tone="error">{errorMessage(name.error)}</Notice>}
      {list.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : list.isError ? (
        <Notice tone="error">{errorMessage(list.error)}</Notice>
      ) : !list.data.length ? (
        <EmptyState icon={<History className="size-5" />} title="No versions yet" description="Versions are kept automatically every so often, before restores and before exports." />
      ) : (
        <div className="divide-y rounded-xl border">
          {list.data.map((snap) => (
            <div key={snap.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{snap.label ?? 'Autosave'}</div>
                <div className="text-xs text-muted-foreground">
                  Version {snap.version}
                  {snap.version === version && ' · same as now'} · {timeAgo(snap.createdAt)}
                </div>
              </div>
              <Confirm title="Restore this version?" description="What you have now is kept as a version named “Before restore”, so you can switch back." confirmLabel="Restore" onConfirm={() => restore(snap)}>
                <Button size="xs" variant="secondary">
                  <RotateCcw /> Restore
                </Button>
              </Confirm>
              <Button size="icon-xs" variant="ghost" aria-label="Delete version" title="Delete version" disabled={remove.isPending && remove.variables === snap.id} onClick={() => remove.mutate(snap.id)}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shown when a save is refused because the edit changed elsewhere (another tab, device or teammate). */
export function ConflictDialog() {
  const router = useRouter();
  const conflict = useEditor((s) => s.saveStatus === 'conflict');
  const [busy, setBusy] = useState<'reload' | 'copy' | 'overwrite' | null>(null);

  const act = (kind: 'reload' | 'copy' | 'overwrite', fn: () => Promise<void>) => async () => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const reload = act('reload', async () => {
    await reloadLatest();
    toast.success('Loaded the latest version');
  });

  const copy = act('copy', async () => {
    const s = useEditor.getState();
    const { id } = await api.post<{ id: string }>('/timelines', { name: `${(s.name || 'Untitled edit').slice(0, 180)} (my copy)`, data: s.timeline });
    // The copy holds the local changes; leaving the original as it is on the server.
    useEditor.setState({ savedRevision: s.revision, saveStatus: 'saved', saveError: null });
    router.push(`/editor/${id}`);
    toast.success('Saved your changes as a copy');
  });

  const overwrite = act('overwrite', async () => {
    const s = useEditor.getState();
    if (!s.id) return;
    // Keep the other change as a version first, so overwriting never loses work.
    await api.post(`/timelines/${s.id}/snapshots`, { label: 'Before overwrite' });
    const latest = await api.get<TimelineDetailView>(`/timelines/${s.id}`);
    useEditor.getState().mergeAssets(Object.values(latest.assets));
    useEditor.setState({ version: latest.version, saveStatus: 'pending', saveError: null });
    await saveNow();
    if (useEditor.getState().saveStatus !== 'saved') throw new Error(useEditor.getState().saveError ?? 'Could not save. Try again.');
    toast.success('Saved. The other version is in History as “Before overwrite”.');
  });

  return (
    <Dialog open={conflict}>
      <DialogContent hideClose onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>This edit changed somewhere else</DialogTitle>
          <DialogDescription>It was saved from another tab, device or teammate after you opened it. Choose what to keep. Nothing is lost either way.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button className="h-auto w-full flex-col items-start gap-0.5 py-2.5 text-left" variant="secondary" loading={busy === 'reload'} disabled={!!busy} onClick={reload}>
            <span className="font-medium">Load the latest version</span>
            <span className="text-xs font-normal text-muted-foreground">Drops your unsaved changes here.</span>
          </Button>
          <Button className="h-auto w-full flex-col items-start gap-0.5 py-2.5 text-left" variant="secondary" loading={busy === 'copy'} disabled={!!busy} onClick={copy}>
            <span className="font-medium">Keep mine as a copy</span>
            <span className="text-xs font-normal text-muted-foreground">Saves your version as a new edit and opens it.</span>
          </Button>
          <Button className="h-auto w-full flex-col items-start gap-0.5 py-2.5 text-left" variant="secondary" loading={busy === 'overwrite'} disabled={!!busy} onClick={overwrite}>
            <span className="font-medium">Overwrite with mine</span>
            <span className="text-xs font-normal text-muted-foreground">The other version stays in History as “Before overwrite”.</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
