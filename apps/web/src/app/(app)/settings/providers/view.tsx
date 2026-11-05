'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, ExternalLink, KeyRound, Server, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { KEY_PROVIDERS, PROVIDER_INFO, type KeyProvider } from '@adforge/core';
import { isAdmin } from '@/components/settings/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, Notice, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import type { KeyCheckView, ProviderView } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

function useProviders() {
  return useQuery({ queryKey: ['providers'], queryFn: () => api.get<ProviderView[]>('/providers') });
}

/** Everything that changes when a key is added or removed. */
function useRefreshAfterKeyChange() {
  const qc = useQueryClient();
  return () => {
    for (const key of [['providers'], ['me'], ['models'], ['voices'], ['social-accounts']]) void qc.invalidateQueries({ queryKey: key });
  };
}

/** A fresh 32-byte key made in the browser, so it never passes through the server or a chat. */
async function copyNewEncryptionKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = btoa(String.fromCharCode(...bytes));
  try {
    await navigator.clipboard.writeText(key);
    toast.success('Key copied. Paste it as APP_ENCRYPTION_KEY in Vercel and in Railway.');
  } catch {
    toast.error('Your browser blocked copying. Allow clipboard access and try again.');
  }
}

export function ProvidersView() {
  const me = useMe();
  const providers = useProviders();
  const admin = isAdmin(me.data);
  const encryption = me.data?.features.encryption ?? true;
  const byId = new Map((providers.data ?? []).map((p) => [p.id, p]));
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border bg-surface-2/40 p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <p className="text-muted-foreground">
          Keys are checked with the provider before they are saved, then stored encrypted on the server. They are never shown again or sent to the browser; only the first and last four characters are kept so you can tell keys apart. A key you add here is used instead of the server&apos;s key for this workspace.
        </p>
      </div>
      {!encryption && (
        <Notice tone="warning" title="Saving keys is turned off on this server">
          <p>Set APP_ENCRYPTION_KEY in the server environment to save keys here. Keys set in the server environment still work.</p>
          {admin && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" onClick={() => void copyNewEncryptionKey()}>
                <KeyRound /> Copy a new key
              </Button>
              <span className="text-xs">Paste the same key into Vercel and Railway, then redeploy both.</span>
            </div>
          )}
        </Notice>
      )}
      {!admin && me.data && <Notice tone="info">Only owners and admins can add or remove keys.</Notice>}
      {providers.isError && <Notice tone="error">Could not load providers. {errorMessage(providers.error)}</Notice>}
      <div className="grid gap-3 md:grid-cols-2">
        {KEY_PROVIDERS.map((id) => {
          const p = byId.get(id);
          return p ? <ProviderCard key={id} p={p} canEdit={admin && encryption} canTest={admin} /> : <Skeleton key={id} className="h-44 rounded-xl" />;
        })}
      </div>
    </div>
  );
}

function SourceBadge({ p }: { p: ProviderView }) {
  if (p.source === 'workspace') return <Badge variant="success"><KeyRound /> Your key</Badge>;
  if (p.source === 'server') return <Badge variant="secondary"><Server /> Server key</Badge>;
  return <Badge variant="outline">Not connected</Badge>;
}

function CheckLine({ check }: { check: KeyCheckView }) {
  const Icon = check.status === 'valid' ? CircleCheck : check.status === 'invalid' ? CircleX : TriangleAlert;
  const tone = check.status === 'valid' ? 'text-success' : check.status === 'invalid' ? 'text-destructive' : 'text-warning';
  return (
    <div className="flex items-start gap-2 rounded-lg border bg-surface-2/50 p-2.5 text-xs" role="status">
      <Icon className={`mt-px size-4 shrink-0 ${tone}`} />
      <div className="min-w-0">
        <p>{check.message}</p>
        {check.account && <p className="mt-0.5 text-muted-foreground">{check.account}</p>}
      </div>
    </div>
  );
}

function ProviderCard({ p, canEdit, canTest }: { p: ProviderView; canEdit: boolean; canTest: boolean }) {
  const info = PROVIDER_INFO[p.id];
  const refresh = useRefreshAfterKeyChange();
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<KeyCheckView | null>(null);
  const test = useMutation({
    mutationFn: () => api.post<KeyCheckView>(`/providers/${p.id}/test`),
    onSuccess: setCheck,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete<ProviderView>(`/providers/${p.id}`),
    onSuccess: (v) => {
      refresh();
      setCheck(null);
      toast.success(v.source === 'server' ? `${info.label} key removed. The server's key is used again.` : `${info.label} key removed.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{info.label}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{info.uses}</p>
        </div>
        <SourceBadge p={p} />
      </div>
      {p.source === 'workspace' && (
        <p className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{p.keyHint}</span>
          {p.label && <> · {p.label}</>}
          {p.updatedAt && <> · saved {timeAgo(p.updatedAt)}</>}
        </p>
      )}
      {check && <CheckLine check={check} />}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {canEdit && (
          <Button size="sm" variant={p.source === 'none' ? 'default' : 'secondary'} onClick={() => setOpen(true)}>
            {p.source === 'workspace' ? 'Replace key' : 'Add key'}
          </Button>
        )}
        {canTest && p.source !== 'none' && (
          <Button size="sm" variant="ghost" loading={test.isPending} onClick={() => test.mutate()}>
            Test
          </Button>
        )}
        {canEdit && p.source === 'workspace' && (
          <Confirm
            title={`Remove the ${info.label} key?`}
            description={p.serverKey ? "This workspace goes back to using the server's key." : `Features that need ${info.label} stop working until a key is added again.`}
            confirmLabel="Remove key"
            destructive
            onConfirm={() => remove.mutateAsync()}
          >
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
              Remove
            </Button>
          </Confirm>
        )}
        <a href={info.keyUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Get a key <ExternalLink className="size-3" />
        </a>
      </div>
      <KeyDialog provider={p.id} open={open} onOpenChange={setOpen} onSaved={setCheck} />
    </Card>
  );
}

function KeyDialog({ provider, open, onOpenChange, onSaved }: { provider: KeyProvider; open: boolean; onOpenChange: (v: boolean) => void; onSaved: (c: KeyCheckView) => void }) {
  const info = PROVIDER_INFO[provider];
  const refresh = useRefreshAfterKeyChange();
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setKey('');
      setLabel('');
      setError(null);
    }
  };
  const save = useMutation({
    mutationFn: () => api.put<{ provider: ProviderView; check: KeyCheckView }>(`/providers/${provider}`, { key: key.trim(), label: label.trim() || null }),
    onSuccess: ({ check }) => {
      refresh();
      onSaved(check);
      if (check.status === 'valid') toast.success(`${info.label} key saved and verified`);
      else toast.warning(`${info.label} key saved. ${check.message}`);
      close(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const trimmed = key.trim();
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{info.label} API key</DialogTitle>
          <DialogDescription>
            It is checked with {info.label} first. A rejected key is not saved.{' '}
            <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Create one here
            </a>
            .
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed.length >= 8) save.mutate();
          }}
        >
          <Field label="Key" htmlFor={`key-${provider}`} error={error}>
            <Input
              id={`key-${provider}`}
              type="password"
              value={key}
              onChange={(e) => (setKey(e.target.value), setError(null))}
              placeholder={info.placeholder}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="font-mono"
            />
          </Field>
          <Field label="Label" hint="Optional, to remember which key this is." htmlFor={`label-${provider}`}>
            <Input id={`label-${provider}`} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Production" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed.length < 8} loading={save.isPending}>
              Check and save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
