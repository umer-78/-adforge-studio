'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Hex color picker with a text field and optional brand swatches. */
export function ColorInput({ value, onChange, swatches }: { value: string; onChange: (v: string) => void; swatches: string[] }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border" style={{ background: hex }}>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a color" />
      </label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-28 font-mono text-xs" maxLength={9} />
      {swatches.slice(0, 6).map((c) => (
        <button key={c} type="button" title={c} aria-label={`Use ${c}`} onClick={() => onChange(c)} className={cn('size-6 rounded-full border transition hover:scale-110', c.toLowerCase() === hex.toLowerCase() && 'ring-2 ring-ring ring-offset-1 ring-offset-background')} style={{ background: c }} />
      ))}
    </div>
  );
}
