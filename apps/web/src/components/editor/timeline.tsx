'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Flag,
  Headphones,
  Lock,
  Magnet,
  MoreHorizontal,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { timelineOps, type Marker, type Track, type TrackKind } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { addAdjustment, addAsset, addBuiltinSfx, addMarkerAtPlayhead, addMotion, addShape, addText, deleteSelection, duplicateSelection, splitAtPlayhead, uploadAndPlace, type Place } from './actions';
import { player, usePlayhead } from './playhead';
import { MAX_ZOOM, MIN_ZOOM, useEditor } from './store';
import { ClipItem, DragGhosts } from './timeline-clip';
import { contentY, frameAtClientX, GeometryContext, HEADER_W, RULER_H, useGeometry, useTimelineUi, type Geometry } from './timeline-state';
import { currentDrag, DRAG_MIME, endDrag, timecode, TRACK_HEIGHT, TRACK_LABEL } from './utils';

const DROP_ZONE_H = 56;
const TRACK_ICON: Record<TrackKind, string> = { video: 'V', overlay: 'O', text: 'T', audio: 'A' };

/** Imperative view controls the toolbar and keyboard shortcuts share. */
export const timelineView = {
  fit: () => {},
  zoomBy: (_factor: number) => {},
};

/** Puts whatever is being dragged from the media panel (or the desktop) onto the timeline. */
function dropOnTimeline(e: DragEvent, place: Place, queryClient: ReturnType<typeof useQueryClient>) {
  const files = Array.from(e.dataTransfer.files ?? []).filter((f) => /^(video|image|audio)\//.test(f.type));
  if (files.length) {
    void uploadAndPlace(files, place, queryClient);
    return;
  }
  const item = currentDrag();
  endDrag();
  if (!item) return;
  switch (item.kind) {
    case 'asset':
      addAsset(item.asset, place);
      break;
    case 'text':
      addText(item.presetId, place);
      break;
    case 'motion':
      addMotion(item.templateId, place);
      break;
    case 'shape':
      addShape(item.shape, place);
      break;
    case 'adjustment':
      addAdjustment(place);
      break;
    case 'sfx':
      void addBuiltinSfx(item.builtinId, place);
      break;
  }
}

const acceptsDrag = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes('Files');

export function TimelinePanel() {
  const tl = useEditor((s) => s.timeline);
  const px = useEditor((s) => s.pxPerFrame);
  const id = useEditor((s) => s.id);
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ width: 900, left: 0 });
  const queryClient = useQueryClient();
  const duration = timelineOps.timelineDuration(tl);

  const rows = useMemo(() => {
    return tl.tracks.map((t, i) => ({
      id: t.id,
      top: tl.tracks.slice(0, i).reduce((sum, above) => sum + TRACK_HEIGHT[above.kind], 0),
      height: TRACK_HEIGHT[t.kind],
    }));
  }, [tl.tracks]);
  const rowsHeight = rows.reduce((sum, r) => sum + r.height, 0);
  const contentW = Math.max(view.width - HEADER_W, (duration + tl.fps * 10) * px);
  const geometry = useMemo<Geometry>(() => ({ px, fps: tl.fps, rows, scroller }), [px, tl.fps, rows]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setView({ width: el.clientWidth, left: el.scrollLeft }));
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const s = useEditor.getState();
      const cursor = e.clientX - el.getBoundingClientRect().left - HEADER_W;
      const frame = (el.scrollLeft + cursor) / s.pxPerFrame;
      s.setZoom(s.pxPerFrame * Math.exp(-e.deltaY * 0.0025));
      requestAnimationFrame(() => {
        el.scrollLeft = frame * useEditor.getState().pxPerFrame - cursor;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    timelineView.fit = () => {
      const s = useEditor.getState();
      const frames = Math.max(timelineOps.timelineDuration(s.timeline), s.timeline.fps * 5);
      s.setZoom((el.clientWidth - HEADER_W - 48) / frames);
      el.scrollLeft = 0;
    };
    timelineView.zoomBy = (factor) => {
      const s = useEditor.getState();
      const frame = usePlayhead.getState().frame;
      const offset = frame * s.pxPerFrame - el.scrollLeft;
      s.setZoom(s.pxPerFrame * factor);
      requestAnimationFrame(() => {
        el.scrollLeft = frame * useEditor.getState().pxPerFrame - offset;
      });
    };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Fit the whole edit in view whenever a different edit opens.
  useEffect(() => {
    if (id) requestAnimationFrame(() => timelineView.fit());
  }, [id]);

  return (
    <GeometryContext.Provider value={geometry}>
      <div className="flex h-full min-h-0 flex-col">
        <Toolbar />
        <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto overscroll-contain scrollbar-thin">
          <div className="relative" style={{ width: HEADER_W + contentW, minHeight: '100%', height: RULER_H + rowsHeight + DROP_ZONE_H }}>
            <div className="sticky top-0 z-20 flex" style={{ height: RULER_H }}>
              <div className="sticky left-0 z-30 flex shrink-0 items-center border-r border-b bg-surface px-2" style={{ width: HEADER_W }}>
                <AddTrackMenu />
              </div>
              <Ruler width={contentW} viewLeft={view.left} viewWidth={view.width} />
            </div>
            {tl.tracks.map((track) => (
              <div key={track.id} className="flex" style={{ height: TRACK_HEIGHT[track.kind] }}>
                <div className="sticky left-0 z-10 shrink-0 border-r border-b border-border/60 bg-surface" style={{ width: HEADER_W }}>
                  <TrackHeader track={track} index={tl.tracks.indexOf(track)} count={tl.tracks.length} />
                </div>
                <Lane track={track} width={contentW} queryClient={queryClient} />
              </div>
            ))}
            <NewTrackDrop width={contentW} queryClient={queryClient} empty={tl.tracks.every((t) => !t.clips.length)} />
            <DragGhosts headerW={HEADER_W} rulerH={RULER_H} />
            <Marquee />
            <PlayheadLine scroller={scroller} />
          </div>
        </div>
      </div>
    </GeometryContext.Provider>
  );
}

function ToolButton({ icon: Icon, label, shortcut, onClick, disabled, active }: { icon: LucideIcon; label: string; shortcut?: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Tip content={shortcut ? `${label} (${shortcut})` : label}>
      <Button size="icon-sm" variant="ghost" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active} className={cn(active && 'bg-accent text-primary')}>
        <Icon />
      </Button>
    </Tip>
  );
}

