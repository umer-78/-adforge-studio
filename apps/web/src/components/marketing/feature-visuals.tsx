import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Small illustrations for the feature cards. They are drawings of the studio's controls, not
 * screenshots, and every number in them comes from the studio's own catalogs and price table.
 */

const frame = 'relative overflow-hidden rounded-2xl border bg-background/60';

export function PromptVisual({ prompt, model, duration, aspect, price }: { prompt: string; model: string; duration: string; aspect: string; price: string }) {
  return (
    <div className={cn(frame, 'p-4')}>
      <p className="text-sm leading-relaxed text-foreground/90">“{prompt}”</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {[model, duration, aspect].map((chip) => (
          <span key={chip} className="rounded-md border bg-surface-2 px-2 py-1 text-muted-foreground">
            {chip}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">Estimate before it runs</span>
        <span className="font-mono font-medium tabular-nums">{price}</span>
      </div>
    </div>
  );
}

const TRACKS: { label: string; clips: { from: number; to: number; tone: string }[] }[] = [
  { label: 'Video', clips: [{ from: 0, to: 34, tone: 'bg-primary/70' }, { from: 35, to: 70, tone: 'bg-primary/50' }, { from: 71, to: 100, tone: 'bg-primary/70' }] },
  { label: 'Text', clips: [{ from: 4, to: 30, tone: 'bg-chart-2/60' }, { from: 52, to: 88, tone: 'bg-chart-2/60' }] },
  { label: 'Voice', clips: [{ from: 2, to: 92, tone: 'bg-chart-3/50' }] },
  { label: 'Music', clips: [{ from: 0, to: 100, tone: 'bg-chart-4/40' }] },
];

export function TimelineVisual() {
  return (
    <div className={cn(frame, 'p-4')}>
      <div className="mb-3 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span>00:00</span>
        <span>00:05</span>
        <span>00:10</span>
        <span>00:15</span>
      </div>
      <div className="relative space-y-2">
        {TRACKS.map((t) => (
          <div key={t.label} className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-[11px] text-muted-foreground">{t.label}</span>
            <div className="relative h-6 flex-1 rounded-md bg-surface-2">
              {t.clips.map((c) => (
                <span key={c.from} className={cn('absolute inset-y-0.5 rounded', c.tone)} style={{ left: `${c.from}%`, width: `${c.to - c.from}%` }} />
              ))}
            </div>
          </div>
        ))}
        <span className="pointer-events-none absolute -top-1 bottom-0 left-[calc(2.5rem+0.75rem+38%)] w-px bg-foreground/80" aria-hidden>
          <span className="absolute -top-1 -left-1 size-2 rotate-45 bg-foreground/80" />
        </span>
      </div>
    </div>
  );
}

/** Bar heights from a fixed seed, so the drawing is the same on every render. */
const BARS = Array.from({ length: 48 }, (_, i) => 18 + Math.round(Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)) * 70 + (i % 5) * 2));

export function WaveVisual({ voices }: { voices: string[] }) {
  return (
    <div className={cn(frame, 'p-4')}>
      <div className="flex h-24 items-center gap-[3px]" aria-hidden>
        {BARS.map((h, i) => (
          <span key={i} className="wave-bar flex-1 rounded-full bg-gradient-to-t from-brand-from to-brand-to" style={{ height: `${h}%`, '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {voices.map((v) => (
          <span key={v} className="rounded-md border bg-surface-2 px-2 py-1 text-muted-foreground">
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CutoutVisual({ src }: { src: string }) {
  return (
    <div className={cn(frame, 'grid grid-cols-2')}>
      <div className="checkerboard relative aspect-square opacity-90">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="absolute inset-0 size-full object-contain p-3" />
        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Cut out</span>
      </div>
      <div className="relative aspect-square bg-[radial-gradient(circle_at_50%_35%,#8f74ff,#2a1b6e_70%)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="absolute inset-0 size-full object-contain p-3 drop-shadow-[0_18px_24px_rgba(0,0,0,0.45)]" />
        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">New scene</span>
      </div>
    </div>
  );
}

export function ThumbsVisual({ images }: { images: { src: string; alt: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {images.map((img) => (
        <div key={img.src} className={cn(frame, 'aspect-square')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.src} alt={img.alt} loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
        </div>
      ))}
    </div>
  );
}

export function PlatformsVisual({ platforms }: { platforms: { label: string; color: string }[] }) {
  return (
    <div className={cn(frame, 'p-4')}>
      <div className="grid grid-cols-7 gap-1.5 text-center font-mono text-[10px] text-muted-foreground">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="relative grid aspect-square place-items-center rounded-md bg-surface-2">
            {[1, 3, 4, 8, 10, 12].includes(i) && <span className="size-1.5 rounded-full" style={{ background: platforms[i % platforms.length]?.color }} />}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {platforms.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 rounded-md border bg-surface-2 px-2 py-1 text-muted-foreground">
            <span className="size-1.5 rounded-full" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StepsVisual({ steps, waitingAt }: { steps: string[]; waitingAt: number }) {
  return (
    <ol className={cn(frame, 'space-y-1 p-3')}>
      {steps.map((s, i) => (
        <li key={s} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', i === waitingAt && 'bg-surface-2')}>
          <span
            className={cn(
              'grid size-5 shrink-0 place-items-center rounded-full border text-[10px]',
              i < waitingAt && 'border-transparent bg-success text-white',
              i === waitingAt && 'border-primary text-primary',
            )}
          >
            {i < waitingAt ? <Check className="size-3" /> : i + 1}
          </span>
          <span className={cn(i > waitingAt && 'text-muted-foreground')}>{s}</span>
          {i === waitingAt && <span className="ml-auto rounded-md bg-primary/15 px-2 py-0.5 text-[11px] text-primary">Waiting for your OK</span>}
        </li>
      ))}
    </ol>
  );
}
