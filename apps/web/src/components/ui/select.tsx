'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as S } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Option {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

/** Single-select built on Radix Select. Empty string values are not allowed by Radix, so use "none". */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  className,
  disabled,
  size = 'default',
  'aria-label': ariaLabel,
}: {
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: 'default' | 'sm';
  'aria-label'?: string;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        aria-label={ariaLabel}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-surface px-3 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:truncate',
          size === 'sm' ? 'h-8 text-[13px]' : 'h-9',
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon asChild>
          <ChevronDown className="size-4 opacity-60" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} disabled={o.disabled} className="relative flex cursor-default flex-col items-start rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent">
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                <S.ItemIndicator className="absolute top-2 right-2">
                  <Check className="size-4" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

export type SelectProps = ComponentProps<typeof Select>;