const zoomToSlider = (px: number) => (Math.log(px / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)) * 100;
const sliderToZoom = (v: number) => MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** (v / 100);

function Toolbar() {
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const snapping = useEditor((s) => s.snapping);
  const px = useEditor((s) => s.pxPerFrame);
  const { undo, redo, setSnapping, setZoom } = useEditor.getState();
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b px-2">
      <ToolButton icon={Undo2} label="Undo" shortcut="⌘Z" onClick={undo} disabled={!canUndo} />
      <ToolButton icon={Redo2} label="Redo" shortcut="⌘⇧Z" onClick={redo} disabled={!canRedo} />
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton icon={Scissors} label="Split at playhead" shortcut="S" onClick={splitAtPlayhead} />
      <ToolButton icon={Copy} label="Duplicate" shortcut="⌘D" onClick={duplicateSelection} disabled={!hasSelection} />
      <ToolButton icon={Trash2} label="Delete" shortcut="⌫" onClick={() => deleteSelection(false)} disabled={!hasSelection} />
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolButton icon={Magnet} label={snapping ? 'Snapping on (hold Alt to bypass)' : 'Snapping off'} onClick={() => setSnapping(!snapping)} active={snapping} />
      <ToolButton icon={Flag} label="Add marker" shortcut="M" onClick={addMarkerAtPlayhead} />
      <div className="ml-auto flex items-center gap-1.5">
        <ToolButton icon={ZoomOut} label="Zoom out" shortcut="−" onClick={() => timelineView.zoomBy(1 / 1.4)} />
        <Slider className="w-28" min={0} max={100} step={0.5} value={[zoomToSlider(px)]} onValueChange={([v]) => setZoom(sliderToZoom(v ?? 50))} aria-label="Timeline zoom" />
        <ToolButton icon={ZoomIn} label="Zoom in" shortcut="+" onClick={() => timelineView.zoomBy(1.4)} />
        <Button size="xs" variant="ghost" onClick={() => timelineView.fit()}>
          Fit
        </Button>
      </div>
    </div>
  );
}

