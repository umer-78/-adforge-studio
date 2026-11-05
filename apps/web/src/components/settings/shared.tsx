'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';

export const isAdmin = (me: Me | undefined) => me?.workspace.role === 'owner' || me?.workspace.role === 'admin';

/** One block of settings: title, short description, fields, and an optional footer with actions. */
export function SettingsSection({ title, description, actions, footer, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; footer?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </CardHeader>
      {children && <CardContent className="space-y-4">{children}</CardContent>}
      {footer && <CardFooter className="justify-end">{footer}</CardFooter>}
    </Card>
  );
}

/** A labelled on/off setting with a sentence on what it does. */
export function SwitchRow({ label, description, checked, onCheckedChange, disabled, className }: { label: ReactNode; description?: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}

/** Reads what an OAuth round trip reported. */
export function oauthResultMessage(params: URLSearchParams): { ok: boolean; text: string } | null {
  const error = params.get('error');
  if (error) return { ok: false, text: error };
  const connected = params.get('connected');
  if (connected == null) return null;
  const n = Number(connected) || 0;
  const provider = params.get('provider') ?? 'the platform';
  return n > 0 ? { ok: true, text: `Connected ${n} account${n === 1 ? '' : 's'} from ${provider}.` } : { ok: false, text: `No accounts came back from ${provider}. Check that you granted access, then try again.` };
}

/** Shows the result of an OAuth round trip once, then drops it from the URL. */
export function useOAuthResult(onConnected?: () => void) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const result = oauthResultMessage(params);
    if (!result) return;
    const key = params.toString();
    if (shown.current === key) return;
    shown.current = key;
    if (result.ok) {
      toast.success(result.text);
      onConnected?.();
    } else toast.error(result.text);
    router.replace(path, { scroll: false });
  }, [params, router, path, onConnected]);
}

/** Sends the browser to a provider's sign-in page. */
export function goTo(url: string) {
  window.location.assign(url);
}
