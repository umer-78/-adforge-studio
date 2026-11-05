'use client';

import { produce } from 'immer';
import {
  AudioWaveform,
  Captions,
  Copy,
  Gauge,
  Lock,
  Music2,
  Scissors,
  ScissorsLineDashed,
  SplitSquareHorizontal,
  Trash2,
  Unlock,
  VolumeX,
  Wand2,
} from 'lucide-react';
import { memo, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { timelineOps, type Clip, type TimelineData, type Track } from '@adforge/core';
import { useWaveform } from '@/components/audio/waveform-player';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { AssetView } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  beatMarkers,
  captionsFromSpeech,
  copySelection,
  cutSelection,
  cutSilences,
  deleteSelection,
  detachAudio,
  duplicateSelection,
  sourceDurationS,
  splitAtPlayhead,
  splitAtScenes,
} from './actions';
import { player, usePlayhead } from './playhead';
import { useEditor } from './store';
import { findSnap, trackAtClientY, useGeometry, useTimelineUi, type Geometry } from './timeline-state';
import { CLIP_ICON, CLIP_TONE, clipLabel } from './utils';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** Moves every listed clip by `delta` frames; a single clip may also change track. False when anything collides. */
function moveAll(tl: TimelineData, ids: string[], delta: number, trackId: string | null): boolean {
  const items = ids
    .map((id) => timelineOps.findClip(tl, id))
    .filter((x): x is NonNullable<typeof x> => !!x && !x.track.locked && !x.clip.locked)
    .sort((a, b) => (delta > 0 ? b.clip.start - a.clip.start : a.clip.start - b.clip.start));
  for (const { clip } of items) {
    const to = { start: clip.start + delta, ...(ids.length === 1 && trackId ? { trackId } : {}) };
    if (!timelineOps.moveClip(tl, clip.id, to)) return false;
  }
  return true;
}

function startPointer(e: ReactPointerEvent, onMove: (ev: PointerEvent) => void, onUp: (ev: PointerEvent | null) => void) {
  const move = (ev: PointerEvent) => onMove(ev);
  const up = (ev: PointerEvent) => {
    cleanup();
    onUp(ev);
  };
  const cancel = () => {
    cleanup();
    onUp(null);
  };
  const key = (ev: KeyboardEvent) => ev.key === 'Escape' && cancel();
  function cleanup() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key);
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key);
  e.preventDefault();
}

function beginMove(e: ReactPointerEvent, clip: Clip, g: Geometry) {
  const s = useEditor.getState();
  const base = s.timeline;
  const ids = s.selection.includes(clip.id) ? s.selection : [clip.id];
  const exclude = new Set(ids);
  const moving = ids.map((id) => timelineOps.findClip(base, id)?.clip).filter((c): c is Clip => !!c);
  const x0 = e.clientX;
  const y0 = e.clientY;
  let moved = false;
  let last: { delta: number; trackId: string | null; ok: boolean } = { delta: 0, trackId: null, ok: true };
  startPointer(
    e,
    (ev) => {
      if (!moved && Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 3) return;
      moved = true;
      let delta = Math.round((ev.clientX - x0) / g.px);
      const minStart = Math.min(...moving.map((c) => c.start));
      delta = Math.max(delta, -minStart);
      let snapAt: number | null = null;
      if (useEditor.getState().snapping !== ev.altKey) {
        const edges = moving.flatMap((c) => [c.start + delta, c.start + c.duration + delta]);
        const hit = findSnap(base, edges, exclude, usePlayhead.getState().frame, g.px);
        if (hit) {
          delta += hit.shift;
          snapAt = hit.at;
        }
      }
      const overTrack = ids.length === 1 ? trackAtClientY(g, ev.clientY) : null;
      const trackId = overTrack && overTrack !== timelineOps.findClip(base, clip.id)?.track.id ? overTrack : null;
      let ok = true;
      produce(base, (d) => {
        ok = moveAll(d as TimelineData, ids, delta, trackId);
      });
      last = { delta, trackId, ok };
      useTimelineUi.setState({ drag: { ids, delta, trackId, ok }, snap: snapAt });
    },
    (ev) => {
      useTimelineUi.setState({ drag: null, snap: null });
      if (!ev || !moved || !last.ok || (last.delta === 0 && !last.trackId)) return;
      useEditor.getState().edit((d) => {
        moveAll(d, ids, last.delta, last.trackId);
      });
    },
  );
}

