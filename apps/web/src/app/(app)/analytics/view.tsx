'use client';

import { BadgeCheck, ChartColumn, CircleAlert, FlaskConical, Hourglass, Star, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AssetThumb } from '@/components/app/asset-card';
import { PlatformIcon, PLATFORM_META } from '@/components/app/platform-icon';
import { CompareBars, TimeSeries } from '@/components/charts/time-series';
import { MetricsLine } from '@/components/distribution/post-sheet';
import { useAnalytics } from '@/components/distribution/use-distribution';
import { money, StatusPill } from '@/components/growth/shared';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Notice, Skeleton, Stat } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { useLocalSetting } from '@/lib/hooks/use-local-setting';
import type { AbTestView, AnalyticsView } from '@/lib/types';
import { cn, formatNumber, formatPercent } from '@/lib/utils';

const RANGES = ['7', '30', '90'] as const;
const n = (v: number) => formatNumber(v);

export function AnalyticsDashboard() {
  const [range, setRange] = useLocalSetting<(typeof RANGES)[number]>('analytics-range', '30');
  const q = useAnalytics((RANGES as readonly string[]).includes(range) ? Number(range) : 30);
  const d = q.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: `Last ${r} days` }))} />
        {q.isFetching && d && <span className="text-xs text-muted-foreground">Updating…</span>}
      </div>
      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : q.isError || !d ? (
        <EmptyState icon={<CircleAlert />} title="Could not load analytics" />
      ) : (
        <div className={cn('space-y-8 transition-opacity', q.isFetching && 'opacity-70')}>
          <PostsSection d={d} />
          {d.ads ? <AdsSection ads={d.ads} /> : <Notice title="Ad results are hidden">This API key does not have the ads scope.</Notice>}
          <TestsSection tests={d.tests} />
        </div>
      )}
    </div>
  );
}

