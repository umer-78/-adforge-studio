'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePause, Megaphone, RefreshCw } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { PlatformIcon } from '@/components/app/platform-icon';
import { useAdsSetup } from '@/components/distribution/use-distribution';
import { goTo, isAdmin, SettingsSection, useOAuthResult } from '@/components/settings/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Confirm } from '@/components/ui/confirm';
import { EmptyState, Field, Notice, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import type { AdAccountView, AdsSetupView } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

const STATUS: Record<AdAccountView['status'], { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = {
  active: { label: 'Connected', variant: 'success' },
  expired: { label: 'Sign-in expired', variant: 'warning' },
  error: { label: 'Needs attention', variant: 'destructive' },
  revoked: { label: 'Disconnected', variant: 'outline' },
};

function useConnectAds() {
  return useMutation({
    mutationFn: (platform: 'meta' | 'tiktok') => api.post<{ url: string }>('/ad-accounts/connect', { platform, returnTo: '/settings/ad-accounts' }),
    onSuccess: ({ url }) => goTo(url),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function AdAccountsView() {
  const me = useMe();
  const qc = useQueryClient();
  const setup = useAdsSetup();
  const admin = isAdmin(me.data);
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ['ads-setup'] }), [qc]);
  useOAuthResult(refresh);
  const connect = useConnectAds();
  const accounts = (setup.data?.accounts ?? []).filter((a) => a.status !== 'revoked');
  const platforms = setup.data?.platforms ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border bg-surface-2/40 p-4 text-sm">
        <CirclePause className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-muted-foreground">Campaigns made here are always created paused on the platform. Nothing spends until you turn an ad on in Ads or in the platform&apos;s own manager.</p>
      </div>
      {!admin && me.data && <Notice tone="info">Only owners and admins can connect ad accounts or change their settings.</Notice>}

      <SettingsSection title="Ad accounts" description="Meta (Facebook and Instagram) and TikTok ad accounts this workspace can launch campaigns in.">
        {setup.isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : setup.isError ? (
          <Notice tone="error">Could not load ad accounts. {errorMessage(setup.error)}</Notice>
        ) : accounts.length ? (
          <div className="space-y-3">
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} admin={admin} reconnect={() => connect.mutate(a.platform)} reconnecting={connect.isPending && connect.variables === a.platform} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Megaphone />} title="No ad accounts yet" description="Sign in with Meta or TikTok below. Every ad account you grant access to is added." />
        )}
      </SettingsSection>

      <SettingsSection title="Connect" description="A platform shows as not set up until its app keys are added to the server (the README lists them and the permissions to request).">
        <div className="grid gap-2 sm:grid-cols-2">
          {platforms.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3">
              <PlatformIcon platform={p.id} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.configured ? (p.id === 'meta' ? 'Facebook and Instagram ads' : 'TikTok ads') : 'Not set up on this server'}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={!admin || !p.configured} loading={connect.isPending && connect.variables === p.id} onClick={() => connect.mutate(p.id)}>
                Connect
              </Button>
            </div>
          ))}
        </div>
        <AdLibraryLine setup={setup.data} />
      </SettingsSection>
    </div>
  );
}

function AdLibraryLine({ setup }: { setup: AdsSetupView | undefined }) {
  if (!setup) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Competitor ad search in Inspiration (Meta Ad Library): {setup.adLibrary ? <span className="text-success">available</span> : 'needs a Meta connection or a server Ad Library token'}.
    </p>
  );
}