function beginTrim(e: ReactPointerEvent, clip: Clip, edge: 'start' | 'end', g: Geometry) {
  const s = useEditor.getState();
  const base = s.timeline;
  const x0 = e.clientX;
  const srcS = sourceDurationS(clip);
  let delta = 0;
  startPointer(
    e,
    (ev) => {
      delta = Math.round((ev.clientX - x0) / g.px);
      let snapAt: number | null = null;
      if (useEditor.getState().snapping !== ev.altKey) {
        const edgeFrame = edge === 'start' ? clip.start + delta : clip.start + clip.duration + delta;
        const hit = findSnap(base, [edgeFrame], new Set([clip.id]), usePlayhead.getState().frame, g.px);
        if (hit) {
          delta += hit.shift;
          snapAt = hit.at;
        }
      }
      const next = produce(base, (d) => {
        timelineOps.trimClip(d as TimelineData, clip.id, edge, delta, srcS);
      });
      const c = timelineOps.findClip(next, clip.id)?.clip;
      if (!c) return;
      useTimelineUi.setState({ trim: { id: clip.id, start: c.start, duration: c.duration }, snap: snapAt });
      // Show the frame at the new cut while dragging.
      player.seek(edge === 'start' ? c.start : c.start + c.duration - 1);
    },
    (ev) => {
      useTimelineUi.setState({ trim: null, snap: null });
      if (!ev || !delta) return;
      useEditor.getState().edit((d) => {
        timelineOps.trimClip(d, clip.id, edge, delta, srcS);
      });
    },
  );
}

function Waveform({ clip, asset, width, fps }: { clip: Extract<Clip, { type: 'audio' | 'video' }>; asset: AssetView; width: number; fps: number }) {
  const wf = useWaveform(asset.id, asset.waveformUrl);
  const path = useMemo(() => {
    const data = wf.data;
    if (!data?.durationS || !data.peaks.length) return null;
    const { peaks, durationS } = data;
    const span = (clip.duration / fps) * clip.speed;
    const from = (clip.trimStart / durationS) * peaks.length;
    const to = Math.min(peaks.length, ((clip.trimStart + span) / durationS) * peaks.length);
    const n = Math.max(1, Math.min(1500, Math.floor(width / 3)));
    const top = Math.max(...peaks, 0.05);
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = Math.floor(from + ((to - from) * i) / n);
      const b = Math.max(a + 1, Math.ceil(from + ((to - from) * (i + 1)) / n));
      let v = 0;
      for (let j = a; j < b && j < peaks.length; j++) v = Math.max(v, peaks[j]!);
      const h = Math.max(1.5, (v / top) * 48);
      d += `M${i + 0.5} ${50 - h}V${50 + h}`;
    }
    return { d, n };
  }, [wf.data, clip.duration, clip.speed, clip.trimStart, fps, width]);
  if (!path) return null;
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] w-full text-emerald-300/70" viewBox={`0 0 ${path.n} 100`} preserveAspectRatio="none" aria-hidden>
      <path d={path.d} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" fill="none" />
    </svg>
  );
}

function Fades({ clip, px, fps }: { clip: Extract<Clip, { type: 'audio' | 'video' }>; px: number; fps: number }) {
  const inW = clip.audio.fadeIn * fps * px;
  const outW = clip.audio.fadeOut * fps * px;
  return (
    <>
      {inW > 2 && <div className="pointer-events-none absolute top-0 bottom-0 left-0 bg-gradient-to-r from-black/45 to-transparent" style={{ width: inW }} />}
      {outW > 2 && <div className="pointer-events-none absolute top-0 right-0 bottom-0 bg-gradient-to-l from-black/45 to-transparent" style={{ width: outW }} />}
    </>
  );
}

