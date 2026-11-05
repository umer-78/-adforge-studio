'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Captions, ChevronDown, Ellipsis, Music2, Plus, RotateCcw, Scissors, Trash2, Unlink, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  defaultEffectParams,
  EASING_IDS,
  EFFECTS,
  EFFECTS_BY_ID,
  maskSchema,
  previousAdjacentClip,
  timelineOps,
  TRANSITIONS,
  TRANSITIONS_BY_ID,
  type AudioClip,
  type AudioSettings,
  type Clip,
  type EasingId,
  type EffectDef,
  type EffectInstance,
  type Mask,
  type ParamDef,
  type ParamValue,
  type Transition,
  type VideoClip,
} from '@adforge/core';
import { Button } from '@/components/ui/button';
import { ColorInput } from '@/components/ui/color-input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useBrandColors } from '@/lib/hooks/use-brand-kits';
import { api, errorMessage } from '@/lib/api-client';
import type { AssetView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { beatMarkers, captionsFromSpeech, cutSilences, detachAudio } from './actions';
import { animatedValue, KeyframeToggle, patchClip, Row, Section, setAnimated, SliderField, Toggle, useLocalFrame } from './controls';
import { useEditor } from './store';

/* ----------------------------------- Audio ------------------------------------ */

const ROLES: { value: AudioSettings['role']; label: string; hint: string }[] = [
  { value: 'auto', label: 'Automatic', hint: 'From the file' },
  { value: 'voice', label: 'Voice', hint: 'Music ducks under it' },
  { value: 'music', label: 'Music', hint: 'Ducks under voice' },
  { value: 'sfx', label: 'Sound effect', hint: 'Plays as is' },
];

export function AudioSection({ clip }: { clip: VideoClip | AudioClip }) {
  const fps = useEditor((s) => s.timeline.fps);
  const asset = useEditor((s) => (clip.assetId ? s.assets[clip.assetId] : undefined));
  const local = useLocalFrame(clip);
  const a = clip.audio;
  const volume = animatedValue(clip, 'volume', a.volume, local);
  const maxFade = Math.max(0.1, Math.min(30, clip.duration / fps / 2));
  const set = (fn: (au: AudioSettings) => void, coalesce?: string) =>
    patchClip(
      clip.id,
      (c) => {
        if (c.type === 'video' || c.type === 'audio') fn(c.audio);
      },
      coalesce ? `audio:${coalesce}` : undefined,
    );
  const role = a.role === 'auto' ? (asset?.role ?? null) : a.role;
  const run = (label: string, task: (id: string) => Promise<unknown>) => () => {
    toast.promise(task(clip.id), { loading: `${label}…`, success: `${label} done`, error: (e) => errorMessage(e) });
  };

  return (
    <>
      <Section title="Volume">
        <SliderField
          label="Volume"
          aside={<KeyframeToggle clip={clip} prop="volume" value={volume} local={local} />}
          value={volume}
          min={0}
          max={4}
          step={0.01}
          scale={100}
          suffix="%"
          disabled={a.muted}
          onChange={(v) => setAnimated(clip, 'volume', v, local, (c) => (c.type === 'video' || c.type === 'audio') && (c.audio.volume = v))}
        />
        <Toggle label="Mute this clip" checked={a.muted} onChange={(v) => set((au) => (au.muted = v))} />
        <SliderField label="Fade in" value={Math.min(a.fadeIn, maxFade)} min={0} max={maxFade} step={0.05} digits={2} suffix="s" onChange={(v) => set((au) => (au.fadeIn = v), 'fadeIn')} />
        <SliderField label="Fade out" value={Math.min(a.fadeOut, maxFade)} min={0} max={maxFade} step={0.05} digits={2} suffix="s" onChange={(v) => set((au) => (au.fadeOut = v), 'fadeOut')} />
        <SliderField label="Pan" value={a.pan} min={-1} max={1} step={0.01} scale={100} suffix={a.pan < 0 ? 'L' : a.pan > 0 ? 'R' : ''} onChange={(v) => set((au) => (au.pan = Math.abs(v) < 0.02 ? 0 : v), 'pan')} />
      </Section>
      <Section title="Mix">
        <Row label="Kind">
          <Select size="sm" value={a.role} onValueChange={(v) => set((au) => (au.role = v as AudioSettings['role']))} options={ROLES.map((r) => ({ value: r.value, label: r.label, hint: r.value === 'auto' && asset?.role ? `Detected: ${asset.role}` : r.hint }))} />
        </Row>
        {role === 'music' ? (
          <p className="text-[11px] text-muted-foreground">Music dips under voice clips automatically. Set the kind to Sound effect to keep it at full level.</p>
        ) : (
          <Toggle label="Lower under voice" hint="Dips this clip while someone speaks." checked={a.duck} onChange={(v) => set((au) => (au.duck = v))} />
        )}
      </Section>
      <Section title="Clean up & EQ" defaultOpen={a.denoise || a.compressor || !!(a.eq.low || a.eq.mid || a.eq.high)}>
        <p className="text-[11px] text-muted-foreground">Heard in exports. The preview plays the original sound.</p>
        <Toggle label="Reduce noise" hint="Removes hiss, hum and room tone." checked={a.denoise} onChange={(v) => set((au) => (au.denoise = v))} />
        <Toggle label="Even out levels" hint="Gentle compression so quiet words stay clear." checked={a.compressor} onChange={(v) => set((au) => (au.compressor = v))} />
        <SliderField label="Bass" value={a.eq.low} min={-24} max={24} step={0.5} digits={1} suffix="dB" onChange={(v) => set((au) => (au.eq.low = v), 'eqLow')} />
        <SliderField label="Mids" value={a.eq.mid} min={-24} max={24} step={0.5} digits={1} suffix="dB" onChange={(v) => set((au) => (au.eq.mid = v), 'eqMid')} />
        <SliderField label="Treble" value={a.eq.high} min={-24} max={24} step={0.5} digits={1} suffix="dB" onChange={(v) => set((au) => (au.eq.high = v), 'eqHigh')} />
        {(a.eq.low || a.eq.mid || a.eq.high) !== 0 && (
          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => set((au) => (au.eq = { low: 0, mid: 0, high: 0 }))}>
            <RotateCcw /> Flat EQ
          </Button>
        )}
      </Section>
      {clip.assetId && (
        <Section title="Smart tools" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="xs" variant="secondary" onClick={run('Captions', captionsFromSpeech)}>
              <Captions /> Captions
            </Button>
            <Button size="xs" variant="secondary" onClick={run('Removing pauses', cutSilences)}>
              <Scissors /> Remove pauses
            </Button>
            {clip.type === 'audio' && (
              <Button size="xs" variant="secondary" onClick={run('Beat markers', beatMarkers)}>
                <Music2 /> Beat markers
              </Button>
            )}
            {clip.type === 'video' && (
              <Button size="xs" variant="secondary" onClick={() => detachAudio(clip.id)}>
                <Unlink /> Detach audio
              </Button>
            )}
          </div>
        </Section>
      )}
    </>
  );
}