function AddTrackMenu() {
  const add = (kind: TrackKind) =>
    useEditor.getState().edit((d) => {
      timelineOps.addTrack(d, kind);
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="ghost" className="text-muted-foreground">
          <Plus /> Track
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Add a track</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => add('video')}>Video</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => add('overlay')}>Overlay</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => add('text')}>Text</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => add('audio')}>Audio</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Tick spacing in frames for labels and minor ticks at the current zoom. */
function ticks(px: number, fps: number): { major: number; minor: number } {
  const steps = [1, 2, 5, 10, Math.round(fps / 2), fps, fps * 2, fps * 5, fps * 10, fps * 15, fps * 30, fps * 60, fps * 120, fps * 300, fps * 600];
  const major = steps.find((s) => s * px >= 72) ?? steps[steps.length - 1]!;
  const minor = [major / 10, major / 5, major / 2].map((m) => Math.max(1, Math.round(m))).find((m) => m * px >= 7 && major % m === 0) ?? major;
  return { major, minor };
}

function rulerLabel(frame: number, fps: number, major: number): string {
  if (major < fps) return timecode(frame, fps);
  const s = Math.round(frame / fps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Ruler({ width, viewLeft, viewWidth }: { width: number; viewLeft: number; viewWidth: number }) {
  const g = useGeometry();
  const markers = useEditor((s) => s.timeline.markers);
  const { major, minor } = ticks(g.px, g.fps);
  const from = Math.max(0, Math.floor(viewLeft / g.px / major) * major);
  const to = (viewLeft + viewWidth) / g.px + major;
  const items: { f: number; major: boolean }[] = [];
  for (let f = from; f <= to && items.length < 2000; f += minor) items.push({ f, major: f % major === 0 });

  const scrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    player.pause();
    player.seek(frameAtClientX(g, e.clientX));
  };

  return (
    <div
      className="relative shrink-0 cursor-col-resize border-b bg-surface/95 backdrop-blur"
      style={{ width }}
      onPointerDown={scrub}
      onPointerMove={(e) => e.buttons === 1 && e.currentTarget.hasPointerCapture(e.pointerId) && player.seek(frameAtClientX(g, e.clientX))}
    >
      {items.map(({ f, major: isMajor }) => (
        <div key={f} className="pointer-events-none absolute bottom-0" style={{ left: f * g.px }}>
          <div className={cn('w-px bg-muted-foreground/40', isMajor ? 'h-3' : 'h-1.5')} />
          {isMajor && <span className="absolute bottom-3 left-1 font-mono text-[10px] whitespace-nowrap text-muted-foreground">{rulerLabel(f, g.fps, major)}</span>}
        </div>
      ))}
      {markers.map((m) => (
        <MarkerFlag key={m.id} marker={m} px={g.px} />
      ))}
      <PlayheadKnob />
    </div>
  );
}

function MarkerFlag({ marker, px }: { marker: Marker; px: number }) {
  const [open, setOpen] = useState(false);
  const update = (patch: Partial<Marker>) =>
    useEditor.getState().edit(
      (d) => {
        const m = d.markers.find((x) => x.id === marker.id);
        if (m) Object.assign(m, patch);
      },
      { coalesce: `marker:${marker.id}` },
    );
  const remove = () =>
    useEditor.getState().edit((d) => {
      d.markers = d.markers.filter((x) => x.id !== marker.id);
    });
  if (marker.kind === 'beat') {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            aria-label="Beat marker"
            className="absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-full"
            style={{ left: marker.frame * px, background: marker.color }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => player.seek(marker.frame)}
          />
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={remove}>Remove this beat</ContextMenuItem>
          <ContextMenuItem
            destructive
            onSelect={() =>
              useEditor.getState().edit((d) => {
                d.markers = d.markers.filter((x) => x.kind !== 'beat');
              })
            }
          >
            Clear all beat markers
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={marker.label || 'Marker'}
          title={marker.label || 'Marker'}
          className="absolute top-0.5 z-[1] flex h-3.5 -translate-x-1/2 items-center"
          style={{ left: marker.frame * px }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => player.seek(marker.frame)}
        >
          <span className="size-2.5 rotate-45 rounded-[2px]" style={{ background: marker.color }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-3" align="start">
        <Input autoFocus value={marker.label} placeholder="Marker label" maxLength={120} onChange={(e) => update({ label: e.target.value })} />
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {['#22D3EE', '#A3E635', '#FACC15', '#F472B6', '#A78BFA'].map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => update({ color: c })} className={cn('size-5 rounded-full border', marker.color === c && 'ring-2 ring-ring ring-offset-1 ring-offset-background')} style={{ background: c }} />
            ))}
          </div>
          <Button size="xs" variant="ghost" className="text-destructive" onClick={remove}>
            Delete
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PlayheadKnob() {
  const g = useGeometry();
  const frame = usePlayhead((s) => s.frame);
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 z-[2]" style={{ left: frame * g.px }}>
      <div className="absolute -top-px left-0 h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-rose-400" />
    </div>
  );
}

