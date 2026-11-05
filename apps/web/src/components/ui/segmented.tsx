'use client';

import { ToggleGroup } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A compact single-choice control (aspect ratios, modes, durations). */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'default' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[]; className?: string; size?: 'default' | 'sm' }) {
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v && onChange(v as T)} className={cn('inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-1', className)}>
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          title={o.title}
          disabled={o.disabled}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-md font-medium text-muted-foreground transition-all hover:text-foreground disabled:opacity-40 data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg]:size-3.5',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-3 text-[13px]',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
