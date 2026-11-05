'use client';

import { useQuery } from '@tanstack/react-query';
import { Dices, Palette, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { clamp, nearest, type AspectRatio, type GenParamsInput } from '@adforge/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api-client';
import type { ModelView } from '@/lib/types';
import { cn } from '@/lib/utils';

export type Settings = Pick<GenParamsInput, 'durationS' | 'aspect' | 'resolution' | 'audio' | 'seed' | 'numOutputs' | 'quality' | 'upscaleFactor' | 'targetResolution' | 'slowmo' | 'textured' | 'colors'>;

/** Carries settings across a model switch, snapping each one to what the new model allows. */
export function normalizeSettings(m: ModelView, prev: Settings): Settings {
  const c = m.controls;
  const d = m.defaults;
  const out: Settings = {};
  if (c.aspects?.length) {
    const ok = (a: unknown): a is AspectRatio => typeof a === 'string' && (c.aspects as string[]).includes(a);
    out.aspect = ok(prev.aspect) ? prev.aspect : ok(d.aspect) ? d.aspect : c.aspects[0];
  }
  if (c.durations?.length) out.durationS = nearest(prev.durationS ?? d.durationS, c.durations, d.durationS ?? c.durations[0]!);
  else if (c.durationRange) out.durationS = clamp(Math.round(prev.durationS ?? d.durationS ?? c.durationRange[0]), c.durationRange[0], c.durationRange[1]);
  if (c.resolutions?.length) out.resolution = prev.resolution && c.resolutions.includes(prev.resolution) ? prev.resolution : (d.resolution ?? c.resolutions[0]);
  if (c.audioToggle) out.audio = prev.audio ?? d.audio ?? true;
  if (c.maxOutputs) out.numOutputs = Math.min(prev.numOutputs ?? d.numOutputs ?? 1, c.maxOutputs);
  if (c.seed && prev.seed != null) out.seed = prev.seed;
  if (c.qualities?.length) out.quality = prev.quality && c.qualities.includes(prev.quality) ? prev.quality : (d.quality ?? c.qualities[c.qualities.length - 1]);
  if (c.upscaleFactors?.length) out.upscaleFactor = nearest(prev.upscaleFactor ?? d.upscaleFactor, c.upscaleFactors, c.upscaleFactors[0]!);
  if (c.targetResolutions?.length) out.targetResolution = prev.targetResolution && c.targetResolutions.includes(prev.targetResolution) ? prev.targetResolution : (d.targetResolution ?? c.targetResolutions[0]);
  if (c.slowmoFactors?.length) out.slowmo = nearest(prev.slowmo ?? d.slowmo, c.slowmoFactors, c.slowmoFactors[0]!);
  if (c.texturedToggle) out.textured = prev.textured ?? d.textured ?? true;
  if (c.brandColors) out.colors = prev.colors ?? [];
  return out;
}

function AspectIcon({ aspect }: { aspect: string }) {
  const [w, h] = aspect.split(':').map(Number) as [number, number];
  const scale = 12 / Math.max(w, h);
  return <span className="inline-block rounded-[2px] border-[1.5px] border-current" style={{ width: Math.max(5, w * scale), height: Math.max(5, h * scale) }} />;
}

/** Every knob the chosen model exposes, and nothing it does not. */
export function SettingsControls({ model, value, onChange }: { model: ModelView; value: Settings; onChange: (s: Settings) => void }) {
  const c = model.controls;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      {!!c.aspects?.length && (
        <Field label="Aspect ratio">
          <Segmented value={String(value.aspect ?? c.aspects[0])} onChange={(v) => set('aspect', v)} options={c.aspects.map((a) => ({ value: a, label: <><AspectIcon aspect={a} /> {a}</> }))} />
        </Field>
      )}
      {!!c.durations?.length && (
        <Field label="Duration" aside={`${value.durationS ?? c.durations[0]} s`}>
          <Segmented size="sm" value={String(value.durationS ?? c.durations[0])} onChange={(v) => set('durationS', Number(v))} options={c.durations.map((d) => ({ value: String(d), label: `${d}s` }))} />
        </Field>
      )}
      {c.durationRange && (
        <Field label="Duration" aside={`${value.durationS ?? c.durationRange[0]} s`}>
          <Slider min={c.durationRange[0]} max={c.durationRange[1]} step={1} value={[value.durationS ?? c.durationRange[0]]} onValueChange={([v]) => set('durationS', v)} />
        </Field>
      )}
      {!!c.resolutions?.length && (
        <Field label="Resolution">
          <Segmented size="sm" value={value.resolution ?? c.resolutions[0]!} onChange={(v) => set('resolution', v)} options={c.resolutions.map((r) => ({ value: r, label: r.toUpperCase() }))} />
        </Field>
      )}
      {!!c.targetResolutions?.length && (
        <Field label="Output resolution">
          <Segmented size="sm" value={value.targetResolution ?? c.targetResolutions[0]!} onChange={(v) => set('targetResolution', v)} options={c.targetResolutions.map((r) => ({ value: r, label: r === '2160p' ? '4K' : r }))} />
        </Field>
      )}
      {!!c.upscaleFactors?.length && (
        <Field label="Upscale by">
          <Segmented size="sm" value={String(value.upscaleFactor ?? c.upscaleFactors[0])} onChange={(v) => set('upscaleFactor', Number(v))} options={c.upscaleFactors.map((f) => ({ value: String(f), label: `${f}×` }))} />
        </Field>
      )}
      {!!c.slowmoFactors?.length && (
        <Field label="Slow motion" hint="Adds in-between frames; 2× doubles the frame rate.">
          <Segmented size="sm" value={String(value.slowmo ?? c.slowmoFactors[0])} onChange={(v) => set('slowmo', Number(v))} options={c.slowmoFactors.map((f) => ({ value: String(f), label: `${f}×` }))} />
        </Field>
      )}
      {!!c.qualities?.length && (
        <Field label="Quality">
          <Segmented size="sm" value={value.quality ?? 'high'} onChange={(v) => set('quality', v)} options={c.qualities.map((q) => ({ value: q, label: q[0]!.toUpperCase() + q.slice(1) }))} />
        </Field>
      )}
      {!!c.maxOutputs && c.maxOutputs > 1 && (
        <Field label="Images per run">
          <Segmented size="sm" value={String(value.numOutputs ?? 1)} onChange={(v) => set('numOutputs', Number(v))} options={Array.from({ length: c.maxOutputs }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
        </Field>
      )}
      {c.audioToggle && (
        <label className="flex items-center justify-between gap-3 text-[13px] font-medium">
          <span>
            Native audio <span className="font-normal text-muted-foreground">(sound effects, ambience, speech)</span>
          </span>
          <Switch checked={value.audio ?? true} onCheckedChange={(v) => set('audio', v)} />
        </label>
      )}
      {c.texturedToggle && (
        <label className="flex items-center justify-between gap-3 text-[13px] font-medium">
          <span>
            Textured model <span className="font-normal text-muted-foreground">(PBR materials)</span>
          </span>
          <Switch checked={value.textured ?? true} onCheckedChange={(v) => set('textured', v)} />
        </label>
      )}
      {c.brandColors && <ColorsControl value={value.colors ?? []} onChange={(v) => set('colors', v)} />}
      {c.seed && (
        <Field label="Seed" hint="Same seed and prompt give a similar result. Leave empty for a random one.">
          <div className="flex gap-2">
            <Input inputMode="numeric" value={value.seed ?? ''} placeholder="Random" onChange={(e) => set('seed', e.target.value === '' ? undefined : clamp(Math.floor(Number(e.target.value) || 0), 0, 2_147_483_647))} />
            <Button type="button" variant="outline" size="icon" aria-label="Random seed" onClick={() => set('seed', Math.floor(Math.random() * 2_000_000_000))}>
              <Dices className="size-4" />
            </Button>
          </div>
        </Field>
      )}
    </div>
  );
}

function ColorsControl({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('#7C5CFF');
  const kits = useQuery({ queryKey: ['brand-kits'], queryFn: () => api.get<{ items: { id: string; name: string; isDefault: boolean; colors: string[] }[] }>('/brand-kits').then((r) => r.items), staleTime: 60_000 });
  const brand = kits.data?.find((k) => k.isDefault) ?? kits.data?.[0];
  return (
    <Field
      label="Palette"
      aside={
        brand?.colors.length ? (
          <button type="button" className="flex items-center gap-1 text-primary hover:underline" onClick={() => onChange(brand.colors.slice(0, 6))}>
            <Palette className="size-3" /> Use brand colors
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {value.map((c) => (
          <span key={c} className="group relative">
            <span className="block size-8 rounded-lg border" style={{ background: c }} title={c} />
            <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(value.filter((x) => x !== c))} className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-foreground text-background group-hover:flex">
              <X className="size-2.5" />
            </button>
          </span>
        ))}
        {value.length < 6 && (
          <span className={cn('flex items-center gap-1 rounded-lg border p-1')}>
            <input type="color" value={draft} onChange={(e) => setDraft(e.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" aria-label="Pick a color" />
            <Button type="button" size="icon-xs" variant="ghost" aria-label="Add color" onClick={() => !value.includes(draft) && onChange([...value, draft.toUpperCase()])}>
              <Plus className="size-3.5" />
            </Button>
          </span>
        )}
      </div>
    </Field>
  );
}
