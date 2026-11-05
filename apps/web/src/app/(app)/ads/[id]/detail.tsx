'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CirclePause, CirclePlay, RefreshCw, Rocket, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { AssetThumb } from '@/components/app/asset-card';
import { PlatformIcon } from '@/components/app/platform-icon';
import { useCampaign } from '@/components/distribution/use-distribution';
import { money, StatusPill } from '@/components/growth/shared';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { EmptyState, Notice, Skeleton, Stat } from '@/components/ui/misc';
import { api, errorMessage } from '@/lib/api-client';
import type { AdView, CampaignView, JobView } from '@/lib/types';
import { cn, formatNumber, timeAgo } from '@/lib/utils';

const pct = (v: number | null) => (v == null ? '–' : `${v.toFixed(2)}%`);

export function CampaignDetail({ id }: { id: string }) {
  const q = useCampaign(id);
  if (q.isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />;
  if (q.isError || !q.data) return <EmptyState title="Campaign not found" description={q.error ? errorMessage(q.error) : undefined} action={<Button asChild variant="outline"><Link href="/ads">Back to Ads</Link></Button>} />;
  return <Loaded c={q.data} />;
}

function Loaded({ c }: { c: CampaignView }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState(c.name);
  const cur = c.currency ?? c.account?.currency ?? null;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['campaign', c.id] });
    qc.invalidateQueries({ queryKey: ['campaigns'] });
  };
  const later = () => setTimeout(refresh, 6000);
  const rename = useMutation({ mutationFn: (n: string) => api.patch<CampaignView>(`/campaigns/${c.id}`, { name: n }), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const launch = useMutation({ mutationFn: () => api.post<CampaignView>(`/campaigns/${c.id}/launch`), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const sync = useMutation({
    mutationFn: () => api.post<JobView>(`/campaigns/${c.id}/sync`),
    onSuccess: () => {
      toast.success('Fetching the latest results…');
      later();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setAll = useMutation({
    mutationFn: (status: 'active' | 'paused') => api.post<{ queued: number }>(`/campaigns/${c.id}/status`, { status, ...(status === 'active' ? { confirm: true } : {}) }),
    onSuccess: (r, status) => {
      toast.success(status === 'active' ? `Switching on ${r.queued} ad${r.queued === 1 ? '' : 's'}` : `Pausing ${r.queued} ad${r.queued === 1 ? '' : 's'}`);
      later();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/campaigns/${c.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      router.push('/ads');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const launched = c.ads.some((a) => a.launched);
  const canActivate = c.ads.some((a) => a.launched && a.status === 'paused');
  const running = c.ads.some((a) => a.status === 'active');
  const t = c.totals;
  const best = [...c.ads].filter((a) => a.launched && (a.metrics.impressions ?? 0) >= 100).sort((a, b) => (b.metrics.conversions ?? 0) - (a.metrics.conversions ?? 0) || (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0))[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <Link href="/ads" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Ads
          </Link>
          <div className="flex items-center gap-2">
            {c.account && <PlatformIcon platform={c.account.platform} className="size-6" />}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name.trim() !== c.name && rename.mutate(name.trim())}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              maxLength={200}
              aria-label="Campaign name"
              className="h-auto max-w-xl border-transparent bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none hover:border-input focus-visible:px-2"
            />
            <StatusPill status={c.status} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{c.account?.name ?? 'Ad account'}</span>
            <span>{money(c.dailyBudget, cur)} a day</span>
            <span className="capitalize">{c.objective.replace(/_/g, ' ')}</span>
            <span>{c.countries.join(', ')}</span>
            <span>
              Ages {c.ageMin}–{c.ageMax === 65 ? '65+' : c.ageMax}
            </span>
            {c.landingUrl && (
              <a href={c.landingUrl} target="_blank" rel="noreferrer" className="truncate hover:text-primary">
                {c.landingUrl.replace(/^https?:\/\//, '')}
              </a>
            )}
            {c.launchedAt && <span>Launched {timeAgo(c.launchedAt)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(c.status === 'draft' || c.status === 'failed') && (
            <Button variant="brand" size="sm" loading={launch.isPending} onClick={() => launch.mutate()}>
              <Rocket className="size-4" /> {c.status === 'failed' ? 'Try the launch again' : 'Create on platform (paused)'}
            </Button>
          )}
          {launched && (
            <Button variant="outline" size="sm" loading={sync.isPending} onClick={() => sync.mutate()}>
              <RefreshCw className="size-4" /> Refresh results
            </Button>
          )}
          {canActivate && (
            <Confirm
              title="Switch on every paused ad?"
              description={`They start spending right away, up to ${money(c.dailyBudget, cur)} a day for this campaign, until you pause them.`}
              confirmLabel="Start spending"
              onConfirm={() => setAll.mutateAsync('active')}
            >
              <Button size="sm">
                <CirclePlay className="size-4" /> Switch all on
              </Button>
            </Confirm>
          )}
          {running && (
            <Button size="sm" variant="outline" loading={setAll.isPending && setAll.variables === 'paused'} onClick={() => setAll.mutate('paused')}>
              <CirclePause className="size-4" /> Pause all
            </Button>
          )}
          {!launched && c.status !== 'launching' && (
            <Confirm title="Delete this campaign?" description="It was never created on the platform, so nothing else changes." confirmLabel="Delete" destructive onConfirm={() => remove.mutateAsync()}>
              <Button variant="ghost" size="icon-sm" aria-label="Delete campaign">
                <Trash2 className="size-4" />
              </Button>
            </Confirm>
          )}
        </div>
      </div>

      {c.status === 'launching' && <Notice title="Creating the campaign on the platform">Uploading the videos and creating the ads, all paused. This takes a minute or two.</Notice>}
      {c.error && <Notice tone="error" title="The platform returned an error">{c.error}</Notice>}
      {c.notes.length > 0 && (
        <Notice tone="warning" title="Set up a little differently">
          <ul className="list-disc pl-4">
            {c.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Spend" value={money(t.spend, cur)} />
        <Stat label="Impressions" value={formatNumber(t.impressions)} />
        <Stat label="Clicks" value={formatNumber(t.clicks)} hint={t.cpc != null ? `${money(t.cpc, cur)} per click` : undefined} />
        <Stat label="Click-through" value={pct(t.ctr)} />
        <Stat label="Results" value={formatNumber(t.conversions)} hint={t.cpa != null ? `${money(t.cpa, cur)} each` : undefined} />
        <Stat label="Return on spend" value={t.roas == null ? '–' : `${t.roas.toFixed(2)}×`} />
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Ad</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Spend</th>
              <th className="px-3 py-2.5 text-right font-medium">Impr.</th>
              <th className="px-3 py-2.5 text-right font-medium">CTR</th>
              <th className="px-3 py-2.5 text-right font-medium">CPC</th>
              <th className="px-3 py-2.5 text-right font-medium">Results</th>
              <th className="px-3 py-2.5 text-right font-medium">CPA</th>
              <th className="px-3 py-2.5 text-right font-medium">ROAS</th>
              <th className="px-3 py-2.5 text-right font-medium">Views</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {c.ads.map((a) => (
              <AdRow key={a.id} ad={a} cur={cur} budget={c.dailyBudget} best={best?.id === a.id} onChange={refresh} onLater={later} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Results are lifetime totals from the platform, refreshed every few hours. The star marks your pick; the highlighted row leads on results, then click-through.</p>
    </div>
  );
}

function AdRow({ ad: a, cur, budget, best, onChange, onLater }: { ad: AdView; cur: string | null; budget: number; best: boolean; onChange: () => void; onLater: () => void }) {
  const m = a.metrics;
  const winner = useMutation({ mutationFn: () => api.patch<AdView>(`/ads/${a.id}`, { isWinner: !a.isWinner }), onSuccess: onChange, onError: (e) => toast.error(errorMessage(e)) });
  const status = useMutation({
    mutationFn: (s: 'active' | 'paused') => api.post<JobView>(`/ads/${a.id}/status`, { status: s, ...(s === 'active' ? { confirm: true } : {}) }),
    onSuccess: (_, s) => {
      toast.success(s === 'active' ? 'Switching the ad on…' : 'Pausing the ad…');
      onLater();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <tr className={cn('border-t', best && 'bg-success/5')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {a.asset ? <AssetThumb asset={a.asset} className="aspect-[9/16] w-10 shrink-0 rounded-md" /> : <div className="aspect-[9/16] w-10 rounded-md bg-muted" />}
          <div className="min-w-0">
            <div className="truncate font-medium">{a.variantLabel ? `${a.variantLabel} · ` : ''}{a.headline || a.asset?.name || 'Ad'}</div>
            {a.reviewStatus && <div className="truncate text-xs text-muted-foreground">Review: {a.reviewStatus}</div>}
            {a.error && <div className="truncate text-xs text-destructive" title={a.error}>{a.error}</div>}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <StatusPill status={a.status} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{money(m.spend, cur)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatNumber(m.impressions)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{pct(m.ctr)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{money(m.cpc, cur)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatNumber(m.conversions)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{money(m.cpa, cur)}</td>
      <td className="px-3 py-3 text-right tabular-nums">{m.roas == null ? '–' : `${m.roas.toFixed(2)}×`}</td>
      <td className="px-3 py-3 text-right tabular-nums">{formatNumber(m.videoViews)}</td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button size="icon-xs" variant="ghost" aria-label={a.isWinner ? 'Unmark winner' : 'Mark as winner'} loading={winner.isPending} onClick={() => winner.mutate()}>
            <Star className={cn('size-3.5', a.isWinner && 'fill-amber-400 text-amber-400')} />
          </Button>
          {a.launched && a.status === 'paused' && (
            <Confirm title="Switch this ad on?" description={`It starts spending from the campaign budget (${money(budget, cur)} a day) until you pause it.`} confirmLabel="Start spending" onConfirm={() => status.mutateAsync('active')}>
              <Button size="xs" variant="outline">
                <CirclePlay className="size-3.5" /> On
              </Button>
            </Confirm>
          )}
          {a.status === 'active' && (
            <Button size="xs" variant="outline" loading={status.isPending} onClick={() => status.mutate('paused')}>
              <CirclePause className="size-3.5" /> Pause
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
