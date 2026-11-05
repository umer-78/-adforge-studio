'use client';

import { AlignCenterHorizontal, AlignCenterVertical, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, Copy, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ASPECT_SIZES,
  BLEND_MODES,
  emptyPlaceholders,
  sourceSpan,
  sourceTimeAt,
  timelineOps,
  transformSchema,
  type AspectRatio,
  type Clip,
  type MediaClip,
  type TimelineData,
} from '@adforge/core';
import { AssetPicker } from '@/components/app/asset-picker';
import { Button } from '@/components/ui/button';
import { ColorInput } from '@/components/ui/color-input';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBrandColors, useBrandKits } from '@/lib/hooks/use-brand-kits';
import type { AssetView } from '@/lib/types';
import { cn, qs } from '@/lib/utils';
import { deleteSelection, duplicateSelection, sourceDurationS } from './actions';
import { animatedValue, KeyframeToggle, NumberInput, patchClip, patchTimeline, Row, Section, setAnimated, SliderField, Toggle, useLocalFrame } from './controls';
import { AudioSection, EffectsSection, MaskSection, TransitionsSection } from './inspector-fx';
import { CaptionsSection, MotionSection, ShapeSection, TextSection } from './inspector-style';
import { player } from './playhead';
import { useEditor } from './store';
import { CLIP_ICON, clipLabel, timecode } from './utils';

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const tl = useEditor((s) => s.timeline);
  if (selection.length > 1) return <MultiInspector count={selection.length} />;
  const found = selection[0] ? timelineOps.findClip(tl, selection[0]) : null;
  if (!found) return <TimelineSettings />;
  return <ClipInspector key={found.clip.id} clip={found.clip} locked={found.track.locked} />;
}

