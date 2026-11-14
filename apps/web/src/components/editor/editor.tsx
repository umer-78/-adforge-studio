'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CircleAlert, CloudUpload, Copy, Ellipsis, History, Keyboard, LayoutTemplate, Redo2, SlidersHorizontal, Undo2, Upload, WandSparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { timelineOps } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, Field, Kbd, Notice } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { Tip } from '@/components/ui/tooltip';
import { JobsTray } from '@/components/shell/jobs-tray';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import { useRealtimeSync } from '@/lib/hooks/use-realtime';
import type { AssetView, TimelineDetailView } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  addMarkerAtPlayhead,
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  pasteClipboard,
  selectAll,
  splitAtPlayhead,
  trimToPlayhead,
  uploadAndPlace,
} from './actions';
import { AssistantPanel } from './assistant-panel';
import { saveNow, useAutosave } from './autosave';
import { ExportDialog } from './export-dialog';
import { Inspector } from './inspector';
import { MediaPanel } from './media-panel';
import { player, usePlayhead } from './playhead';
import { Preview } from './preview';
import { useEditor } from './store';
import { TimelinePanel, timelineView } from './timeline';
import { isEditableTarget } from './utils';
import { ConflictDialog, HistoryDialog } from './versions';
import { useOnChange } from '@/lib/hooks/use-on-change';

/** Signed URLs last an hour; refreshing well before that keeps long sessions playing. */
const URL_REFRESH_MS = 40 * 60_000;
const PROCESSING_POLL_MS = 8000;

