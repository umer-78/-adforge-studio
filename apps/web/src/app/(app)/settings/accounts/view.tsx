'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { PLATFORM_SPECS } from '@adforge/core';
import { PlatformIcon } from '@/components/app/platform-icon';
import { useSocialAccounts } from '@/components/distribution/use-distribution';
import { goTo, isAdmin, SettingsSection, useOAuthResult } from '@/components/settings/shared';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import type { ConnectorView, SocialAccountView } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

const STATUS: Record<SocialAccountView['status'], { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = {
  active: { label: 'Connected', variant: 'success' },
  expired: { label: 'Sign-in expired', variant: 'warning' },
  error: { label: 'Needs attention', variant: 'destructive' },
  revoked: { label: 'Disconnected', variant: 'outline' },
};

function useConnect() {
  return useMutation({
    mutationFn: (connector: ConnectorView['id']) => api.post<{ url: string }>('/social-accounts/connect', { connector, returnTo: '/settings/accounts' }),
    onSuccess: ({ url }) => goTo(url),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function AccountsView() {
  const me = useMe();
  const qc = useQueryClient();
  const data = useSocialAccounts();
  const admin = isAdmin(me.data);
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ['social-accounts'] }), [qc]);
  useOAuthResult(refresh);
  const connect = useConnect();
  const accounts = (data.data?.accounts ?? []).filter((a) => a.status !== 'revoked');
  const connectors = data.data?.connectors ?? [];
  const connectorFor = (a: SocialAccountView) => connectors.find((c) => c.platforms.includes(a.platform));

  return (
    <div className="space-y-6">
      {!admin && me.data && <Notice tone="info">Only owners and admins can connect or disconnect accounts.</Notice>}
      <SettingsSection title="Connected accounts" description="Where Publish can post. Sign-in tokens are stored encrypted and refreshed automatically.">
        {data.isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : data.isError ? (
          <Notice tone="error">Could not load accounts. {errorMessage(data.error)}</Notice>
        ) : accounts.length ? (
          <ul className="divide-y rounded-xl border">
            {accounts.map((a) => {
              const s = STATUS[a.status];
              const c = connectorFor(a);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="relative">
                    <Avatar src={a.avatarUrl} name={a.displayName ?? a.handle ?? a.platform} className="size-9" />
                    <PlatformIcon platform={a.platform} className="absolute -right-1 -bottom-1 size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.displayName ?? a.handle ?? PLATFORM_SPECS[a.platform].label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {PLATFORM_SPECS[a.platform].label}
                      {a.handle && a.displayName ? ` · @${a.handle.replace(/^@/, '')}` : ''} · {a.provider === 'ayrshare' ? 'via Ayrshare' : 'direct'} · added {timeAgo(a.createdAt)}
                    </p>
                    {a.statusDetail && a.status !== 'active' && <p className="mt-0.5 text-xs text-warning">{a.statusDetail}</p>}
                  </div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                  {admin && a.status !== 'active' && a.provider === 'native' && c?.configured && (
                    <Button size="xs" variant="outline" loading={connect.isPending && connect.variables === c.id} onClick={() => connect.mutate(c.id)}>
                      <RefreshCw /> Reconnect
                    </Button>
                  )}
                  {admin && <DisconnectButton account={a} />}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Link2 />} title="No accounts yet" description="Connect a platform below, or import the accounts you linked in Ayrshare." />
        )}
      </SettingsSection>

      <SettingsSection title="Connect directly" description="Sign in with each platform's own login. A platform shows as not set up until its app keys are added to the server (the README lists them).">
        <div className="grid gap-2 sm:grid-cols-2">
          {connectors.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border p-3">
              <div className="flex -space-x-1">
                {c.platforms.map((p) => (
                  <PlatformIcon key={p} platform={p} className="size-6 rounded-full ring-2 ring-card" />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="truncate text-xs text-muted-foreground">{c.configured ? c.platforms.map((p) => PLATFORM_SPECS[p].label).join(', ') : 'Not set up on this server'}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={!admin || !c.configured} loading={connect.isPending && connect.variables === c.id} onClick={() => connect.mutate(c.id)}>
                Connect
              </Button>
            </div>
          ))}
          {data.isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </SettingsSection>

      <AyrshareSection enabled={!!data.data?.ayrshare} admin={admin} />
    </div>
  );
}

function DisconnectButton({ account }: { account: SocialAccountView }) {
  const qc = useQueryClient();
  const name = account.displayName ?? account.handle ?? PLATFORM_SPECS[account.platform].label;
  return (
    <Confirm
      title={`Disconnect ${name}?`}
      description="Scheduled posts to this account are canceled. Past posts and their results stay. You can connect it again any time."
      confirmLabel="Disconnect"
      destructive
      onConfirm={async () => {
        try {
          await api.delete(`/social-accounts/${account.id}`);
          toast.success(`${name} disconnected`);
          void qc.invalidateQueries({ queryKey: ['social-accounts'] });
          void qc.invalidateQueries({ queryKey: ['posts'] });
        } catch (e) {
          toast.error(errorMessage(e));
        }
      }}
    >
      <Button size="xs" variant="ghost" className="text-muted-foreground hover:text-destructive">
        Disconnect
      </Button>
    </Confirm>
  );
}

function AyrshareSection({ enabled, admin }: { enabled: boolean; admin: boolean }) {
  const qc = useQueryClient();
  const [profileKey, setProfileKey] = useState('');
  const importAccounts = useMutation({
    mutationFn: () => api.post<{ items: SocialAccountView[] }>('/social-accounts/ayrshare', profileKey.trim() ? { profileKey: profileKey.trim() } : {}),
    onSuccess: ({ items }) => {
      toast.success(`Imported ${items.length} account${items.length === 1 ? '' : 's'} from Ayrshare`);
      void qc.invalidateQueries({ queryKey: ['social-accounts'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SettingsSection
      title="Ayrshare"
      description="Optional. If you already use Ayrshare, publish through it instead of each platform's own app: link accounts in the Ayrshare dashboard, then import them here."
    >
      {enabled ? (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            importAccounts.mutate();
          }}
        >
          <Field label="Profile key" hint="Only for Ayrshare Business plans with several profiles. Leave empty for the main profile." className="flex-1">
            <Input value={profileKey} onChange={(e) => setProfileKey(e.target.value)} placeholder="Optional" autoComplete="off" spellCheck={false} className="font-mono" disabled={!admin} />
          </Field>
          <Button type="submit" variant="secondary" disabled={!admin} loading={importAccounts.isPending}>
            Import linked accounts
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add an Ayrshare API key in{' '}
          <Link href="/settings/providers" className="text-primary hover:underline">
            AI providers
          </Link>{' '}
          to import accounts from Ayrshare.
        </p>
      )}
    </SettingsSection>
  );
}