export const ClipItem = memo(function ClipItem({ clip, track }: { clip: Clip; track: Track }) {
  const g = useGeometry();
  const selected = useEditor((s) => s.selection.includes(clip.id));
  const asset = useEditor((s) => ((clip.type === 'video' || clip.type === 'image' || clip.type === 'audio') && clip.assetId ? s.assets[clip.assetId] : undefined));
  const dragging = useTimelineUi((s) => !!s.drag?.ids.includes(clip.id));
  const trim = useTimelineUi((s) => (s.trim?.id === clip.id ? s.trim : null));
  const locked = clip.locked || track.locked;
  const start = trim?.start ?? clip.start;
  const duration = trim?.duration ?? clip.duration;
  const width = Math.max(3, duration * g.px);
  const Icon = CLIP_ICON[clip.type];
  const media = clip.type === 'video' || clip.type === 'image' || clip.type === 'audio';
  const missing = media && !clip.placeholder && (!clip.assetId || !asset || !!asset.deletedAt);
  const thumb = clip.type === 'video' ? asset?.thumbnailUrl : clip.type === 'image' ? (asset?.thumbnailUrl ?? asset?.url) : null;
  const keyframes = useMemo(() => [...new Set(Object.values(clip.keyframes).flatMap((k) => (k ?? []).map((x) => x.frame)))].sort((a, b) => a - b), [clip.keyframes]);
  const timed = clip.type === 'video' || clip.type === 'audio' ? clip : null;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useEditor.getState();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      s.select([clip.id], 'toggle');
      return;
    }
    if (!s.selection.includes(clip.id)) s.select([clip.id]);
    if (!locked) beginMove(e, clip, g);
  };

  const onEdge = (edge: 'start' | 'end') => (e: ReactPointerEvent) => {
    if (e.button !== 0 || locked) return;
    e.stopPropagation();
    useEditor.getState().select([clip.id]);
    beginTrim(e, clip, edge, g);
  };

  const setSpeed = (speed: number) =>
    useEditor.getState().edit((d) => {
      timelineOps.setSpeed(d, clip.id, speed);
    });
  const toggleLock = () =>
    useEditor.getState().edit((d) => {
      const c = timelineOps.findClip(d, clip.id)?.clip;
      if (c) c.locked = !c.locked;
    });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-clip={clip.id}
          className={cn(
            'group/clip absolute top-1 bottom-1 overflow-hidden rounded-md border text-white select-none',
            CLIP_TONE[clip.type],
            clip.placeholder && 'border-dashed bg-white/5',
            missing && 'border-red-400/70 bg-red-500/15',
            selected && 'z-[2] border-white/90 ring-2 ring-primary',
            dragging && 'opacity-40',
            locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
          )}
          style={{ left: start * g.px, width }}
          onPointerDown={onPointerDown}
          onContextMenu={() => {
            const s = useEditor.getState();
            if (!s.selection.includes(clip.id)) s.select([clip.id]);
          }}
          onDoubleClick={() => player.seek(clip.start)}
        >
          {thumb && <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: `url("${thumb}")`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }} />}
          {timed && asset && clip.type === 'audio' && <Waveform clip={timed} asset={asset} width={width} fps={g.fps} />}
          {timed && <Fades clip={timed} px={g.px} fps={g.fps} />}
          {clip.transitionIn && <div className="pointer-events-none absolute top-0 bottom-0 left-0 bg-gradient-to-r from-white/35 to-transparent" style={{ width: Math.min(width, clip.transitionIn.duration * g.px) }} />}
          {clip.transitionOut && <div className="pointer-events-none absolute top-0 right-0 bottom-0 bg-gradient-to-l from-white/35 to-transparent" style={{ width: Math.min(width, clip.transitionOut.duration * g.px) }} />}
          {width > 18 && (
            <div className="pointer-events-none relative z-[1] flex items-center gap-1 px-1.5 pt-0.5 text-[11px] leading-4 font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
              <Icon className="size-3 shrink-0 opacity-80" />
              <span className="truncate">{missing ? 'Missing file' : clip.placeholder ? `Empty slot · ${clip.placeholder.label}` : clipLabel(clip, asset ? { [asset.id]: asset } : {})}</span>
              {timed && timed.speed !== 1 && <span className="shrink-0 rounded bg-black/40 px-1 text-[10px]">{timed.speed}×</span>}
              {clip.type === 'video' && clip.reverse && <span className="shrink-0 rounded bg-black/40 px-1 text-[10px]">rev</span>}
              {clip.type === 'video' && clip.freezeAt != null && <span className="shrink-0 rounded bg-black/40 px-1 text-[10px]">freeze</span>}
              {timed && timed.audio.muted && <VolumeX className="size-3 shrink-0" />}
              {clip.effects.length > 0 && <Wand2 className="size-3 shrink-0 opacity-80" />}
              {clip.locked && <Lock className="size-3 shrink-0" />}
            </div>
          )}
          {selected &&
            keyframes.map((f) => (
              <button
                key={f}
                type="button"
                aria-label={`Keyframe at ${f}`}
                className="absolute bottom-0.5 z-[3] size-2 -translate-x-1/2 rotate-45 border border-black/50 bg-amber-300"
                style={{ left: f * g.px }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => player.seek(clip.start + f)}
              />
            ))}
          {!locked && (
            <>
              <span onPointerDown={onEdge('start')} className="absolute inset-y-0 left-0 z-[3] w-1.5 cursor-ew-resize bg-white/0 transition group-hover/clip:bg-white/40" />
              <span onPointerDown={onEdge('end')} className="absolute inset-y-0 right-0 z-[3] w-1.5 cursor-ew-resize bg-white/0 transition group-hover/clip:bg-white/40" />
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => splitAtPlayhead()}>
          <Scissors /> Split at playhead <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicateSelection()}>
          <Copy /> Duplicate <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => copySelection()}>
          Copy <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => cutSelection()}>
          Cut <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        {timed && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Gauge /> Speed
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {SPEEDS.filter((v) => clip.type === 'video' || (v >= 0.25 && v <= 4)).map((v) => (
                  <ContextMenuItem key={v} onSelect={() => setSpeed(v)}>
                    {v}× {timed.speed === v && <span className="ml-auto text-primary">●</span>}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            {clip.type === 'video' && (
              <ContextMenuItem onSelect={() => detachAudio(clip.id)}>
                <AudioWaveform /> Detach audio
              </ContextMenuItem>
            )}
            <ContextMenuItem onSelect={() => void captionsFromSpeech(clip.id)}>
              <Captions /> Captions from speech
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void cutSilences(clip.id)}>
              <ScissorsLineDashed /> Remove pauses
            </ContextMenuItem>
            {clip.type === 'video' && (
              <ContextMenuItem onSelect={() => void splitAtScenes(clip.id)}>
                <SplitSquareHorizontal /> Split at scene changes
              </ContextMenuItem>
            )}
            {clip.type === 'audio' && (
              <ContextMenuItem onSelect={() => void beatMarkers(clip.id)}>
                <Music2 /> Add beat markers
              </ContextMenuItem>
            )}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={toggleLock}>
          {clip.locked ? <Unlock /> : <Lock />} {clip.locked ? 'Unlock clip' : 'Lock clip'}
        </ContextMenuItem>
        <ContextMenuItem destructive onSelect={() => deleteSelection(false)}>
          <Trash2 /> Delete <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem destructive onSelect={() => deleteSelection(true)}>
          Ripple delete <ContextMenuShortcut>⇧⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

/** Outlines where dragged clips will land, green when the spot is free and red when it is not. */
export function DragGhosts({ headerW, rulerH }: { headerW: number; rulerH: number }) {
  const g = useGeometry();
  const drag = useTimelineUi((s) => s.drag);
  const snap = useTimelineUi((s) => s.snap);
  const tl = useEditor((s) => s.timeline);
  const ghosts = useMemo(() => {
    if (!drag) return [];
    return drag.ids.flatMap((id) => {
      const found = timelineOps.findClip(tl, id);
      if (!found) return [];
      const row = g.rows.find((r) => r.id === (drag.trackId ?? found.track.id));
      if (!row) return [];
      return [{ id, left: headerW + (found.clip.start + drag.delta) * g.px, top: rulerH + row.top + 4, height: row.height - 8, width: Math.max(3, found.clip.duration * g.px) }];
    });
  }, [drag, tl, g.rows, g.px, headerW, rulerH]);
  return (
    <>
      {ghosts.map((r) => (
        <div
          key={r.id}
          className={cn('pointer-events-none absolute z-[6] rounded-md border-2', drag?.ok ? 'border-emerald-300 bg-emerald-300/10' : 'border-red-400 bg-red-400/10')}
          style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
        />
      ))}
      {snap != null && <div className="pointer-events-none absolute top-0 bottom-0 z-[7] w-px bg-amber-300" style={{ left: headerW + snap * g.px }} />}
    </>
  );
}