export function Editor({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ['timeline-detail', id],
    queryFn: () => api.get<TimelineDetailView>(`/timelines/${id}`),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const loadedId = useEditor((s) => s.id);

  useEffect(() => {
    if (detail.data) useEditor.getState().load(detail.data);
  }, [detail.data]);

  if (detail.isError)
    return (
      <div className="grid h-dvh place-items-center p-6">
        <EmptyState
          icon={<CircleAlert className="size-5" />}
          title="This edit could not be opened"
          description={errorMessage(detail.error)}
          action={
            <Button asChild variant="secondary">
              <Link href="/editor">Back to edits</Link>
            </Button>
          }
        />
      </div>
    );
  if (!detail.data || loadedId !== id)
    return (
      <div className="grid h-dvh place-items-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  return <Workspace />;
}

/* ------------------------------ Resizable layout ------------------------------ */

type PaneKey = 'left' | 'right' | 'bottom';
const PANE_DEFAULTS: Record<PaneKey, number> = { left: 300, right: 320, bottom: 300 };
const PANE_LIMITS: Record<PaneKey, [number, number]> = { left: [220, 520], right: [260, 520], bottom: [160, 640] };

function usePaneSizes() {
  const [sizes, setSizes] = useState<Record<PaneKey, number>>(PANE_DEFAULTS);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('af:editor-panes') ?? 'null') as Partial<Record<PaneKey, number>> | null;
      // Saved pane sizes can only be read after hydration, or the first client render would not match the server's.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSizes((s) => ({ ...s, ...saved }));
    } catch {
      // Private mode or blocked storage: keep the defaults.
    }
  }, []);
  const set = useCallback((key: PaneKey, value: number) => {
    setSizes((s) => {
      const [min, max] = PANE_LIMITS[key];
      const next = { ...s, [key]: Math.round(Math.min(max, Math.max(min, value))) };
      try {
        localStorage.setItem('af:editor-panes', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  return [sizes, set] as const;
}

function Resizer({ pane, size, onResize }: { pane: PaneKey; size: number; onResize: (key: PaneKey, v: number) => void }) {
  const vertical = pane !== 'bottom';
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label="Resize panel"
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        const grow = pane === 'left' ? 'ArrowRight' : pane === 'right' ? 'ArrowLeft' : 'ArrowUp';
        const shrink = pane === 'left' ? 'ArrowLeft' : pane === 'right' ? 'ArrowRight' : 'ArrowDown';
        if (e.key === grow) onResize(pane, size + step);
        if (e.key === shrink) onResize(pane, size - step);
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const start = vertical ? e.clientX : e.clientY;
        const initial = size;
        const sign = pane === 'left' ? 1 : -1;
        const move = (ev: PointerEvent) => onResize(pane, initial + sign * ((vertical ? ev.clientX : ev.clientY) - start));
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.style.cursor = '';
        };
        document.body.style.cursor = vertical ? 'col-resize' : 'row-resize';
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      className={cn('group relative z-10 shrink-0 outline-none', vertical ? '-mx-1 w-2 cursor-col-resize' : '-my-1 h-2 cursor-row-resize')}
    >
      <span className={cn('absolute bg-primary/0 transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary', vertical ? 'inset-y-0 left-1/2 w-px' : 'inset-x-0 top-1/2 h-px')} />
    </div>
  );
}

/* --------------------------------- Workspace --------------------------------- */

function Workspace() {
  const qc = useQueryClient();
  const me = useMe();
  const [sizes, resize] = usePaneSizes();
  const [side, setSide] = useState<'inspect' | 'assistant'>('inspect');
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const name = useEditor((s) => s.name);

  useAutosave();
  useRealtimeSync(me.data?.workspace.id);
  useAssetUpkeep();

  useEffect(() => {
    document.title = `${name || 'Untitled edit'} · Editor · AdForge Studio`;
  }, [name]);

  // Files dropped on the editor go to the library and onto the timeline, not the app-wide uploader.
  useEffect(() => {
    document.body.dataset.dropzone = 'local';
    const over = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (e.defaultPrevented) return;
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => /^(video|image|audio)\//.test(f.type));
      e.preventDefault();
      if (files.length) void uploadAndPlace(files, {}, qc);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      delete document.body.dataset.dropzone;
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [qc]);

  useShortcuts({ openExport: () => setExportOpen(true), openKeys: () => setKeysOpen(true) });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Header onExport={() => setExportOpen(true)} onHistory={() => setHistoryOpen(true)} onKeys={() => setKeysOpen(true)} onTemplate={() => setTemplateOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden min-h-0 shrink-0 flex-col border-r bg-surface/40 md:flex" style={{ width: sizes.left }}>
          <MediaPanel />
        </aside>
        <div className="hidden md:block">
          <Resizer pane="left" size={sizes.left} onResize={resize} />
        </div>
        <main className="flex min-w-0 flex-1 flex-col">
          <Preview />
        </main>
        <div className="hidden lg:block">
          <Resizer pane="right" size={sizes.right} onResize={resize} />
        </div>
        <aside className="hidden min-h-0 shrink-0 flex-col border-l bg-surface/40 lg:flex" style={{ width: sizes.right }}>
          <div className="flex shrink-0 gap-1 border-b p-1.5">
            <SideTab active={side === 'inspect'} onClick={() => setSide('inspect')} icon={<SlidersHorizontal className="size-3.5" />}>
              Inspector
            </SideTab>
            <SideTab active={side === 'assistant'} onClick={() => setSide('assistant')} icon={<WandSparkles className="size-3.5" />}>
              Assistant
            </SideTab>
          </div>
          <div className={cn('min-h-0 flex-1 overflow-y-auto scrollbar-thin', side !== 'inspect' && 'hidden')}>
            <Inspector />
          </div>
          {/* Kept mounted so the conversation survives switching tabs. */}
          <div className={cn('min-h-0 flex-1', side !== 'assistant' && 'hidden')}>
            <AssistantPanel />
          </div>
        </aside>
      </div>
      <Resizer pane="bottom" size={sizes.bottom} onResize={resize} />
      <section className="flex shrink-0 flex-col border-t bg-surface/30" style={{ height: sizes.bottom }}>
        <TimelinePanel />
      </section>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
      <ShortcutsDialog open={keysOpen} onOpenChange={setKeysOpen} />
      <SaveTemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
      <ConflictDialog />
    </div>
  );
}

function SideTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition', active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')} aria-pressed={active}>
      {icon}
      {children}
    </button>
  );
}

/* ----------------------------------- Header ----------------------------------- */

function Header({ onExport, onHistory, onKeys, onTemplate }: { onExport: () => void; onHistory: () => void; onKeys: () => void; onTemplate: () => void }) {
  const router = useRouter();
  const name = useEditor((s) => s.name);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
      <Tip content="All edits">
        <Button size="icon-sm" variant="ghost" asChild>
          <Link href="/editor" aria-label="All edits">
            <ArrowLeft />
          </Link>
        </Button>
      </Tip>
      <input
        value={name}
        onChange={(e) => useEditor.getState().rename(e.target.value.slice(0, 200))}
        onBlur={(e) => !e.target.value.trim() && useEditor.getState().rename('Untitled edit')}
        className="h-8 w-40 min-w-0 rounded-md bg-transparent px-2 text-sm font-medium outline-none hover:bg-accent/60 focus:bg-accent sm:w-64"
        aria-label="Edit name"
      />
      <SaveIndicator />
      <div className="ml-auto flex items-center gap-1">
        <Tip content="Undo (⌘Z)">
          <Button size="icon-sm" variant="ghost" disabled={!canUndo} onClick={() => useEditor.getState().undo()} aria-label="Undo">
            <Undo2 />
          </Button>
        </Tip>
        <Tip content="Redo (⌘⇧Z)">
          <Button size="icon-sm" variant="ghost" disabled={!canRedo} onClick={() => useEditor.getState().redo()} aria-label="Redo">
            <Redo2 />
          </Button>
        </Tip>
        <Tip content="Version history">
          <Button size="icon-sm" variant="ghost" onClick={onHistory} aria-label="Version history">
            <History />
          </Button>
        </Tip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="More">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onTemplate}>
              <LayoutTemplate /> Save as template…
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const s = useEditor.getState();
                api
                  .post<{ id: string }>('/timelines', { name: `${(s.name || 'Untitled edit').slice(0, 190)} copy`, data: s.timeline })
                  .then(({ id }) => {
                    toast.success('Copy made. Opening it.');
                    router.push(`/editor/${id}`);
                  })
                  .catch((err) => toast.error(errorMessage(err)));
              }}
            >
              <Copy /> Make a copy
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onKeys}>
              <Keyboard /> Keyboard shortcuts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <JobsTray />
        <Button size="sm" variant="brand" onClick={onExport}>
          <Upload /> Export
        </Button>
      </div>
    </header>
  );
}