function PlayheadLine({ scroller }: { scroller: React.RefObject<HTMLDivElement | null> }) {
  const g = useGeometry();
  const frame = usePlayhead((s) => s.frame);
  const playing = usePlayhead((s) => s.playing);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = frame * g.px;
    const visible = el.clientWidth - HEADER_W;
    if (x < el.scrollLeft || x > el.scrollLeft + visible - 24) el.scrollTo({ left: Math.max(0, x - 48) });
  }, [frame, playing, g.px, scroller]);
  return <div className="pointer-events-none absolute top-0 bottom-0 z-[5] w-px bg-rose-400" style={{ left: HEADER_W + frame * g.px }} />;
}

function Marquee() {
  const g = useGeometry();
  const m = useTimelineUi((s) => s.marquee);
  if (!m) return null;
  return (
    <div
      className="pointer-events-none absolute z-[6] rounded-sm border border-primary/70 bg-primary/10"
      style={{ left: HEADER_W + Math.min(m.x0, m.x1) * g.px, top: RULER_H + Math.min(m.y0, m.y1), width: Math.abs(m.x1 - m.x0) * g.px, height: Math.abs(m.y1 - m.y0) }}
    />
  );
}

function TrackHeader({ track, index, count }: { track: Track; index: number; count: number }) {
  const soloed = useEditor((s) => s.soloTrackIds.includes(track.id));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(track.name);
  const edit = useEditor.getState().edit;
  const patch = (fn: (t: Track) => void, coalesce?: string) =>
    edit(
      (d) => {
        const t = d.tracks.find((x) => x.id === track.id);
        if (t) fn(t);
      },
      coalesce ? { coalesce } : {},
    );
  const visual = track.kind !== 'audio';
  const audible = track.kind === 'audio' || track.kind === 'video';
  const commit = () => {
    setRenaming(false);
    const next = name.trim().slice(0, 80);
    if (next && next !== track.name) patch((t) => (t.name = next));
    else setName(track.name);
  };

  return (
    <div className="group/track flex h-full items-center gap-1 pr-1 pl-2">
      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold', track.kind === 'audio' ? 'bg-emerald-500/20 text-emerald-300' : track.kind === 'text' ? 'bg-amber-500/20 text-amber-300' : track.kind === 'overlay' ? 'bg-violet-500/20 text-violet-300' : 'bg-sky-500/20 text-sky-300')}>
        {TRACK_ICON[track.kind]}
      </span>
      {renaming ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setName(track.name);
              setRenaming(false);
            }
          }}
          className="h-6 min-w-0 flex-1 px-1.5 text-xs"
        />
      ) : (
        <button type="button" className="min-w-0 flex-1 truncate text-left text-xs font-medium" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
          {track.name || TRACK_LABEL[track.kind]}
        </button>
      )}
      <div className="flex shrink-0 items-center">
        {visual && (
          <Tip content={track.hidden ? 'Show track' : 'Hide track'}>
            <Button size="icon-xs" variant="ghost" className={cn('size-6', track.hidden && 'text-primary')} onClick={() => patch((t) => (t.hidden = !t.hidden))} aria-label={track.hidden ? 'Show track' : 'Hide track'}>
              {track.hidden ? <EyeOff /> : <Eye />}
            </Button>
          </Tip>
        )}
        {audible && (
          <Tip content={track.muted ? 'Unmute track' : 'Mute track'}>
            <Button size="icon-xs" variant="ghost" className={cn('size-6', track.muted && 'text-primary')} onClick={() => patch((t) => (t.muted = !t.muted))} aria-label={track.muted ? 'Unmute track' : 'Mute track'}>
              {track.muted ? <VolumeX /> : <Volume2 />}
            </Button>
          </Tip>
        )}
        {audible && (
          <Tip content={soloed ? 'Stop solo' : 'Solo (preview only)'}>
            <Button size="icon-xs" variant="ghost" className={cn('size-6', soloed && 'bg-accent text-amber-300')} onClick={() => useEditor.getState().toggleSolo(track.id)} aria-label="Solo track" aria-pressed={soloed}>
              <Headphones />
            </Button>
          </Tip>
        )}
        <Tip content={track.locked ? 'Unlock track' : 'Lock track'}>
          <Button size="icon-xs" variant="ghost" className={cn('size-6', track.locked && 'text-primary')} onClick={() => patch((t) => (t.locked = !t.locked))} aria-label={track.locked ? 'Unlock track' : 'Lock track'}>
            {track.locked ? <Lock /> : <Unlock />}
          </Button>
        </Tip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" className="size-6 opacity-60 group-hover/track:opacity-100" aria-label="Track options">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {audible && (
              <>
                <DropdownMenuLabel>Track volume · {Math.round(track.volume * 100)}%</DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <Slider min={0} max={2} step={0.01} value={[track.volume]} onValueChange={([v]) => patch((t) => (t.volume = v ?? 1), `track-volume:${track.id}`)} aria-label="Track volume" />
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === 0}
              onSelect={() =>
                edit((d) => {
                  const [t] = d.tracks.splice(index, 1);
                  if (t) d.tracks.splice(index - 1, 0, t);
                })
              }
            >
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === count - 1}
              onSelect={() =>
                edit((d) => {
                  const [t] = d.tracks.splice(index, 1);
                  if (t) d.tracks.splice(index + 1, 0, t);
                })
              }
            >
              <ArrowDown /> Move down
            </DropdownMenuItem>
            <DropdownMenuItem disabled={track.locked || !track.clips.length} onSelect={() => edit((d) => timelineOps.closeGaps(d, track.id))}>
              Close gaps
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => edit((d) => timelineOps.removeTrack(d, track.id))}>
              <Trash2 /> Delete track{track.clips.length ? ` and ${track.clips.length} clip${track.clips.length === 1 ? '' : 's'}` : ''}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

