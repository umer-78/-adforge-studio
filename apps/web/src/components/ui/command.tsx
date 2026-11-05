'use client';

import { Command as C } from 'cmdk';
import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Command({ className, ...props }: ComponentProps<typeof C>) {
  return <C className={cn('flex size-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground', className)} {...props} />;
}
export function CommandInput({ className, ...props }: ComponentProps<typeof C.Input>) {
  return (
    <div className="flex items-center gap-2 border-b px-4">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <C.Input className={cn('flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground', className)} {...props} />
    </div>
  );
}
export function CommandList({ className, ...props }: ComponentProps<typeof C.List>) {
  return <C.List className={cn('max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain p-2 scrollbar-thin', className)} {...props} />;
}
export function CommandEmpty(props: ComponentProps<typeof C.Empty>) {
  return <C.Empty className="py-8 text-center text-sm text-muted-foreground" {...props} />;
}
export function CommandGroup({ className, ...props }: ComponentProps<typeof C.Group>) {
  return <C.Group className={cn('overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground', className)} {...props} />;
}
export function CommandItem({ className, ...props }: ComponentProps<typeof C.Item>) {
  return <C.Item className={cn('relative flex cursor-default items-center gap-3 rounded-lg px-2 py-2 text-sm outline-none select-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground', className)} {...props} />;
}
export function CommandSeparator({ className, ...props }: ComponentProps<typeof C.Separator>) {
  return <C.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