function MultiInspector({ count }: { count: number }) {
  return (
    <div className="space-y-3 p-4">
      <div className="text-sm font-medium">{count} clips selected</div>
      <p className="text-xs text-muted-foreground">Drag any of them to move them together, or use the arrow keys with Alt to nudge by a frame.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={duplicateSelection}>
          <Copy /> Duplicate
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteSelection(false)}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

const ASPECTS = Object.entries(ASPECT_SIZES) as [AspectRatio, (typeof ASPECT_SIZES)[AspectRatio]][];

function TimelineSettings() {
  const tl = useEditor((s) => s.timeline);
  const name = useEditor((s) => s.name);
  const kits = useBrandKits();
  const brand = useBrandColors();
  const slots = emptyPlaceholders(tl);
  const clips = tl.tracks.reduce((n, t) => n + t.clips.length, 0);
  const aspect = ASPECTS.find(([, s]) => s.width === tl.width && s.height === tl.height)?.[0] ?? 'custom';

  return (
    <div>
      <Section title="Edit">
        <Row label="Name">
          <Input value={name} maxLength={200} onChange={(e) => useEditor.getState().rename(e.target.value)} className="h-8 text-[13px]" />
        </Row>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
          <div className="rounded-lg border p-2">
            <div className="font-mono text-sm text-foreground">{timecode(timelineOps.timelineDuration(tl), tl.fps)}</div>
            Length
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-sm text-foreground">{tl.tracks.length}</div>
            Tracks
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-sm text-foreground">{clips}</div>
            Clips
          </div>
        </div>
      </Section>
      {slots.length > 0 && (
        <Section title={`Empty slots (${slots.length})`}>
          <p className="text-xs text-muted-foreground">This edit came from a template. Select a slot on the timeline to fill it with a file, or generate one from its prompt.</p>
          {slots.map((s) => (
            <button
              key={s.clipId}
              type="button"
              onClick={() => {
                const c = timelineOps.findClip(tl, s.clipId)?.clip;
                useEditor.getState().select([s.clipId]);
                if (c) player.seek(c.start);
              }}
              className="block w-full rounded-lg border border-dashed px-3 py-2 text-left text-xs transition hover:border-primary/60"
            >
              <span className="font-medium">{s.label}</span>
              {s.prompt && <span className="mt-0.5 line-clamp-2 block text-muted-foreground">{s.prompt}</span>}
            </button>
          ))}
        </Section>
      )}
      <Section title="Canvas">
        <Segmented
          size="sm"
          value={aspect}
          onChange={(v) => {
            if (v === 'custom') return;
            const size = ASPECT_SIZES[v as AspectRatio];
            patchTimeline((d) => timelineOps.resizeCanvas(d, size.width, size.height));
          }}
          options={[...ASPECTS.map(([a]) => ({ value: a, label: a })), ...(aspect === 'custom' ? [{ value: 'custom' as const, label: 'Custom' }] : [])]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Row label="Width">
            <NumberInput value={tl.width} min={16} max={7680} digits={0} suffix="px" onChange={(v) => patchTimeline((d) => timelineOps.resizeCanvas(d, Math.round(v / 2) * 2, d.height))} />
          </Row>
          <Row label="Height">
            <NumberInput value={tl.height} min={16} max={7680} digits={0} suffix="px" onChange={(v) => patchTimeline((d) => timelineOps.resizeCanvas(d, d.width, Math.round(v / 2) * 2))} />
          </Row>
        </div>
        <Row label="Frame rate">
          <Select
            size="sm"
            value={String(tl.fps)}
            onValueChange={(v) => patchTimeline((d) => rescaleFps(d, Number(v)))}
            options={[24, 25, 30, 50, 60].map((f) => ({ value: String(f), label: `${f} fps` }))}
          />
        </Row>
        <Row label="Background">
          <div className="space-y-2">
            <Toggle label="Transparent" hint="Export with ProRes 4444 to keep it." checked={tl.background === 'transparent'} onChange={(v) => patchTimeline((d) => (d.background = v ? 'transparent' : '#000000'))} />
            {tl.background !== 'transparent' && <ColorInput value={tl.background} swatches={brand} onChange={(v) => patchTimeline((d) => (d.background = v), 'background')} />}
          </div>
        </Row>
      </Section>
      <Section title="Sound">
        <SliderField label="Master" value={tl.master.volume} min={0} max={2} step={0.01} scale={100} suffix="%" onChange={(v) => patchTimeline((d) => (d.master.volume = v), 'master')} />
        <SliderField label="Music duck" value={tl.master.duckAmount} min={0} max={1} step={0.01} scale={100} suffix="%" onChange={(v) => patchTimeline((d) => (d.master.duckAmount = v), 'duck')} />
        <Toggle label="Normalize loudness" hint="Exports land at a steady level for social feeds." checked={tl.master.loudnorm} onChange={(v) => patchTimeline((d) => (d.master.loudnorm = v))} />
        {tl.master.loudnorm && (
          <Row label="Target">
            <Select
              size="sm"
              value={String(tl.master.targetLufs)}
              onValueChange={(v) => patchTimeline((d) => (d.master.targetLufs = Number(v)))}
              options={[
                { value: '-14', label: '−14 LUFS · social and streaming' },
                { value: '-16', label: '−16 LUFS · podcasts, softer' },
                { value: '-23', label: '−23 LUFS · broadcast' },
              ]}
            />
          </Row>
        )}
      </Section>
      <Section title="Brand & labels">
        <Row label="Brand kit">
          <Select
            size="sm"
            value={tl.brandKitId ?? 'none'}
            onValueChange={(v) => patchTimeline((d) => (d.brandKitId = v === 'none' ? null : v))}
            options={[{ value: 'none', label: 'None' }, ...(kits.data ?? []).map((k) => ({ value: k.id, label: k.name }))]}
          />
        </Row>
        <Toggle label="“AI-generated” label" hint="Burns a small disclosure label into exports." checked={tl.aiLabel} onChange={(v) => patchTimeline((d) => (d.aiLabel = v))} />
      </Section>
    </div>
  );
}

/** Keeps every clip at the same time in seconds when the frame rate changes. */
function rescaleFps(tl: TimelineData, fps: number) {
  if (fps === tl.fps) return;
  const k = fps / tl.fps;
  const f = (n: number) => Math.round(n * k);
  tl.fps = fps;
  for (const t of tl.tracks)
    for (const c of t.clips) {
      c.start = f(c.start);
      c.duration = Math.max(1, f(c.duration));
      for (const list of Object.values(c.keyframes)) for (const kf of list ?? []) kf.frame = f(kf.frame);
      if (c.transitionIn) c.transitionIn.duration = Math.max(1, f(c.transitionIn.duration));
      if (c.transitionOut) c.transitionOut.duration = Math.max(1, f(c.transitionOut.duration));
      if (c.type === 'text') {
        c.animation.inDuration = Math.min(120, f(c.animation.inDuration));
        c.animation.outDuration = Math.min(120, f(c.animation.outDuration));
      }
    }
  for (const m of tl.markers) m.frame = f(m.frame);
}

const TAB_LABEL: Record<string, string> = { clip: 'Clip', text: 'Text', captions: 'Captions', shape: 'Shape', motion: 'Motion', transform: 'Layout', audio: 'Audio', effects: 'Effects', transitions: 'Transitions' };

function tabsFor(clip: Clip): string[] {
  switch (clip.type) {
    case 'video':
      return ['clip', 'transform', 'audio', 'effects', 'transitions'];
    case 'image':
      return ['clip', 'transform', 'effects', 'transitions'];
    case 'audio':
      return ['clip', 'audio'];
    case 'text':
      return ['text', 'transform', 'effects', 'transitions'];
    case 'captions':
      return ['captions', 'transform'];
    case 'shape':
      return ['shape', 'transform', 'effects', 'transitions'];
    case 'motion':
      return ['motion', 'transform', 'transitions'];
    case 'adjustment':
      return ['clip', 'effects'];
  }
}

function ClipInspector({ clip, locked }: { clip: Clip; locked: boolean }) {
  const tabs = tabsFor(clip);
  const [tab, setTab] = useState(tabs[0]!);
  const [focusTick, setFocusTick] = useState(0);
  // Double-clicking a text layer on the canvas jumps to its text field.
  useEffect(() => {
    if (clip.type !== 'text') return;
    const onFocus = () => {
      setTab('text');
      setFocusTick((n) => n + 1);
    };
    window.addEventListener('af:focus-text', onFocus);
    return () => window.removeEventListener('af:focus-text', onFocus);
  }, [clip.type]);
  const asset = useEditor((s) => ((clip.type === 'video' || clip.type === 'image' || clip.type === 'audio') && clip.assetId ? s.assets[clip.assetId] : undefined));
  const Icon = CLIP_ICON[clip.type];
  const active = tabs.includes(tab) ? tab : tabs[0]!;
  return (
    <div className={cn(locked && 'pointer-events-none opacity-60')}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={clip.name ?? ''}
          placeholder={clipLabel(clip, asset ? { [asset.id]: asset } : {})}
          maxLength={200}
          onChange={(e) => patchClip(clip.id, (c) => (c.name = e.target.value || undefined), 'name')}
          className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium outline-none placeholder:text-foreground"
          aria-label="Clip name"
        />
        {locked && <span className="text-[11px] text-muted-foreground">Track locked</span>}
      </div>
      <Tabs value={active} onValueChange={setTab}>
        <TabsList className="mx-3 mt-3 flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t} className="h-7 rounded-md px-2.5 text-xs">
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="clip" className="mt-2">
          <TimingSection clip={clip} />
          {(clip.type === 'video' || clip.type === 'image' || clip.type === 'audio') && <MediaSection clip={clip} asset={asset} />}
        </TabsContent>
        <TabsContent value="text" className="mt-2">
          {clip.type === 'text' && <TextSection clip={clip} focusTick={focusTick} />}
          <TimingSection clip={clip} />
        </TabsContent>
        <TabsContent value="captions" className="mt-2">
          {clip.type === 'captions' && <CaptionsSection clip={clip} />}
          <TimingSection clip={clip} />
        </TabsContent>
        <TabsContent value="shape" className="mt-2">
          {clip.type === 'shape' && <ShapeSection clip={clip} />}
          <TimingSection clip={clip} />
        </TabsContent>
        <TabsContent value="motion" className="mt-2">
          {clip.type === 'motion' && <MotionSection clip={clip} />}
          <TimingSection clip={clip} />
        </TabsContent>
        <TabsContent value="transform" className="mt-2">
          <TransformSection clip={clip} />
          <MaskSection clip={clip} />
        </TabsContent>
        <TabsContent value="audio" className="mt-2">
          {(clip.type === 'video' || clip.type === 'audio') && <AudioSection clip={clip} />}
        </TabsContent>
        <TabsContent value="effects" className="mt-2">
          <EffectsSection clip={clip} />
        </TabsContent>
        <TabsContent value="transitions" className="mt-2">
          <TransitionsSection clip={clip} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TimingSection({ clip }: { clip: Clip }) {
  const fps = useEditor((s) => s.timeline.fps);
  const seconds = (f: number) => f / fps;
  return (
    <Section title="Timing">
      <div className="grid grid-cols-2 gap-2">
        <Row label="Start" className="grid-cols-[2.5rem_1fr]">
          <NumberInput
            value={seconds(clip.start)}
            min={0}
            step={1 / fps}
            digits={2}
            suffix="s"
            onChange={(v) =>
              patchClip(clip.id, (_c, tl) => {
                timelineOps.moveClip(tl, clip.id, { start: Math.round(v * fps) });
              })
            }
          />
        </Row>
        <Row label="Length" className="grid-cols-[2.5rem_1fr]">
          <NumberInput
            value={seconds(clip.duration)}
            min={1 / fps}
            step={1 / fps}
            digits={2}
            suffix="s"
            onChange={(v) =>
              patchClip(clip.id, (c, tl) => {
                timelineOps.trimClip(tl, clip.id, 'end', Math.round(v * fps) - c.duration, sourceDurationS(c));
              })
            }
          />
        </Row>
      </div>
      {(clip.type === 'video' || clip.type === 'audio') && <SpeedControls clip={clip} />}
    </Section>
  );
}

const RAMPS: { id: string; label: string; points: { at: number; speed: number }[] }[] = [
  { id: 'none', label: 'Constant', points: [] },
  { id: 'hero', label: 'Hero (fast → slow → fast)', points: [{ at: 0, speed: 2.5 }, { at: 0.4, speed: 0.35 }, { at: 0.6, speed: 0.35 }, { at: 1, speed: 2.5 }] },
  { id: 'slowdown', label: 'Slow down', points: [{ at: 0, speed: 2 }, { at: 1, speed: 0.4 }] },
  { id: 'speedup', label: 'Speed up', points: [{ at: 0, speed: 0.4 }, { at: 1, speed: 2.5 }] },
  { id: 'impact', label: 'Impact (slow middle)', points: [{ at: 0, speed: 1 }, { at: 0.45, speed: 0.25 }, { at: 0.55, speed: 0.25 }, { at: 1, speed: 1 }] },
];

function SpeedControls({ clip }: { clip: Extract<Clip, { type: 'video' | 'audio' }> }) {
  const fps = useEditor((s) => s.timeline.fps);
  const local = useLocalFrame(clip);
  const srcS = sourceDurationS(clip);
  const isVideo = clip.type === 'video';
  const ramp = isVideo ? (RAMPS.find((r) => JSON.stringify(r.points) === JSON.stringify(clip.speedRamp))?.id ?? (clip.speedRamp.length ? 'custom' : 'none')) : 'none';
  return (
    <>
      <SliderField
        label="Speed"
        value={clip.speed}
        min={isVideo ? 0.1 : 0.25}
        max={isVideo ? 16 : 4}
        step={0.05}
        digits={2}
        suffix="×"
        disabled={isVideo && clip.speedRamp.length > 0}
        onChange={(v) => patchClip(clip.id, (_c, tl) => timelineOps.setSpeed(tl, clip.id, v), 'speed')}
      />
      {isVideo && (
        <>
          <Row label="Speed ramp">
            <Select
              size="sm"
              value={ramp}
              onValueChange={(id) =>
                patchClip(clip.id, (c) => {
                  if (c.type !== 'video') return;
                  const def = RAMPS.find((r) => r.id === id);
                  if (!def) return;
                  c.speedRamp = def.points;
                  if (!def.points.length) return;
                  // Keep the ramped clip inside its source: shorten it when the ramp would run past the end.
                  const span = sourceSpan(c, fps);
                  const room = srcS != null ? srcS - c.trimStart : Infinity;
                  if (span > room && room > 0) c.duration = Math.max(1, Math.floor(c.duration * (room / span)));
                })
              }
              options={[...RAMPS.map((r) => ({ value: r.id, label: r.label })), ...(ramp === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]}
            />
          </Row>
          <Toggle label="Reverse" checked={clip.reverse} onChange={(v) => patchClip(clip.id, (c) => c.type === 'video' && (c.reverse = v))} />
          <Toggle
            label="Freeze frame"
            hint={clip.freezeAt != null ? `Holding ${clip.freezeAt.toFixed(2)}s of the source` : 'Hold the frame under the playhead for the whole clip'}
            checked={clip.freezeAt != null}
            onChange={(v) =>
              patchClip(clip.id, (c) => {
                if (c.type !== 'video') return;
                c.freezeAt = v ? Math.max(0, sourceTimeAt({ ...c, freezeAt: null }, local ?? 0, fps)) : null;
              })
            }
          />
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        Uses {(clip.type === 'video' ? sourceSpan(clip, fps) : (clip.duration / fps) * clip.speed).toFixed(2)}s of the source from {clip.trimStart.toFixed(2)}s
        {srcS ? ` (file is ${srcS.toFixed(1)}s)` : ''}.
      </p>
    </>
  );
}

function MediaSection({ clip, asset }: { clip: MediaClip; asset: AssetView | undefined }) {
  const [picking, setPicking] = useState(false);
  const fps = useEditor((s) => s.timeline.fps);
  const swap = (a: AssetView) => {
    useEditor.getState().mergeAssets([a]);
    patchClip(clip.id, (c) => {
      if (c.type !== 'video' && c.type !== 'image' && c.type !== 'audio') return;
      c.assetId = a.id;
      c.placeholder = null;
      if ((c.type === 'video' || c.type === 'audio') && a.durationS) {
        c.trimStart = 0;
        c.duration = Math.min(c.duration, Math.max(1, Math.floor((a.durationS / c.speed) * fps)));
      }
    });
  };
  const types = clip.type === 'audio' ? (['audio'] as const) : (['video', 'image'] as const);
  return (
    <Section title={clip.placeholder ? 'Fill this slot' : 'Source'}>
      {clip.placeholder ? (
        <div className="space-y-2 rounded-lg border border-dashed p-3 text-xs">
          <div className="font-medium">{clip.placeholder.label}</div>
          {clip.placeholder.prompt && <p className="text-muted-foreground">{clip.placeholder.prompt}</p>}
          <div className="flex gap-2">
            <Button size="xs" variant="secondary" onClick={() => setPicking(true)}>
              Choose a file
            </Button>
            {clip.placeholder.prompt && (
              <Button size="xs" variant="ghost" asChild>
                <Link href={clip.type === 'video' ? `/generate${qs({ prompt: clip.placeholder.prompt, mode: 't2v' })}` : clip.type === 'audio' ? `/music${qs({ prompt: clip.placeholder.prompt })}` : `/photo${qs({ prompt: clip.placeholder.prompt, mode: 't2i' })}`} target="_blank">
                  <Sparkles /> Generate it
                </Link>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{asset?.name ?? 'Missing file'}</span>
          <Button size="xs" variant="secondary" onClick={() => setPicking(true)}>
            Replace
          </Button>
          {asset && (
            <Button size="xs" variant="ghost" asChild>
              <Link href={`/library/${asset.id}`} target="_blank">
                Open
              </Link>
            </Button>
          )}
        </div>
      )}
      <AssetPicker open={picking} onOpenChange={setPicking} types={[...types]} onPick={(picked) => picked[0] && swap(picked[0])} title={clip.placeholder ? `Fill “${clip.placeholder.label}”` : 'Replace media'} />
    </Section>
  );
}

const MOTION_PRESETS: { id: string; label: string }[] = [
  { id: 'zoom-in', label: 'Slow zoom in' },
  { id: 'zoom-out', label: 'Slow zoom out' },
  { id: 'pan-left', label: 'Pan left' },
  { id: 'pan-right', label: 'Pan right' },
  { id: 'pop', label: 'Pop in' },
  { id: 'fade', label: 'Fade in and out' },
];

function applyMotionPreset(clip: Clip, id: string) {
  patchClip(clip.id, (c) => {
    const end = c.duration;
    const s = c.transform.scale;
    switch (id) {
      case 'zoom-in':
        c.keyframes.scale = [
          { frame: 0, value: s, easing: 'linear' },
          { frame: end, value: s * 1.15, easing: 'linear' },
        ];
        break;
      case 'zoom-out':
        c.keyframes.scale = [
          { frame: 0, value: s * 1.15, easing: 'linear' },
          { frame: end, value: s, easing: 'linear' },
        ];
        break;
      case 'pan-left':
      case 'pan-right': {
        const dir = id === 'pan-left' ? -1 : 1;
        c.keyframes.scale = [{ frame: 0, value: Math.max(s, 1.15), easing: 'linear' }];
        c.keyframes.x = [
          { frame: 0, value: c.transform.x - dir * 0.05, easing: 'linear' },
          { frame: end, value: c.transform.x + dir * 0.05, easing: 'linear' },
        ];
        break;
      }
      case 'pop':
        c.keyframes.scale = [
          { frame: 0, value: s * 0.6, easing: 'easeOutBack' },
          { frame: Math.min(end, 10), value: s, easing: 'easeInOut' },
        ];
        c.keyframes.opacity = [
          { frame: 0, value: 0, easing: 'easeOut' },
          { frame: Math.min(end, 6), value: c.transform.opacity, easing: 'easeInOut' },
        ];
        break;
      case 'fade': {
        const f = Math.min(Math.floor(end / 3), 12);
        c.keyframes.opacity = [
          { frame: 0, value: 0, easing: 'easeOut' },
          { frame: f, value: c.transform.opacity, easing: 'linear' },
          { frame: end - f, value: c.transform.opacity, easing: 'easeIn' },
          { frame: end, value: 0, easing: 'linear' },
        ];
        break;
      }
    }
  });
}

function TransformSection({ clip }: { clip: Clip }) {
  const local = useLocalFrame(clip);
  const t = clip.transform;
  const box = clip.type !== 'video' && clip.type !== 'image';
  const media = clip.type === 'video' || clip.type === 'image';
  const prop = (p: 'x' | 'y' | 'scale' | 'rotation' | 'opacity') => animatedValue(clip, p, t[p], local);
  const set = (p: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', v: number) => setAnimated(clip, p, v, local, (c) => (c.transform[p] = v));
  const halfW = (t.width * prop('scale')) / 2;
  const halfH = (t.height * prop('scale')) / 2;
  const align = (axis: 'x' | 'y', value: number) => set(axis, value);
  return (
    <>
      <Section
        title="Position & size"
        aside={
          <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => patchClip(clip.id, (c) => ((c.transform = transformSchema.parse({ width: c.transform.width, height: c.transform.height, fit: c.transform.fit })), (c.keyframes = {})))}>
            <RotateCcw className="mr-1 inline size-3" />
            Reset
          </button>
        }
      >
        <div className="flex flex-wrap gap-1">
          {[
            { icon: ArrowLeftToLine, label: 'Align left', run: () => align('x', -0.5 + halfW) },
            { icon: AlignCenterVertical, label: 'Center horizontally', run: () => align('x', 0) },
            { icon: ArrowRightToLine, label: 'Align right', run: () => align('x', 0.5 - halfW) },
            { icon: ArrowUpToLine, label: 'Align top', run: () => align('y', -0.5 + halfH) },
            { icon: AlignCenterHorizontal, label: 'Center vertically', run: () => align('y', 0) },
            { icon: ArrowDownToLine, label: 'Align bottom', run: () => align('y', 0.5 - halfH) },
          ].map((a) => (
            <Button key={a.label} size="icon-xs" variant="secondary" onClick={a.run} aria-label={a.label} title={a.label}>
              <a.icon />
            </Button>
          ))}
        </div>
        <SliderField label="X" aside={<KeyframeToggle clip={clip} prop="x" value={prop('x')} local={local} />} value={prop('x')} min={-1} max={1} step={0.001} scale={100} digits={1} suffix="%" onChange={(v) => set('x', v)} />
        <SliderField label="Y" aside={<KeyframeToggle clip={clip} prop="y" value={prop('y')} local={local} />} value={prop('y')} min={-1} max={1} step={0.001} scale={100} digits={1} suffix="%" onChange={(v) => set('y', v)} />
        <SliderField label="Scale" aside={<KeyframeToggle clip={clip} prop="scale" value={prop('scale')} local={local} />} value={prop('scale')} min={0.05} max={5} step={0.01} scale={100} suffix="%" onChange={(v) => set('scale', v)} />
        <SliderField label="Rotation" aside={<KeyframeToggle clip={clip} prop="rotation" value={prop('rotation')} local={local} />} value={prop('rotation')} min={-180} max={180} step={0.5} digits={1} suffix="°" onChange={(v) => set('rotation', v)} />
        <SliderField label="Opacity" aside={<KeyframeToggle clip={clip} prop="opacity" value={prop('opacity')} local={local} />} value={prop('opacity')} min={0} max={1} step={0.01} scale={100} suffix="%" onChange={(v) => set('opacity', v)} />
        {box && (
          <>
            <SliderField label="Box width" value={t.width} min={0.02} max={2} step={0.005} scale={100} suffix="%" onChange={(v) => patchClip(clip.id, (c) => (c.transform.width = v), 'width')} />
            <SliderField label="Box height" value={t.height} min={0.02} max={2} step={0.005} scale={100} suffix="%" onChange={(v) => patchClip(clip.id, (c) => (c.transform.height = v), 'height')} />
          </>
        )}
        {clip.keyframes.blur?.length || clip.type !== 'adjustment' ? (
          <SliderField
            label="Blur"
            aside={<KeyframeToggle clip={clip} prop="blur" value={animatedValue(clip, 'blur', 0, local)} local={local} />}
            value={animatedValue(clip, 'blur', 0, local)}
            min={0}
            max={40}
            step={0.5}
            digits={1}
            suffix="px"
            disabled={!clip.keyframes.blur?.length}
            onChange={(v) => setAnimated(clip, 'blur', v, local, () => undefined)}
          />
        ) : null}
        {!clip.keyframes.blur?.length && <p className="-mt-1 text-[11px] text-muted-foreground">Add a blur keyframe (◆) to animate focus pulls.</p>}
      </Section>
      {media && (
        <Section title="Framing">
          <Row label="Fit">
            <Segmented
              size="sm"
              value={t.fit}
              onChange={(v) => patchClip(clip.id, (c) => (c.transform.fit = v))}
              options={[
                { value: 'cover', label: 'Fill' },
                { value: 'contain', label: 'Fit' },
                { value: 'fill', label: 'Stretch' },
              ]}
            />
          </Row>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <SliderField key={side} label={`Crop ${side}`} value={t.crop[side]} min={0} max={0.9} step={0.005} scale={100} suffix="%" onChange={(v) => patchClip(clip.id, (c) => (c.transform.crop[side] = v), `crop-${side}`)} />
          ))}
          <div className="flex gap-4">
            <Toggle label="Flip horizontal" checked={t.flipX} onChange={(v) => patchClip(clip.id, (c) => (c.transform.flipX = v))} />
            <Toggle label="Flip vertical" checked={t.flipY} onChange={(v) => patchClip(clip.id, (c) => (c.transform.flipY = v))} />
          </div>
        </Section>
      )}
      <Section title="Animate" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          {MOTION_PRESETS.map((p) => (
            <Button key={p.id} size="xs" variant="secondary" onClick={() => applyMotionPreset(clip, p.id)}>
              {p.label}
            </Button>
          ))}
        </div>
        {Object.keys(clip.keyframes).length > 0 && (
          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => patchClip(clip.id, (c) => (c.keyframes = {}))}>
            Remove all keyframes
          </Button>
        )}
      </Section>
      <Section title="Blending" defaultOpen={false}>
        <Row label="Blend mode">
          <Select size="sm" value={clip.blendMode} onValueChange={(v) => patchClip(clip.id, (c) => (c.blendMode = v as Clip['blendMode']))} options={BLEND_MODES.map((m) => ({ value: m, label: m.replace(/-/g, ' ').replace(/^\w/, (x) => x.toUpperCase()) }))} />
        </Row>
      </Section>
    </>
  );
}