const Lane = memo(function Lane({ track, width, queryClient }: { track: Track; width: number; queryClient: ReturnType<typeof useQueryClient> }) {
  const g = useGeometry();
  const drop = useTimelineUi((s) => (s.drop?.trackId === track.id ? s.drop : null));

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const f0 = frameAtClientX(g, e.clientX);
    const y0 = contentY(g, e.clientY);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const before = useEditor.getState().selection;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const f1 = frameAtClientX(g, ev.clientX);
      const y1 = contentY(g, ev.clientY);
      if (!moved && Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) < 5) return;
      moved = true;
      useTimelineUi.setState({ marquee: { x0: f0, y0, x1: f1, y1 } });
      const [fa, fb] = [Math.min(f0, f1), Math.max(f0, f1)];
      const [ya, yb] = [Math.min(y0, y1), Math.max(y0, y1)];
      const tl = useEditor.getState().timeline;
      const ids: string[] = [];
      for (const row of g.rows) {
        if (row.top + row.height < ya || row.top > yb) continue;
        const t = tl.tracks.find((x) => x.id === row.id);
        if (!t || t.locked) continue;
        for (const c of t.clips) if (c.start < fb && c.start + c.duration > fa) ids.push(c.id);
      }
      useEditor.getState().select(additive ? [...before, ...ids] : ids);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useTimelineUi.setState({ marquee: null });
      if (!moved) {
        if (!additive) useEditor.getState().select([]);
        player.seek(f0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className={cn('relative h-full shrink-0 border-b border-border/60', track.hidden && 'opacity-50', track.locked && 'bg-[repeating-linear-gradient(135deg,transparent_0_8px,rgba(255,255,255,0.025)_8px_16px)]')}
      style={{ width }}
      onPointerDown={onPointerDown}
      onDragOver={(e) => {
        if (!acceptsDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const frame = frameAtClientX(g, e.clientX);
        const current = useTimelineUi.getState().drop;
        if (current?.trackId !== track.id || current.frame !== frame) useTimelineUi.setState({ drop: { trackId: track.id, frame } });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) useTimelineUi.setState({ drop: null });
      }}
      onDrop={(e) => {
        e.preventDefault();
        useTimelineUi.setState({ drop: null });
        dropOnTimeline(e, { frame: frameAtClientX(g, e.clientX), trackId: track.id }, queryClient);
      }}
    >
      {track.clips.map((clip) => (
        <ClipItem key={clip.id} clip={clip} track={track} />
      ))}
      {drop && <div className="pointer-events-none absolute top-0 bottom-0 z-[4] w-0.5 bg-primary shadow-[0_0_8px_var(--glow)]" style={{ left: drop.frame * g.px }} />}
    </div>
  );
});

