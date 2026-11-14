'use client';

import { ChevronDown, ChevronLeft, ChevronRight, Diamond } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { interpolateKeyframes, timelineOps, type AnimatableProp, type Clip, type TimelineData } from '@adforge/core';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { player, usePlayhead } from './playhead';
import { useEditor } from './store';
import { useOnChange } from '@/lib/hooks/use-on-change';

/** Edits one clip as one undo step; edits sharing `coalesce` within a moment merge (slider drags, typing). */
export function patchClip(clipId: string, fn: (clip: Clip, tl: TimelineData) => void, coalesce?: string) {
  useEditor.getState().edit(
    (d) => {
      const found = timelineOps.findClip(d, clipId);
      if (found) fn(found.clip, d);
    },
    coalesce ? { coalesce: `${clipId}:${coalesce}` } : {},
  );
}

export function patchTimeline(fn: (tl: TimelineData) => void, coalesce?: string) {
  useEditor.getState().edit(fn, coalesce ? { coalesce: `timeline:${coalesce}` } : {});
}

export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border/60 last:border-b-0">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-1.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground" aria-expanded={open}>
          <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
          {title}
        </button>
        {aside}
      </div>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  );
}

/** Number input that commits on blur or Enter, so typing does not fight the store. */
export function NumberInput({ value, onChange, min, max, step = 1, digits = 2, className, suffix, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; digits?: number; className?: string; suffix?: string; disabled?: boolean }) {
  const shown = Number.isFinite(value) ? String(Number(value.toFixed(digits))) : '';
  const [text, setText] = useState(shown);
  useOnChange([shown], () => { setText(shown); });
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n) || text.trim() === '') return setText(shown);
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (clamped !== value) onChange(clamped);
    setText(String(Number(clamped.toFixed(digits))));
  };
  return (
    <label className={cn('flex h-7 items-center rounded-md border border-input bg-surface px-1.5 text-xs focus-within:border-ring', disabled && 'opacity-50', className)}>
      <input
        value={text}
        disabled={disabled}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)));
            onChange(Number(n.toFixed(digits)));
          }
        }}
        className="w-full min-w-0 bg-transparent font-mono tabular-nums outline-none"
      />
      {suffix && <span className="pl-1 text-muted-foreground">{suffix}</span>}
    </label>
  );
}

/** Label, slider and exact number input in one row. `scale` converts stored values to shown ones (0.5 → 50%). */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  scale = 1,
  suffix,
  digits = 0,
  disabled,
  aside,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  scale?: number;
  suffix?: string;
  digits?: number;
  disabled?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className={cn('grid grid-cols-[5.5rem_1fr_4.25rem] items-center gap-2', disabled && 'opacity-60')}>
      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
        {aside}
        {label}
      </span>
      <Slider min={min} max={max} step={step} value={[Math.min(max, Math.max(min, value))]} disabled={disabled} onValueChange={([v]) => v != null && onChange(v)} aria-label={label} />
      <NumberInput value={value * scale} min={min * scale} max={max * scale} step={step * scale} digits={digits} suffix={suffix} disabled={disabled} onChange={(v) => onChange(v / scale)} />
    </div>
  );
}

export function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[5.5rem_1fr] items-center gap-2', className)}>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Frame inside the clip under the playhead, or null when the playhead is outside it. */
export function useLocalFrame(clip: Clip): number | null {
  const frame = usePlayhead((s) => s.frame);
  const local = frame - clip.start;
  return local >= 0 && local <= clip.duration ? local : null;
}

/** Value of an animatable property at the playhead (keyframes applied). */
export function animatedValue(clip: Clip, prop: AnimatableProp, base: number, local: number | null): number {
  const kfs = clip.keyframes[prop];
  if (!kfs?.length) return base;
  return interpolateKeyframes(kfs, local ?? 0, base);
}

/** Writes a value: keyframed properties get a keyframe at the playhead, others change the base value. */
export function setAnimated(clip: Clip, prop: AnimatableProp, value: number, local: number | null, setBase: (c: Clip) => void) {
  patchClip(
    clip.id,
    (c, tl) => {
      if (c.keyframes[prop]?.length && local != null) timelineOps.setKeyframe(tl, c.id, prop, local, value);
      else setBase(c);
    },
    `anim:${prop}`,
  );
}

/** Keyframe toggle with previous/next navigation for one property. */
export function KeyframeToggle({ clip, prop, value, local }: { clip: Clip; prop: AnimatableProp; value: number; local: number | null }) {
  const kfs = clip.keyframes[prop] ?? [];
  const here = local != null && kfs.some((k) => k.frame === local);
  const prev = local == null ? undefined : [...kfs].reverse().find((k) => k.frame < local);
  const next = local == null ? undefined : kfs.find((k) => k.frame > local);
  return (
    <span className="flex items-center">
      {kfs.length > 0 && (
        <button type="button" aria-label="Previous keyframe" disabled={!prev} onClick={() => prev && player.seek(clip.start + prev.frame)} className="text-muted-foreground disabled:opacity-30">
          <ChevronLeft className="size-3" />
        </button>
      )}
      <Tip content={local == null ? 'Move the playhead over this clip to add keyframes' : here ? 'Remove keyframe' : 'Add keyframe at playhead'}>
        <button
          type="button"
          aria-label={here ? 'Remove keyframe' : 'Add keyframe'}
          disabled={local == null}
          onClick={() =>
            patchClip(clip.id, (c, tl) => {
              if (local == null) return;
              if (here) timelineOps.removeKeyframe(tl, c.id, prop, local);
              else timelineOps.setKeyframe(tl, c.id, prop, local, value);
            })
          }
          className={cn('disabled:opacity-30', here ? 'text-amber-300' : kfs.length ? 'text-amber-300/50' : 'text-muted-foreground/60 hover:text-foreground')}
        >
          <Diamond className={cn('size-3', here && 'fill-current')} />
        </button>
      </Tip>
      {kfs.length > 0 && (
        <button type="button" aria-label="Next keyframe" disabled={!next} onClick={() => next && player.seek(clip.start + next.frame)} className="text-muted-foreground disabled:opacity-30">
          <ChevronRight className="size-3" />
        </button>
      )}
    </span>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
      <span>
        <span className="font-medium text-foreground">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