function AccountCard({ account: a, admin, reconnect, reconnecting }: { account: AdAccountView; admin: boolean; reconnect: () => void; reconnecting: boolean }) {
  const qc = useQueryClient();
  const s = STATUS[a.status];
  const save = useMutation({
    mutationFn: (body: { pageId?: string; instagramUserId?: string | null; pixelId?: string | null }) => api.patch<AdAccountView>(`/ad-accounts/${a.id}`, body),
    onSuccess: (updated) => {
      qc.setQueryData<AdsSetupView>(['ads-setup'], (old) => (old ? { ...old, accounts: old.accounts.map((x) => (x.id === updated.id ? updated : x)) } : old));
      toast.success('Saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const identity = a.identities.find((i) => i.pageId === a.pageId) ?? null;
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <PlatformIcon platform={a.platform} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{a.name ?? a.externalId}</p>
          <p className="truncate text-xs text-muted-foreground">
            {a.platform === 'meta' ? 'Meta' : 'TikTok'} · {a.externalId}
            {a.currency && ` · ${a.currency}`}
            {a.timezone && ` · ${a.timezone}`}
            {a.status === 'active' && a.tokenExpiresAt && ` · sign-in expires ${timeAgo(a.tokenExpiresAt)}`}
          </p>
          {a.statusDetail && a.status !== 'active' && <p className="mt-0.5 text-xs text-warning">{a.statusDetail}</p>}
        </div>
        <Badge variant={s.variant}>{s.label}</Badge>
        {admin && a.status !== 'active' && (
          <Button size="xs" variant="outline" loading={reconnecting} onClick={reconnect}>
            <RefreshCw /> Reconnect
          </Button>
        )}
        {admin && <DisconnectButton account={a} />}
      </div>

      {a.platform === 'meta' && a.status === 'active' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Facebook Page" hint={a.identities.length ? 'The ads run as this Page.' : 'No Pages were shared. Reconnect and pick a Page.'}>
            <Select
              value={a.pageId ?? undefined}
              placeholder="Pick a Page"
              disabled={!admin || !a.identities.length || save.isPending}
              onValueChange={(pageId) => save.mutate({ pageId })}
              options={a.identities.map((i) => ({ value: i.pageId, label: i.pageName }))}
            />
          </Field>
          <Field label="Instagram account" hint={identity && !identity.instagramUserId ? 'This Page has no linked Instagram account.' : 'Placements on Instagram use it.'}>
            <Select
              value={a.instagramUserId ?? 'none'}
              disabled={!admin || !identity?.instagramUserId || save.isPending}
              onValueChange={(v) => save.mutate({ instagramUserId: v === 'none' ? null : v })}
              options={[
                { value: 'none', label: 'Facebook only' },
                ...(identity?.instagramUserId ? [{ value: identity.instagramUserId, label: identity.instagramUsername ? `@${identity.instagramUsername}` : identity.instagramUserId }] : []),
              ]}
            />
          </Field>
          <PixelField account={a} disabled={!admin || save.isPending} onChange={(pixelId) => save.mutate({ pixelId })} />
        </div>
      )}
      {a.platform === 'tiktok' && a.status === 'active' && (
        <p className="text-xs text-muted-foreground">{a.identityId ? 'The ad identity (name and avatar shown on ads) is set up.' : 'The ad identity (name and avatar shown on ads) is created on the first launch.'}</p>
      )}
    </Card>
  );
}

function PixelField({ account, disabled, onChange }: { account: AdAccountView; disabled: boolean; onChange: (id: string | null) => void }) {
  const pixels = useQuery({
    queryKey: ['ad-pixels', account.id],
    queryFn: () => api.get<{ items: { id: string; name: string; lastFiredAt: string | null }[] }>(`/ad-accounts/${account.id}/pixels`).then((r) => r.items),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const items = pixels.data ?? [];
  const options = [{ value: 'none', label: 'No pixel' }, ...items.map((p) => ({ value: p.id, label: p.name, hint: p.lastFiredAt ? `fired ${timeAgo(p.lastFiredAt)}` : 'never fired' }))];
  if (account.pixelId && !items.some((p) => p.id === account.pixelId)) options.push({ value: account.pixelId, label: account.pixelId, hint: 'saved' });
  return (
    <Field label="Pixel" hint={pixels.isError ? errorMessage(pixels.error) : 'Sales and lead campaigns optimize for it.'}>
      <Select value={account.pixelId ?? 'none'} disabled={disabled || pixels.isLoading} onValueChange={(v) => onChange(v === 'none' ? null : v)} options={options} placeholder={pixels.isLoading ? 'Loading…' : 'Pick a pixel'} />
    </Field>
  );
}

function DisconnectButton({ account }: { account: AdAccountView }) {
  const qc = useQueryClient();
  const name = account.name ?? account.externalId;
  return (
    <Confirm
      title={`Disconnect ${name}?`}
      description="Its sign-in token is deleted. Campaigns already created stay on the platform, and their history stays here."
      confirmLabel="Disconnect"
      destructive
      onConfirm={async () => {
        try {
          await api.delete(`/ad-accounts/${account.id}`);
          toast.success(`${name} disconnected`);
          void qc.invalidateQueries({ queryKey: ['ads-setup'] });
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