/* ---------------------------------- Effects ----------------------------------- */

const CATEGORY_LABEL: Record<EffectDef['category'], string> = { color: 'Color', light: 'Light', stylize: 'Stylize', blur: 'Blur & sharpen', camera: 'Camera', distort: 'Distort', key: 'Keying' };
const CATEGORY_ORDER: EffectDef['category'][] = ['color', 'light', 'stylize', 'camera', 'blur', 'distort', 'key'];

/** Shader effects read decoded frames, so they only apply to video and photo layers. */
function effectsFor(clip: Clip): EffectDef[] {
  if (clip.type === 'adjustment') return EFFECTS.filter((e) => e.adjustment);
  const media = clip.type === 'video' || clip.type === 'image';
  return EFFECTS.filter((e) => media || e.engine !== 'webgl');
}

function patchEffect(clipId: string, fxId: string, fn: (fx: EffectInstance) => void, coalesce?: string) {
  patchClip(
    clipId,
    (c) => {
      const fx = c.effects.find((e) => e.id === fxId);
      if (fx) fn(fx);
    },
    coalesce ? `fx:${fxId}:${coalesce}` : undefined,
  );
}

export function EffectsSection({ clip }: { clip: Clip }) {
  const available = effectsFor(clip);
  const add = (type: string) => patchClip(clip.id, (_c, tl) => void timelineOps.addEffect(tl, clip.id, type));
  return (
    <Section
      title="Effects"
      aside={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="secondary">
              <Plus /> Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            {CATEGORY_ORDER.map((cat) => {
              const list = available.filter((e) => e.category === cat);
              if (!list.length) return null;
              return (
                <DropdownMenuSub key={cat}>
                  <DropdownMenuSubTrigger>{CATEGORY_LABEL[cat]}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    {list.map((e) => (
                      <DropdownMenuItem key={e.id} onSelect={() => add(e.id)} className="flex-col items-start gap-0">
                        <span>{e.label}</span>
                        <span className="text-[11px] text-muted-foreground">{e.description}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {clip.type === 'adjustment' && <p className="text-xs text-muted-foreground">Effects on an adjustment layer change every layer below it while it plays.</p>}
      {clip.effects.length === 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {(clip.type === 'adjustment' ? ['adjust', 'vignette', 'grain', 'letterbox'] : clip.type === 'video' || clip.type === 'image' ? ['lut', 'adjust', 'vignette', 'grain'] : ['glow', 'adjust', 'shake', 'glitch'])
            .filter((id) => available.some((e) => e.id === id))
            .map((id) => (
              <Button key={id} size="xs" variant="secondary" onClick={() => add(id)}>
                <Plus /> {EFFECTS_BY_ID[id]?.label}
              </Button>
            ))}
        </div>
      ) : (
        clip.effects.map((fx, i) => <EffectCard key={fx.id} clip={clip} fx={fx} index={i} />)
      )}
    </Section>
  );
}

function EffectCard({ clip, fx, index }: { clip: Clip; fx: EffectInstance; index: number }) {
  const [open, setOpen] = useState(true);
  const def = EFFECTS_BY_ID[fx.type];
  const count = clip.effects.length;
  const move = (to: number) =>
    patchClip(clip.id, (c) => {
      const [item] = c.effects.splice(index, 1);
      if (item) c.effects.splice(to, 0, item);
    });
  const remove = () => patchClip(clip.id, (_c, tl) => timelineOps.removeEffect(tl, clip.id, fx.id));
  return (
    <div className={cn('rounded-lg border bg-surface-2/40', !fx.enabled && 'opacity-60')}>
      <div className="flex items-center gap-1.5 py-1.5 pr-1.5 pl-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium" aria-expanded={open}>
          <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', !open && '-rotate-90')} />
          <span className="truncate">{def?.label ?? `Unknown effect (${fx.type})`}</span>
        </button>
        <Switch checked={fx.enabled} onCheckedChange={(v) => patchEffect(clip.id, fx.id, (e) => (e.enabled = v))} aria-label={fx.enabled ? 'Turn off' : 'Turn on'} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" aria-label="Effect options">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem disabled={index === 0} onSelect={() => move(index - 1)}>
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onSelect={() => move(index + 1)}>
              <ArrowDown /> Move down
            </DropdownMenuItem>
            {def && (
              <DropdownMenuItem onSelect={() => patchEffect(clip.id, fx.id, (e) => (e.params = defaultEffectParams(fx.type)))}>
                <RotateCcw /> Reset
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={remove}>
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && def && def.params.length > 0 && (
        <div className="space-y-2.5 border-t px-2.5 py-2.5">
          {def.params.map((p) => (
            <ParamControl key={p.key} param={p} fx={fx} clipId={clip.id} />
          ))}
        </div>
      )}
      {open && !def && <p className="border-t px-2.5 py-2 text-[11px] text-muted-foreground">This effect is not available any more and is skipped when rendering.</p>}
    </div>
  );
}

const digitsFor = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

function ParamControl({ param: p, fx, clipId }: { param: ParamDef; fx: EffectInstance; clipId: string }) {
  const brand = useBrandColors();
  const value: ParamValue = fx.params[p.key] ?? p.default;
  const set = (v: ParamValue, coalesce?: boolean) =>
    patchEffect(
      clipId,
      fx.id,
      (e) => {
        e.params[p.key] = v;
      },
      coalesce ? p.key : undefined,
    );
  if (fx.type === 'lut' && p.key === 'cubeAssetId') return <LutPicker value={typeof value === 'string' ? value : ''} onChange={(id) => set(id)} />;
  switch (p.type) {
    case 'number':
      return <SliderField label={p.label} value={typeof value === 'number' ? value : p.default} min={p.min} max={p.max} step={p.step} digits={digitsFor(p.step)} suffix={p.unit} onChange={(v) => set(v, true)} />;
    case 'color':
      return (
        <Row label={p.label}>
          <ColorInput value={typeof value === 'string' ? value : p.default} swatches={brand} onChange={(v) => set(v, true)} />
        </Row>
      );
    case 'boolean':
      return <Toggle label={p.label} checked={value === true} onChange={(v) => set(v)} />;
    case 'select': {
      const custom = fx.type === 'lut' && p.key === 'preset' && typeof fx.params.cubeAssetId === 'string' && !!fx.params.cubeAssetId;
      return (
        <Row label={p.label}>
          <Select size="sm" disabled={custom} value={String(value)} onValueChange={(v) => set(v)} options={p.options} />
        </Row>
      );
    }
  }
}

/** Imported .cube grades; picking one adds its strip to the editor's assets so the preview can sample it. */
function LutPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const luts = useQuery({ queryKey: ['luts'], queryFn: () => api.get<{ items: AssetView[] }>('/luts').then((r) => r.items), staleTime: 60_000 });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<{ asset: AssetView }>('/luts', form).then((r) => r.asset);
    },
    onSuccess: (asset) => {
      qc.setQueryData<AssetView[]>(['luts'], (list) => [asset, ...(list ?? [])]);
      useEditor.getState().mergeAssets([asset]);
      onChange(asset.id);
      toast.success(`Imported “${asset.name}”`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const items = luts.data ?? [];
  const options = [
    { value: 'none', label: 'None, use the look above' },
    ...items.map((a) => ({ value: a.id, label: a.name, hint: a.height ? `${a.height}-point cube` : undefined })),
    ...(value && !items.some((a) => a.id === value) && !luts.isPending ? [{ value, label: 'Missing LUT', hint: 'It was deleted. Pick another or import it again.' }] : []),
  ];
  return (
    <Row label="Your LUT">
      <div className="flex gap-1.5">
        <Select
          size="sm"
          value={value || 'none'}
          onValueChange={(id) => {
            const picked = items.find((a) => a.id === id);
            if (picked) useEditor.getState().mergeAssets([picked]);
            onChange(id === 'none' ? '' : id);
          }}
          options={options}
        />
        <Button size="icon-sm" variant="secondary" loading={upload.isPending} onClick={() => fileRef.current?.click()} aria-label="Import a .cube LUT" title="Import a .cube LUT">
          <Upload />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".cube"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = '';
          }}
        />
      </div>
    </Row>
  );
}

/* -------------------------------- Transitions --------------------------------- */

const EASING_LABEL: Record<EasingId, string> = {
  linear: 'Linear',
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  easeInOut: 'Ease in and out',
  easeInCubic: 'Strong ease in',
  easeOutCubic: 'Strong ease out',
  easeInOutCubic: 'Strong ease in and out',
  easeInBack: 'Anticipate',
  easeOutBack: 'Overshoot',
  easeOutElastic: 'Elastic',
  easeOutBounce: 'Bounce',
  hold: 'Hold (cut)',
};

export function TransitionsSection({ clip }: { clip: Clip }) {
  const hasPrev = useEditor((s) => {
    const found = timelineOps.findClip(s.timeline, clip.id);
    return !!found && !!previousAdjacentClip(found.track, found.clip);
  });
  const applyToTrack = () =>
    patchClip(clip.id, (c, tl) => {
      const track = timelineOps.findClip(tl, c.id)?.track;
      if (!track) return;
      for (const other of track.clips) {
        if (other.id === c.id) continue;
        timelineOps.setTransition(tl, other.id, 'in', c.transitionIn ? structuredCopy(c.transitionIn) : null);
        timelineOps.setTransition(tl, other.id, 'out', c.transitionOut ? structuredCopy(c.transitionOut) : null);
      }
    });
  return (
    <Section title="Transitions">
      <TransitionEdge clip={clip} edge="in" hasPrev={hasPrev} />
      <TransitionEdge clip={clip} edge="out" hasPrev={false} />
      <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={applyToTrack}>
        Use these on every clip in this track
      </Button>
    </Section>
  );
}

function structuredCopy(t: Transition): Transition {
  return { ...t, params: { ...t.params } };
}

function TransitionEdge({ clip, edge, hasPrev }: { clip: Clip; edge: 'in' | 'out'; hasPrev: boolean }) {
  const fps = useEditor((s) => s.timeline.fps);
  const brand = useBrandColors();
  const t = edge === 'in' ? clip.transitionIn : clip.transitionOut;
  const def = t ? TRANSITIONS_BY_ID[t.type] : undefined;
  const maxFrames = Math.max(1, Math.min(240, clip.duration));
  const update = (fn: (tr: Transition) => void, coalesce?: string) =>
    patchClip(
      clip.id,
      (c) => {
        const tr = edge === 'in' ? c.transitionIn : c.transitionOut;
        if (tr) fn(tr);
      },
      coalesce ? `tr:${edge}:${coalesce}` : undefined,
    );
  return (
    <div className="space-y-2.5 rounded-lg border p-2.5">
      <Row label={edge === 'in' ? 'Start' : 'End'}>
        <Select
          size="sm"
          value={t?.type ?? 'none'}
          onValueChange={(type) => patchClip(clip.id, (_c, tl) => timelineOps.setTransition(tl, clip.id, edge, type === 'none' ? null : timelineOps.makeTransition(type, t?.duration, t?.easing)))}
          options={[{ value: 'none', label: 'Cut (none)' }, ...TRANSITIONS.map((d) => ({ value: d.id, label: d.label }))]}
        />
      </Row>
      {t && (
        <>
          <SliderField label="Length" value={t.duration / fps} min={1 / fps} max={maxFrames / fps} step={1 / fps} digits={2} suffix="s" onChange={(v) => update((tr) => (tr.duration = Math.max(1, Math.min(maxFrames, Math.round(v * fps)))), 'duration')} />
          <Row label="Easing">
            <Select size="sm" value={t.easing} onValueChange={(v) => update((tr) => (tr.easing = v as EasingId))} options={EASING_IDS.map((id) => ({ value: id, label: EASING_LABEL[id] }))} />
          </Row>
          {def?.params.map((p) =>
            p.type === 'color' ? (
              <Row key={p.key} label={p.label}>
                <ColorInput value={typeof t.params[p.key] === 'string' ? (t.params[p.key] as string) : p.default} swatches={brand} onChange={(v) => update((tr) => (tr.params[p.key] = v), p.key)} />
              </Row>
            ) : null,
          )}
          {edge === 'in' && def?.pair && <p className="text-[11px] text-muted-foreground">{hasPrev ? 'Blends with the clip right before this one.' : 'Place a clip right before this one on the same track to blend the two.'}</p>}
        </>
      )}
    </div>
  );
}

/* ------------------------------------ Mask ------------------------------------ */

export function MaskSection({ clip }: { clip: Clip }) {
  const m = clip.mask;
  if (clip.type === 'audio' || clip.type === 'adjustment') return null;
  const set = (fn: (mask: Mask) => void, coalesce?: string) =>
    patchClip(
      clip.id,
      (c) => {
        if (c.mask) fn(c.mask);
      },
      coalesce ? `mask:${coalesce}` : undefined,
    );
  return (
    <Section title="Mask" defaultOpen={!!m}>
      <Toggle label="Mask this layer" hint="Show only part of it, with a soft edge if you like." checked={!!m} onChange={(v) => patchClip(clip.id, (c) => (c.mask = v ? maskSchema.parse({ shape: 'ellipse', width: 0.8, height: 0.8, feather: 0.08 }) : null))} />
      {m && (
        <>
          <Segmented
            size="sm"
            value={m.shape}
            onChange={(v) => set((x) => (x.shape = v))}
            options={[
              { value: 'rect', label: 'Rectangle' },
              { value: 'ellipse', label: 'Ellipse' },
            ]}
          />
          <SliderField label="Center X" value={m.x} min={0} max={1} step={0.005} scale={100} digits={1} suffix="%" onChange={(v) => set((x) => (x.x = v), 'x')} />
          <SliderField label="Center Y" value={m.y} min={0} max={1} step={0.005} scale={100} digits={1} suffix="%" onChange={(v) => set((x) => (x.y = v), 'y')} />
          <SliderField label="Width" value={m.width} min={0} max={1} step={0.005} scale={100} digits={1} suffix="%" onChange={(v) => set((x) => (x.width = v), 'w')} />
          <SliderField label="Height" value={m.height} min={0} max={1} step={0.005} scale={100} digits={1} suffix="%" onChange={(v) => set((x) => (x.height = v), 'h')} />
          {m.shape === 'rect' && <SliderField label="Roundness" value={m.radius} min={0} max={0.5} step={0.005} scale={200} suffix="%" onChange={(v) => set((x) => (x.radius = v), 'radius')} />}
          <SliderField label="Feather" value={m.feather} min={0} max={0.5} step={0.005} scale={200} suffix="%" onChange={(v) => set((x) => (x.feather = v), 'feather')} />
          <Toggle label="Invert" hint="Hide the inside instead." checked={m.invert} onChange={(v) => set((x) => (x.invert = v))} />
        </>
      )}
    </Section>
  );
}

