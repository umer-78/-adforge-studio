'use client';

import { AlertDialog as A } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { Button } from './button';

/**
 * Confirmation for destructive or irreversible actions. Wraps a trigger, or is controlled
 * with `open`/`onOpenChange` when opened from a menu (menus unmount their children on close).
 */
export function Confirm({
  title,
  description,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  children,
  open: openProp,
  onOpenChange,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOwn(v));
  const [busy, setBusy] = useState(false);
  return (
    <A.Root open={open} onOpenChange={setOpen}>
      {children && <A.Trigger asChild>{children}</A.Trigger>}
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <A.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-popover p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <A.Title className="text-lg font-semibold">{title}</A.Title>
          {description && <A.Description className="mt-2 text-sm text-muted-foreground">{description}</A.Description>}
          <div className="mt-6 flex justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="ghost">Cancel</Button>
            </A.Cancel>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
