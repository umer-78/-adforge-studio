'use client';

import { CircleAlert, Megaphone, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PlatformIcon } from '@/components/app/platform-icon';
import { useAdsSetup, useCampaigns } from '@/components/distribution/use-distribution';
import { money, StatusPill } from '@/components/growth/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, Notice, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import type { CampaignView } from '@/lib/types';
import { formatNumber, timeAgo } from '@/lib/utils';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'draft', label: 'Drafts' },
  { value: 'failed', label: 'Failed' },
] as const;

export function AdsView() {
  const setup = useAdsSetup();
  const [status, setStatus] = useState<(typeof FILTERS)[number]['value']>('all');
  const campaigns = useCampaigns({ status: status === 'all' ? undefined : status });
  const accounts = setup.data?.accounts ?? [];
  const active = accounts.filter((a) => a.status === 'active');
  const needsPage = active.filter((a) => a.platform === 'meta' && !a.pageId);
  const broken = accounts.filter((a) => a.status === 'expired' || a.status === 'error');

  return (
    <div className="space-y-5">
      {setup.data && !active.length && (
        <Notice title="Connect an ad account" action={<Button size="sm" asChild><Link href="/settings/ad-accounts">Connect</Link></Button>}>
          {setup.data.platforms.some((p) => p.configured) ? 'Sign in with Meta or TikTok to launch campaigns.' : 'Add the Meta or TikTok app keys to the server environment, then sign in. The README lists what to register.'}
        </Notice>
      )}
      {needsPage.length > 0 && (
        <Notice tone="warning" title="Pick a Facebook Page" action={<Button size="sm" variant="outline" asChild><Link href="/settings/ad-accounts">Choose</Link></Button>}>
          Meta ads run as a Page. Choose one for {needsPage.map((a) => a.name ?? a.externalId).join(', ')}.
        </Notice>
      )}
      {broken.length > 0 && (
        <Notice tone="error" title="Reconnect an ad account" action={<Button size="sm" variant="outline" asChild><Link href="/settings/ad-accounts">Reconnect</Link></Button>}>
          {broken.map((a) => `${a.name ?? a.externalId}: ${a.statusDetail ?? 'sign-in expired'}`).join(' · ')}
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" value={status} onChange={setStatus} options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
        {active.length ? (
          <Button asChild variant="brand">
            <Link href="/ads/new">
              <Plus className="size-4" /> New campaign
            </Link>
          </Button>
        ) : (
          <Button variant="brand" disabled>
            <Plus className="size-4" /> New campaign
          </Button>
        )}
      </div>

      {campaigns.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : campaigns.isError ? (
        <EmptyState icon={<CircleAlert />} title="Could not load campaigns" />
      ) : !campaigns.data?.items.length ? (
        <EmptyState icon={<Megaphone />} title={status === 'all' ? 'No campaigns yet' : 'No campaigns here'} description="Pick your best videos, set a daily budget and where to show them. The campaign is created paused for you to review." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Campaign</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Daily budget</th>
                <th className="px-3 py-2.5 text-right font-medium">Spend</th>
                <th className="px-3 py-2.5 text-right font-medium">Impressions</th>
                <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                <th className="px-3 py-2.5 text-right font-medium">Results</th>
                <th className="px-3 py-2.5 text-right font-medium">Cost / result</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.data.items.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CampaignRow({ c }: { c: CampaignView }) {
  const cur = c.currency ?? c.account?.currency;
  const t = c.totals;
  return (
    <tr className="border-t transition hover:bg-accent/30">
      <td className="px-4 py-3">
        <Link href={`/ads/${c.id}`} className="flex items-center gap-3">
          {c.account && <PlatformIcon platform={c.account.platform} className="size-6" />}
          <div className="min-w-0">
            <div className="truncate font-medium hover:text-primary">{c.name}</div>
            <div className="text-xs text-muted-foreground">
              {c.ads.length} ad{c.ads.length === 1 ? '' : 's'} · {c.objective.replace(/_/g, ' ')} · {c.launchedAt ? `launched ${timeAgo(c.launchedAt)}` : `created ${timeAgo(c.createdAt)}`}
            </div>
          </div>
        </Link>
      </td>
      <td className="px-3 py-3">
        <StatusPill status={c.status} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{money(c.dailyBudget, cur)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{money(t.spend, cur)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatNumber(t.impressions)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{t.ctr == null ? '–' : `${t.ctr.toFixed(2)}%`}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatNumber(t.conversions)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{money(t.cpa, cur)}</td>
    </tr>
  );
}