function PostsSection({ d }: { d: AnalyticsView }) {
  const p = d.posts;
  const engagement = p.period.likes + p.period.comments + p.period.shares + p.period.saves;
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-lg font-semibold">Organic posts</h2>
        <Link href="/publish?tab=posts" className="text-xs text-muted-foreground hover:text-primary">
          All posts
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Views" value={n(p.period.views)} hint={`${n(p.period.impressions)} impressions`} />
        <Stat label="Engagements" value={n(engagement)} hint={p.period.views ? `${formatPercent(engagement / p.period.views)} of views` : 'likes, comments, shares, saves'} />
        <Stat label="Published" value={n(p.counts.published)} hint={p.counts.failed ? `${p.counts.failed} failed` : 'posts in this period'} />
        <Stat label="Scheduled" value={n(p.counts.scheduled)} hint={p.counts.drafts ? `${p.counts.drafts} drafts` : 'still to go out'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TimeSeries title="Views" data={p.daily.map((x) => ({ day: x.day, value: x.views }))} format={n} empty="Views appear once published posts report results." />
        <TimeSeries title="Engagements" kind="bar" data={p.daily.map((x) => ({ day: x.day, value: x.likes + x.comments + x.shares + x.saves }))} format={n} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <h3 className="text-sm font-medium">By platform</h3>
          {p.byPlatform.length ? (
            <CompareBars
              rows={p.byPlatform.map((b) => ({
                key: b.platform,
                label: (
                  <>
                    <PlatformIcon platform={b.platform} className="size-4" /> {PLATFORM_META[b.platform]?.label ?? b.platform}
                  </>
                ),
                value: b.totals.views ?? b.totals.impressions ?? 0,
                note: `${b.posts} post${b.posts === 1 ? '' : 's'}`,
                highlight: true,
              }))}
              format={(v) => `${n(v)} views`}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Nothing published in this period.</p>
          )}
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <h3 className="text-sm font-medium">Top posts</h3>
          {p.top.length ? (
            <ol className="space-y-2">
              {p.top.map((post, i) => (
                <li key={post.id}>
                  <Link href={`/publish?tab=posts&post=${post.id}`} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-accent/50">
                    <span className="w-4 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                    {post.asset ? <AssetThumb asset={post.asset} className="size-11 shrink-0 rounded-lg" hoverPlay={false} /> : <div className="size-11 rounded-lg bg-muted" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{post.title || post.caption || post.asset?.name || 'Post'}</div>
                      <MetricsLine m={post.totals} className="block truncate text-xs text-muted-foreground" />
                    </div>
                    <span className="flex -space-x-1">
                      {post.platforms.map((pl) => (
                        <PlatformIcon key={pl} platform={pl} className="size-4" />
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">Your best posts of the period show here.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function AdsSection({ ads }: { ads: NonNullable<AnalyticsView['ads']> }) {
  const cur = ads.currency;
  const p = ads.period;
  const pct = (v: number | null) => (v == null ? '–' : `${v.toFixed(2)}%`);
  if (!ads.campaigns.length && !p.impressions)
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ads</h2>
        <EmptyState icon={<ChartColumn />} title="No ad results yet" description="Launch a campaign in Ads. Results sync every few hours once ads are on." />
      </section>
    );
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-lg font-semibold">Ads</h2>
        <Link href="/ads" className="text-xs text-muted-foreground hover:text-primary">
          All campaigns
        </Link>
      </div>
      {ads.mixedCurrency && (
        <Notice tone="warning" title="Several currencies">
          Spend is shown per currency because your ad accounts bill in {ads.byCurrency.map((b) => b.currency ?? 'unknown').join(' and ')}.
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {ads.mixedCurrency ? (
          ads.byCurrency.map((b) => <Stat key={b.currency ?? 'x'} label={`Spend (${b.currency ?? '?'}, lifetime)`} value={money(b.totals.spend, b.currency)} />)
        ) : (
          <Stat label="Spend" value={money(p.spend, cur)} hint={p.cpc != null ? `${money(p.cpc, cur)} per click` : undefined} />
        )}
        <Stat label="Impressions" value={n(p.impressions ?? 0)} hint={p.cpm != null ? `${money(p.cpm, cur)} per 1,000` : undefined} />
        <Stat label="Clicks" value={n(p.clicks ?? 0)} />
        <Stat label="Click-through" value={pct(p.ctr)} />
        <Stat label="Results" value={n(p.conversions ?? 0)} hint={p.cpa != null ? `${money(p.cpa, cur)} each` : undefined} />
        <Stat label="Video views" value={n(p.videoViews ?? 0)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {!ads.mixedCurrency && <TimeSeries title={`Spend${cur ? ` (${cur})` : ''}`} kind="bar" data={ads.daily.map((x) => ({ day: x.day, value: x.spend ?? 0 }))} format={(v) => money(v, cur)} empty="No spend in this period. Ads only spend once you switch them on." />}
        <TimeSeries title="Clicks" data={ads.daily.map((x) => ({ day: x.day, value: x.clicks }))} format={n} />
        {ads.mixedCurrency && <TimeSeries title="Impressions" data={ads.daily.map((x) => ({ day: x.day, value: x.impressions }))} format={n} />}
      </div>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Campaign (lifetime)</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Spend</th>
              <th className="px-3 py-2.5 text-right font-medium">Impr.</th>
              <th className="px-3 py-2.5 text-right font-medium">CTR</th>
              <th className="px-3 py-2.5 text-right font-medium">Results</th>
              <th className="px-3 py-2.5 text-right font-medium">CPA</th>
              <th className="px-3 py-2.5 text-right font-medium">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {ads.campaigns.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2.5">
                  <Link href={`/ads/${c.id}`} className="flex items-center gap-2 hover:text-primary">
                    {c.platform && <PlatformIcon platform={c.platform} className="size-5" />}
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.ads} ads</span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill status={c.status} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(c.totals.spend, c.currency)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(c.totals.impressions)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pct(c.totals.ctr)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(c.totals.conversions)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(c.totals.cpa, c.currency)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.totals.roas == null ? '–' : `${c.totals.roas.toFixed(2)}×`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ads.top.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Best ads</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ads.top.map((a, i) => (
              <Link key={a.id} href={`/ads/${a.campaignId}`} className="flex gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/50">
                {a.asset ? <AssetThumb asset={a.asset} className="aspect-[9/16] w-14 shrink-0 rounded-lg" hoverPlay={false} /> : <div className="aspect-[9/16] w-14 rounded-lg bg-muted" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {i === 0 && <Trophy className="size-3.5 text-amber-400" aria-label="Top ad" />}
                    {a.isWinner && <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Marked winner" />}
                    <span className="truncate text-sm font-medium">{a.variantLabel ? `${a.variantLabel} · ` : ''}{a.headline || a.asset?.name || 'Ad'}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{a.campaignName}</div>
                  <div className="flex flex-wrap gap-x-3 text-xs tabular-nums">
                    <span>{formatNumber(a.metrics.conversions)} results</span>
                    <span>{pct(a.metrics.ctr)} CTR</span>
                    <span>{money(a.metrics.cpa, a.currency)} CPA</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TestsSection({ tests }: { tests: AbTestView[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">A/B tests</h2>
        <p className="text-xs text-muted-foreground">Posts compare engagement per view; ads compare click-through. A leader is named once every variant has enough data, and called a winner at 95% confidence.</p>
      </div>
      {!tests.length ? (
        <EmptyState icon={<FlaskConical />} title="No tests running" description="Make variants of an edit and post them as an A/B test, or launch them as ads in one campaign." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tests.map((t) => (
            <TestCard key={`${t.kind}-${t.id}`} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function TestCard({ t }: { t: AbTestView }) {
  const leader = t.variants.find((v) => v.id === t.leaderId);
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{t.name}</div>
          <div className="text-xs text-muted-foreground">
            {t.kind === 'posts' ? 'Organic posts · engagement rate' : 'Ads · click-through rate'} · {t.variants.length} variants
          </div>
        </div>
        {t.significant && leader ? (
          <Badge variant="success">
            <BadgeCheck /> {leader.label} wins
          </Badge>
        ) : leader ? (
          <Badge variant="secondary">
            <Trophy /> {leader.label} leads
          </Badge>
        ) : (
          <Badge variant="outline">
            <Hourglass /> Gathering data
          </Badge>
        )}
      </div>
      <CompareBars
        rows={t.variants.map((v) => ({
          key: v.id,
          label: (
            <>
              <span className="font-medium">{v.label}</span>
              <span className="truncate text-muted-foreground">{v.title}</span>
            </>
          ),
          value: v.rate,
          note: `${formatNumber(v.successes)} / ${formatNumber(v.trials)}`,
          highlight: !t.leaderId || v.id === t.leaderId,
        }))}
        format={(v) => formatPercent(v, 2)}
      />
      {t.needsData && <p className="text-[11px] text-muted-foreground">Some variants have fewer than {t.kind === 'posts' ? '100 views' : '500 impressions'}, so the result can still change.</p>}
      {leader && !t.significant && !t.needsData && <p className="text-[11px] text-muted-foreground">The gap is not yet clear enough to call. Keep it running or add budget.</p>}
    </div>
  );
}
