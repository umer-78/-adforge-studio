'use client';

import { ChevronRight } from 'lucide-react';
import { ContextMenu as M } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const ContextMenu = M.Root;
export const ContextMenuTrigger = M.Trigger;
export const ContextMenuSub = M.Sub;

const panel = 'z-50 min-w-48 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';
const item = 'relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground';

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content className={cn(panel, className)} {...props} />
    </M.Portal>
  );
}
export function ContextMenuItem({ className, destructive, ...props }: ComponentProps<typeof M.Item> & { destructive?: boolean }) {
  return <M.Item className={cn(item, destructive && 'text-destructive data-[highlighted]:bg-destructive/10 [&_svg]:text-destructive', className)} {...props} />;
}
export function ContextMenuLabel({ className, ...props }: ComponentProps<typeof M.Label>) {
  return <M.Label className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props} />;
}
export function ContextMenuSeparator({ className, ...props }: ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
export function ContextMenuSubTrigger({ className, children, ...props }: ComponentProps<typeof M.SubTrigger>) {
  return (
    <M.SubTrigger className={cn(item, 'data-[state=open]:bg-accent', className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </M.SubTrigger>
  );
}
export function ContextMenuSubContent({ className, ...props }: ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent className={cn(panel, className)} {...props} />
    </M.Portal>
  );
}
export function ContextMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('ml-auto pl-4 text-xs tracking-widest text-muted-foreground', className)} {...props} />;
}