function SaveIndicator() {
  const status = useEditor((s) => s.saveStatus);
  const error = useEditor((s) => s.saveError);
  const label =
    status === 'saved' ? (
      <>
        <Check className="size-3.5" /> Saved
      </>
    ) : status === 'saving' ? (
      <>
        <Spinner className="size-3" /> Saving…
      </>
    ) : status === 'pending' ? (
      <>
        <CloudUpload className="size-3.5" /> Unsaved
      </>
    ) : status === 'conflict' ? (
      <>
        <CircleAlert className="size-3.5" /> Changed elsewhere
      </>
    ) : (
      <>
        <CircleAlert className="size-3.5" /> Not saved, retrying
      </>
    );
  return (
    <Tip content={status === 'error' ? `${error ?? 'Saving failed.'} Click to try now.` : status === 'saved' ? 'Every change is saved automatically.' : 'Saving shortly.'}>
      <button
        type="button"
        onClick={() => void saveNow().catch(() => undefined)}
        className={cn('hidden h-7 items-center gap-1.5 rounded-md px-2 text-xs sm:flex', status === 'error' || status === 'conflict' ? 'text-destructive' : 'text-muted-foreground hover:text-foreground')}
      >
        {label}
      </button>
    </Tip>
  );
}

function SaveTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const editName = useEditor((s) => s.name);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slots, setSlots] = useState(true);
  useOnChange([open, editName], () => {
    if (open) setName(editName);
  });
  const save = useMutation({
    mutationFn: async () => {
      // Templates are made from the saved edit, so save what is on screen first.
      await saveNow();
      if (useEditor.getState().saveStatus !== 'saved') throw new Error(useEditor.getState().saveError ?? 'Save the edit first.');
      return api.post<{ id: string }>('/templates', { timelineId: useEditor.getState().id, name: name.trim(), description: description.trim(), slots });
    },
    onSuccess: () => {
      toast.success('Template saved. Find it under Templates.');
      void qc.invalidateQueries({ queryKey: ['templates'] });
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>Reuse this structure for new ads. Text, music, motion graphics, effects and timing are kept.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label="Description" hint="Optional. When to use it, what to shoot.">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </Field>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">Turn photos and videos into empty slots</span>
              <span className="block text-xs text-muted-foreground">Each new edit asks for its own shots. Turn off to keep your footage in the template.</span>
            </span>
            <Switch checked={slots} onCheckedChange={setSlots} />
          </label>
          {save.error && <Notice tone="error">{errorMessage(save.error)}</Notice>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Asset upkeep -------------------------------- */

async function fetchAssets(ids: string[]): Promise<AssetView[]> {
  const out: AssetView[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const res = await api.get<{ items: AssetView[] }>(`/assets?ids=${chunk.join(',')}`);
    out.push(...res.items);
  }
  return out;
}

/**
 * Keeps the editor's file list complete and playable: loads files that arrive by paste or the
 * assistant, polls files that are still processing, and renews signed URLs before they expire.
 */
function useAssetUpkeep() {
  const tl = useEditor((s) => s.timeline);
  const assets = useEditor((s) => s.assets);
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const ids = timelineOps.collectAssetIds(tl).filter((id) => !assets[id] && !requested.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => requested.current.add(id));
    fetchAssets(ids)
      .then((views) => useEditor.getState().mergeAssets(views))
      .catch(() => ids.forEach((id) => requested.current.delete(id)));
  }, [tl, assets]);

  const processing = Object.values(assets)
    .filter((a) => a.status !== 'ready' && a.status !== 'failed')
    .map((a) => a.id)
    .join(',');
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => {
      fetchAssets(processing.split(','))
        .then((views) => useEditor.getState().mergeAssets(views))
        .catch(() => undefined);
    }, PROCESSING_POLL_MS);
    return () => clearInterval(timer);
  }, [processing]);

  useEffect(() => {
    const refresh = () => {
      const ids = Object.keys(useEditor.getState().assets);
      if (ids.length)
        fetchAssets(ids)
          .then((views) => useEditor.getState().mergeAssets(views))
          .catch((err) => toast.error(`Could not refresh media links: ${errorMessage(err)}`));
    };
    const timer = setInterval(refresh, URL_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
}

/* --------------------------------- Shortcuts --------------------------------- */

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function editPoints(): number[] {
  const tl = useEditor.getState().timeline;
  return timelineOps.snapPoints(tl, {}).sort((a, b) => a - b);
}

function useShortcuts({ openExport, openKeys }: { openExport: () => void; openKeys: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      // Saving and exporting work everywhere; everything else stays out of text fields and dialogs.
      if (mod && key === 's') {
        e.preventDefault();
        saveNow()
          .then(() => toast.success('Saved'))
          .catch((err) => toast.error(errorMessage(err)));
        return;
      }
      if (mod && key === 'e') {
        e.preventDefault();
        openExport();
        return;
      }
      if (isEditableTarget(e.target) || document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"]')) return;
      const s = useEditor.getState();
      const fps = s.timeline.fps;
      const end = timelineOps.timelineDuration(s.timeline);
      let handled = true;
      if (mod && key === 'z' && e.shiftKey) s.redo();
      else if (mod && key === 'z') s.undo();
      else if (mod && key === 'y') s.redo();
      else if (mod && key === 'c') copySelection();
      else if (mod && key === 'x') cutSelection();
      else if (mod && key === 'v') pasteClipboard();
      else if (mod && key === 'd') duplicateSelection();
      else if (mod && key === 'a') selectAll();
      else if (mod && key === 'b') splitAtPlayhead();
      else if (!mod && !e.altKey && e.key === ' ') player.toggle();
      else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) nudgeSelection((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') player.step((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? fps : 1));
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const frame = usePlayhead.getState().frame;
        const points = editPoints();
        const target = e.key === 'ArrowUp' ? [...points].reverse().find((p) => p < frame) : points.find((p) => p > frame);
        if (target != null) player.seek(target);
      } else if (e.key === 'Home') player.seek(0);
      else if (e.key === 'End') player.seek(Math.max(0, end - 1));
      else if (key === 's' && !mod) splitAtPlayhead();
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection(e.shiftKey);
      else if (key === 'm') addMarkerAtPlayhead();
      else if (e.key === '[') trimToPlayhead('start');
      else if (e.key === ']') trimToPlayhead('end');
      else if (e.key === '+' || e.key === '=') timelineView.zoomBy(1.25);
      else if (e.key === '-' || e.key === '_') timelineView.zoomBy(0.8);
      else if (key === 'z' && e.shiftKey) timelineView.fit();
      else if (e.key === 'Escape') s.select([]);
      else if (e.key === '?') openKeys();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openExport, openKeys]);
}

const SHORTCUTS: [string, string[]][] = [
  ['Play / pause', ['Space']],
  ['Step one frame', ['←', '→']],
  ['Step one second', ['⇧←', '⇧→']],
  ['Previous / next edit point', ['↑', '↓']],
  ['Start / end', ['Home', 'End']],
  ['Split at playhead', ['S', '⌘B']],
  ['Trim start / end to playhead', ['[', ']']],
  ['Delete / ripple delete', ['⌫', '⇧⌫']],
  ['Nudge selection', ['⌥←', '⌥→']],
  ['Duplicate', ['⌘D']],
  ['Copy / cut / paste', ['⌘C', '⌘X', '⌘V']],
  ['Undo / redo', ['⌘Z', '⌘⇧Z']],
  ['Select all', ['⌘A']],
  ['Add marker', ['M']],
  ['Zoom timeline', ['+', '−']],
  ['Fit timeline', ['⇧Z']],
  ['Save now', ['⌘S']],
  ['Export', ['⌘E']],
  ['Clear selection', ['Esc']],
];

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const mac = isMac();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>{mac ? '⌘ is the Command key.' : '⌘ means Ctrl on Windows and Linux.'} Drag on the timeline with Alt held to move without snapping.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {SHORTCUTS.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{label}</span>
              <span className="flex gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{mac ? k : k.replace('⌘', 'Ctrl+').replace('⌥', 'Alt+').replace('⇧', 'Shift+')}</Kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <Notice tone="info">Shortcuts pause while you type in a field.</Notice>
      </DialogContent>
    </Dialog>
  );
}