function NewTrackDrop({ width, queryClient, empty }: { width: number; queryClient: ReturnType<typeof useQueryClient>; empty: boolean }) {
  const g = useGeometry();
  const over = useTimelineUi((s) => !!s.drop && s.drop.trackId === null);
  return (
    <div className="flex" style={{ height: DROP_ZONE_H }}>
      <div className="sticky left-0 z-10 shrink-0 border-r bg-surface" style={{ width: HEADER_W }} />
      <div
        className={cn('flex shrink-0 items-center px-4 text-xs text-muted-foreground transition', over && 'bg-primary/10 text-foreground')}
        style={{ width }}
        onDragOver={(e) => {
          if (!acceptsDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          useTimelineUi.setState({ drop: { trackId: null, frame: frameAtClientX(g, e.clientX) } });
        }}
        onDragLeave={() => useTimelineUi.setState({ drop: null })}
        onDrop={(e) => {
          e.preventDefault();
          useTimelineUi.setState({ drop: null });
          dropOnTimeline(e, { frame: frameAtClientX(g, e.clientX), newTrack: true }, queryClient);
        }}
      >
        <span className="sticky left-[calc(188px+1rem)]">{empty ? 'Drag files, text or motion graphics here to start your edit.' : 'Drop here to add on a new track'}</span>
      </div>
    </div>
  );
}

