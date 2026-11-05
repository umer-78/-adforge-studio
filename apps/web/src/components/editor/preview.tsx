'use client';

import { layerRect, TimelineComposition } from '@adforge/compositions';
import { Player, type PlayerRef } from '@remotion/player';
import { Maximize, Pause, Play, Repeat, ScanLine, SkipBack, SkipForward, StepBack, StepForward, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { timelineOps, transformAt, type AnimatableProp, type AssetMap, type Clip, type TimelineData, type Track } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { toResolvedAsset } from '@/lib/resolved-asset';
import { cn } from '@/lib/utils';
import { player, usePlayhead } from './playhead';
import { useEditor } from './store';
import { timecode, VISUAL_TYPES } from './utils';

const CHECKER = 'repeating-conic-gradient(#2a2a33 0% 25%, #1c1c24 0% 50%) 50% / 20px 20px';
const SNAP_PX = 6;

interface Placed {
  clip: Clip;
  track: Track;
  /** Canvas-space geometry of the drawn layer. */
  ax: number;
  ay: number;
  w: number;
  h: number;
  rot: number;
  scale: number;
  anchorX: number;
  anchorY: number;
}

function place(clip: Clip, track: Track, frame: number, tl: TimelineData): Placed {
  const t = transformAt(clip, frame - clip.start);
  const r = layerRect(t, tl);
  return {
    clip,
    track,
    ax: r.left + t.anchorX * r.width,
    ay: r.top + t.anchorY * r.height,
    w: r.width,
    h: r.height,
    rot: t.rotation,
    scale: Math.abs(t.scale),
    anchorX: t.anchorX,
    anchorY: t.anchorY,
  };
}

/** Visible visual clips at a frame, front-most first. */
function layersAt(tl: TimelineData, frame: number): { clip: Clip; track: Track }[] {
  const out: { clip: Clip; track: Track }[] = [];
  for (const track of tl.tracks) {
    if (track.hidden || track.kind === 'audio') continue;
    for (const clip of track.clips) if (VISUAL_TYPES.has(clip.type) && frame >= clip.start && frame < clip.start + clip.duration) out.push({ clip, track });
  }
  return out;
}

function hit(p: Placed, x: number, y: number): boolean {
  const rad = (-p.rot * Math.PI) / 180;
  const dx = x - p.ax;
  const dy = y - p.ay;
  const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / (p.scale || 1) + p.anchorX * p.w;
  const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / (p.scale || 1) + p.anchorY * p.h;
  return lx >= 0 && lx <= p.w && ly >= 0 && ly <= p.h;
}

/** Writes an animatable transform value: keyframed properties get a keyframe at the playhead. */
export function setTransformProp(tl: TimelineData, clipId: string, prop: Extract<AnimatableProp, 'x' | 'y' | 'scale' | 'rotation' | 'opacity'>, value: number, localFrame: number) {
  const found = timelineOps.findClip(tl, clipId);
  if (!found) return;
  const { clip } = found;
  if (clip.keyframes[prop]?.length) timelineOps.setKeyframe(tl, clipId, prop, localFrame, value);
  else clip.transform[prop] = value;
}

export function Preview() {
  const tl = useEditor((s) => s.timeline);
  const assets = useEditor((s) => s.assets);
  const solo = useEditor((s) => s.soloTrackIds);
  const loop = usePlayhead((s) => s.loop);
  const ref = useRef<PlayerRef>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [safe, setSafe] = useState(false);

  const resolved = useMemo<AssetMap>(() => Object.fromEntries(Object.values(assets).map((a) => [a.id, toResolvedAsset(a)])), [assets]);
  const options = useMemo(() => ({ showPlaceholders: true, soloTrackIds: solo }), [solo]);
  const inputProps = useMemo(() => ({ timeline: tl, assets: resolved, options }), [tl, resolved, options]);
  const duration = timelineOps.timelineDuration(tl);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const p = ref.current;
    player.attach(p);
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => usePlayhead.setState({ frame: e.detail.frame });
    const onPlay = () => usePlayhead.setState({ playing: true });
    const onPause = () => usePlayhead.setState({ playing: false });
    p.addEventListener('frameupdate', onFrame);
    p.addEventListener('seeked', onFrame);
    p.addEventListener('play', onPlay);
    p.addEventListener('pause', onPause);
    p.addEventListener('ended', onPause);
    p.seekTo(Math.min(usePlayhead.getState().frame, duration - 1));
    if (usePlayhead.getState().muted) p.mute();
    return () => {
      p.removeEventListener('frameupdate', onFrame);
      p.removeEventListener('seeked', onFrame);
      p.removeEventListener('play', onPlay);
      p.removeEventListener('pause', onPause);
      p.removeEventListener('ended', onPause);
      player.attach(null);
    };
    // The player instance is stable; re-attaching on duration changes is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = box.w && box.h ? Math.min(box.w / tl.width, box.h / tl.height) : 0;
  const view = { w: Math.floor(tl.width * k), h: Math.floor(tl.height * k) };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={stage} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-1">
        {k > 0 && (
          <div className="relative shadow-2xl ring-1 ring-white/10" style={{ width: view.w, height: view.h, background: tl.background === 'transparent' ? CHECKER : undefined }}>
            <Player
              ref={ref}
              component={TimelineComposition}
              inputProps={inputProps}
              durationInFrames={duration}
              fps={tl.fps}
              compositionWidth={tl.width}
              compositionHeight={tl.height}
              style={{ width: view.w, height: view.h }}
              loop={loop}
              clickToPlay={false}
              doubleClickToFullscreen={false}
              spaceKeyToPlayOrPause={false}
              moveToBeginningWhenEnded={false}
              numberOfSharedAudioTags={8}
              acknowledgeRemotionLicense
              errorFallback={({ error }) => <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">Preview error: {error.message}</div>}
            />
            <Overlay k={k} />
            {safe && <SafeZones aspect={tl.width / tl.height} />}
          </div>
        )}
      </div>
      <Transport duration={duration} fps={tl.fps} safe={safe} onSafe={setSafe} />
    </div>
  );
}

function SafeZones({ aspect }: { aspect: number }) {
  const vertical = aspect < 0.8;
  const zone = 'absolute bg-red-500/15 outline outline-1 outline-dashed outline-red-400/60 text-[10px] font-medium text-red-100/90 p-1';
  return (
    <div className="pointer-events-none absolute inset-0">
      {vertical ? (
        <>
          <div className={zone} style={{ left: 0, right: 0, top: 0, height: '9%' }}>Status bar & tabs</div>
          <div className={zone} style={{ right: 0, top: '42%', width: '14%', height: '38%' }}>Buttons</div>
          <div className={zone} style={{ left: 0, right: 0, bottom: 0, height: '20%' }}>Caption, name & CTA</div>
        </>
      ) : (
        <div className="absolute inset-[5%] outline outline-1 outline-dashed outline-red-400/60" />
      )}
    </div>
  );
}

function Transport({ duration, fps, safe, onSafe }: { duration: number; fps: number; safe: boolean; onSafe: (v: boolean) => void }) {
  const frame = usePlayhead((s) => s.frame);
  const playing = usePlayhead((s) => s.playing);
  const loop = usePlayhead((s) => s.loop);
  const muted = usePlayhead((s) => s.muted);
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-t px-2">
      <div className="flex items-center">
        <Tip content="Go to start (Home)">
          <Button size="icon-sm" variant="ghost" onClick={() => player.seek(0)} aria-label="Go to start">
            <SkipBack />
          </Button>
        </Tip>
        <Tip content="Previous frame (←)">
          <Button size="icon-sm" variant="ghost" onClick={() => player.step(-1)} aria-label="Previous frame">
            <StepBack />
          </Button>
        </Tip>
        <Button size="icon" variant="secondary" className="mx-1 rounded-full" onClick={() => player.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="fill-current" /> : <Play className="translate-x-px fill-current" />}
        </Button>
        <Tip content="Next frame (→)">
          <Button size="icon-sm" variant="ghost" onClick={() => player.step(1)} aria-label="Next frame">
            <StepForward />
          </Button>
        </Tip>
        <Tip content="Go to end (End)">
          <Button size="icon-sm" variant="ghost" onClick={() => player.seek(duration - 1)} aria-label="Go to end">
            <SkipForward />
          </Button>
        </Tip>
      </div>
      <div className="ml-2 font-mono text-xs tabular-nums">
        <span>{timecode(frame, fps)}</span>
        <span className="text-muted-foreground"> / {timecode(duration, fps)}</span>
      </div>
      <div className="ml-auto flex items-center">
        <Tip content="Platform safe zones">
          <Button size="icon-sm" variant="ghost" className={cn(safe && 'bg-accent text-primary')} onClick={() => onSafe(!safe)} aria-label="Toggle safe zones" aria-pressed={safe}>
            <ScanLine />
          </Button>
        </Tip>
        <Tip content="Loop">
          <Button size="icon-sm" variant="ghost" className={cn(loop && 'bg-accent text-primary')} onClick={() => player.setLoop(!loop)} aria-label="Loop" aria-pressed={loop}>
            <Repeat />
          </Button>
        </Tip>
        <Tip content={muted ? 'Unmute' : 'Mute'}>
          <Button size="icon-sm" variant="ghost" onClick={() => player.setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
        </Tip>
        <Tip content="Full screen">
          <Button size="icon-sm" variant="ghost" onClick={() => player.fullscreen()} aria-label="Full screen">
            <Maximize />
          </Button>
        </Tip>
      </div>
    </div>
  );
}

/** Click to select the layer under the pointer; drag, scale, resize and rotate the selected layers. */
function Overlay({ k }: { k: number }) {
  const tl = useEditor((s) => s.timeline);
  const selection = useEditor((s) => s.selection);
  const frame = usePlayhead((s) => s.frame);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  const selected = useMemo(() => {
    const ids = new Set(selection);
    return layersAt(tl, frame)
      .filter(({ clip }) => ids.has(clip.id))
      .map(({ clip, track }) => place(clip, track, frame, tl));
  }, [tl, selection, frame]);

  const pick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / k;
    const y = (e.clientY - rect.top) / k;
    const target = layersAt(tl, frame)
      .map(({ clip, track }) => place(clip, track, frame, tl))
      .find((p) => hit(p, x, y));
    const { select } = useEditor.getState();
    if (!target) select([]);
    else select([target.clip.id], e.shiftKey ? 'toggle' : 'replace');
  };

  return (
    <div className="absolute inset-0 overflow-hidden" onPointerDown={pick}>
      {guides.x && <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px bg-fuchsia-400" />}
      {guides.y && <div className="pointer-events-none absolute right-0 left-0 top-1/2 h-px bg-fuchsia-400" />}
      {selected.map((p) => (
        <Handles key={p.clip.id} p={p} k={k} frame={frame} onGuides={setGuides} />
      ))}
    </div>
  );
}

type Edge = 'n' | 's' | 'e' | 'w';
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
const EDGES: Edge[] = ['n', 's', 'e', 'w'];

function Handles({ p, k, frame, onGuides }: { p: Placed; k: number; frame: number; onGuides: (g: { x: boolean; y: boolean }) => void }) {
  const { clip, track } = p;
  const locked = clip.locked || track.locked;
  const sw = p.w * p.scale;
  const sh = p.h * p.scale;
  const left = p.ax - p.anchorX * sw;
  const top = p.ay - p.anchorY * sh;
  const local = frame - clip.start;
  const edit = useEditor.getState().edit;
  const boxResize = clip.type !== 'video' && clip.type !== 'image';

  const drag = (e: ReactPointerEvent, onMove: (dx: number, dy: number, ev: PointerEvent) => void, onEnd?: () => void) => {
    if (locked || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => onMove((ev.clientX - sx) / k, (ev.clientY - sy) / k, ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onEnd?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const startMove = (e: ReactPointerEvent) => {
    if (e.shiftKey) return;
    const t0 = transformAt(clip, local);
    const tlNow = useEditor.getState().timeline;
    drag(
      e,
      (dx, dy) => {
        let x = t0.x + dx / tlNow.width;
        let y = t0.y + dy / tlNow.height;
        const snapX = Math.abs(x * tlNow.width * k) < SNAP_PX;
        const snapY = Math.abs(y * tlNow.height * k) < SNAP_PX;
        if (snapX) x = 0;
        if (snapY) y = 0;
        onGuides({ x: snapX, y: snapY });
        edit(
          (d) => {
            setTransformProp(d, clip.id, 'x', x, local);
            setTransformProp(d, clip.id, 'y', y, local);
          },
          { coalesce: `move:${clip.id}` },
        );
      },
      () => onGuides({ x: false, y: false }),
    );
  };

  const startScale = (e: ReactPointerEvent) => {
    const el = (e.currentTarget as HTMLElement).closest('[data-overlay-root]') as HTMLElement | null;
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    const ax = rect.left + p.ax * k;
    const ay = rect.top + p.ay * k;
    const d0 = Math.hypot(e.clientX - ax, e.clientY - ay) || 1;
    const s0 = transformAt(clip, local).scale;
    drag(e, (_dx, _dy, ev) => {
      const ratio = Math.hypot(ev.clientX - ax, ev.clientY - ay) / d0;
      const next = Math.min(20, Math.max(0.02, Math.round(s0 * ratio * 1000) / 1000));
      edit((d) => setTransformProp(d, clip.id, 'scale', next, local), { coalesce: `scale:${clip.id}` });
    });
  };

  const startRotate = (e: ReactPointerEvent) => {
    const el = (e.currentTarget as HTMLElement).closest('[data-overlay-root]') as HTMLElement | null;
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    const ax = rect.left + p.ax * k;
    const ay = rect.top + p.ay * k;
    const a0 = Math.atan2(e.clientY - ay, e.clientX - ax);
    const r0 = transformAt(clip, local).rotation;
    drag(e, (_dx, _dy, ev) => {
      let r = r0 + ((Math.atan2(ev.clientY - ay, ev.clientX - ax) - a0) * 180) / Math.PI;
      r = ev.shiftKey ? Math.round(r / 15) * 15 : Math.round(r * 10) / 10;
      edit((d) => setTransformProp(d, clip.id, 'rotation', r, local), { coalesce: `rotate:${clip.id}` });
    });
  };

  // Resizes the layer box keeping the opposite edge where it is, in the layer's rotated frame.
  const startResize = (edge: Edge) => (e: ReactPointerEvent) => {
    const tlNow = useEditor.getState().timeline;
    const t0 = transformAt(clip, local);
    const W0 = t0.width * tlNow.width;
    const H0 = t0.height * tlNow.height;
    const s = Math.abs(t0.scale) || 1;
    const th = (t0.rotation * Math.PI) / 180;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    drag(e, (dx, dy) => {
      const alongX = dx * cos + dy * sin;
      const alongY = -dx * sin + dy * cos;
      let dW = 0;
      let dH = 0;
      if (edge === 'e') dW = alongX / s;
      if (edge === 'w') dW = -alongX / s;
      if (edge === 's') dH = alongY / s;
      if (edge === 'n') dH = -alongY / s;
      const W = Math.min(2, Math.max(0.02, (W0 + dW) / tlNow.width)) * tlNow.width;
      const H = Math.min(2, Math.max(0.02, (H0 + dH) / tlNow.height)) * tlNow.height;
      dW = W - W0;
      dH = H - H0;
      let dcx = 0;
      let dcy = 0;
      if (edge === 'e') {
        dcx = s * t0.anchorX * dW * cos - (t0.anchorX - 0.5) * dW;
        dcy = s * t0.anchorX * dW * sin;
      } else if (edge === 'w') {
        dcx = -s * (1 - t0.anchorX) * dW * cos - (t0.anchorX - 0.5) * dW;
        dcy = -s * (1 - t0.anchorX) * dW * sin;
      } else if (edge === 's') {
        dcx = -s * t0.anchorY * dH * sin;
        dcy = s * t0.anchorY * dH * cos - (t0.anchorY - 0.5) * dH;
      } else {
        dcx = s * (1 - t0.anchorY) * dH * sin;
        dcy = -s * (1 - t0.anchorY) * dH * cos - (t0.anchorY - 0.5) * dH;
      }
      edit(
        (d) => {
          const c = timelineOps.findClip(d, clip.id)?.clip;
          if (!c) return;
          c.transform.width = W / tlNow.width;
          c.transform.height = H / tlNow.height;
          setTransformProp(d, clip.id, 'x', t0.x + dcx / tlNow.width, local);
          setTransformProp(d, clip.id, 'y', t0.y + dcy / tlNow.height, local);
        },
        { coalesce: `resize:${clip.id}` },
      );
    });
  };

  const handle = 'absolute size-2.5 rounded-[3px] border border-primary bg-white shadow';
  return (
    <div
      data-overlay-root
      className="pointer-events-none absolute inset-0"
      onDoubleClick={() => clip.type === 'text' && window.dispatchEvent(new CustomEvent('af:focus-text'))}
    >
      <div
        className={cn('pointer-events-auto absolute outline outline-[1.5px] outline-primary', locked ? 'cursor-not-allowed outline-dashed' : 'cursor-move')}
        style={{ left: left * k, top: top * k, width: sw * k, height: sh * k, transform: `rotate(${p.rot}deg)`, transformOrigin: `${p.anchorX * 100}% ${p.anchorY * 100}%` }}
        onPointerDown={startMove}
        onDoubleClick={() => clip.type === 'text' && window.dispatchEvent(new CustomEvent('af:focus-text'))}
      >
        {!locked && (
          <>
            {CORNERS.map((c) => (
              <span
                key={c}
                onPointerDown={startScale}
                className={cn(handle, c === 'nw' && '-top-1.5 -left-1.5 cursor-nwse-resize', c === 'ne' && '-top-1.5 -right-1.5 cursor-nesw-resize', c === 'sw' && '-bottom-1.5 -left-1.5 cursor-nesw-resize', c === 'se' && '-right-1.5 -bottom-1.5 cursor-nwse-resize')}
              />
            ))}
            {boxResize &&
              EDGES.map((edge) => (
                <span
                  key={edge}
                  onPointerDown={startResize(edge)}
                  className={cn(
                    'absolute rounded-full border border-primary bg-white shadow',
                    edge === 'n' && '-top-1 left-1/2 h-1.5 w-4 -translate-x-1/2 cursor-ns-resize',
                    edge === 's' && '-bottom-1 left-1/2 h-1.5 w-4 -translate-x-1/2 cursor-ns-resize',
                    edge === 'e' && 'top-1/2 -right-1 h-4 w-1.5 -translate-y-1/2 cursor-ew-resize',
                    edge === 'w' && 'top-1/2 -left-1 h-4 w-1.5 -translate-y-1/2 cursor-ew-resize',
                  )}
                />
              ))}
            <span onPointerDown={startRotate} className="absolute -top-7 left-1/2 size-3.5 -translate-x-1/2 cursor-grab rounded-full border border-primary bg-white shadow" title="Rotate (Shift snaps to 15°)" />
            <span className="pointer-events-none absolute -top-4 left-1/2 h-3 w-px -translate-x-1/2 bg-primary" />
          </>
        )}
      </div>
    </div>
  );
}
