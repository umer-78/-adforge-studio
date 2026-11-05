'use client';

import { Avatar as A } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Avatar({ src, name, className }: { src?: string | null; name?: string | null; className?: string }) {
  const initials = (name ?? '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');
  return (
    <A.Root className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full bg-brand', className)}>
      {src && <A.Image src={src} alt="" className="aspect-square size-full object-cover" />}
      <A.Fallback className="flex size-full items-center justify-center text-[11px] font-semibold text-white">{initials || '?'}</A.Fallback>
    </A.Root>
  );
}
