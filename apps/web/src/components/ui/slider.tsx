'use client';

import { Slider as S } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Slider({ className, value, defaultValue, ...props }: ComponentProps<typeof S.Root>) {
  const count = (value ?? defaultValue ?? [0]).length;
  return (
    <S.Root value={value} defaultValue={defaultValue} className={cn('relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50', className)} {...props}>
      <S.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-3">
        <S.Range className="absolute h-full bg-primary" />
      </S.Track>
      {Array.from({ length: count }, (_, i) => (
        <S.Thumb key={i} className="block size-4 rounded-full border-2 border-primary bg-white shadow transition-transform outline-none hover:scale-110 focus-visible:ring-4 focus-visible:ring-ring/30" />
      ))}
    </S.Root>
  );
}
