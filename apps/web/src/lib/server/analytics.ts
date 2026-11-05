import 'server-only';
import type { ServiceClient } from '@adforge/core/server';
import { check, type Caller } from './api';
import { adMetrics, postMetrics, toCampaignViews, toPostViews, totalAdMetrics, totalPostMetrics } from './distribution';
import type { AbTestView, AbVariantView, AdDayView, AdMetricsView, AnalyticsView, CampaignView, PostDayView, PostMetricsView, PostView, SocialPlatformId } from '@/lib/types';

const DAY_MS = 86_400_000;
/** Smallest sample per variant before a test names a leader: views for posts, impressions for ads. */
const MIN_TRIALS = { posts: 100, ads: 500 } as const;
/** Two-sided 95% confidence. */
const Z_95 = 1.96;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

/** UTC midnight that opens a window of `days` days ending today. */
export function windowStart(days: number, now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS);
}

function dayKeys(since: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10));
}

/** Two-proportion z statistic of a over b, or null when it cannot be computed. */
export function zScore(a: { successes: number; trials: number }, b: { successes: number; trials: number }): number | null {
  if (a.trials <= 0 || b.trials <= 0) return null;
  const pooled = (a.successes + b.successes) / (a.trials + b.trials);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.trials + 1 / b.trials));
  if (!se) return null;
  return (a.successes / a.trials - b.successes / b.trials) / se;
}

export function abTest(t: Omit<AbTestView, 'leaderId' | 'significant' | 'needsData'>): AbTestView {
  const min = MIN_TRIALS[t.kind];
  const ready = t.variants.filter((v) => v.trials >= min).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const [first, second] = ready;
  const leader = first && second && (first.rate ?? 0) > (second.rate ?? 0) ? first : null;
  const z = leader && second ? zScore(leader, second) : null;
  return { ...t, leaderId: leader?.id ?? null, significant: z != null && z >= Z_95, needsData: t.variants.length < 2 || ready.length < t.variants.length };
}

const rate = (successes: number, trials: number) => (trials > 0 ? successes / trials : null);
const engagements = (m: PostMetricsView) => num(m.likes) + num(m.comments) + num(m.shares) + num(m.saves);
const reach = (m: PostMetricsView) => num(m.views ?? m.impressions);
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function postVariant(p: PostView, i: number): AbVariantView {
  const trials = reach(p.totals);
  const successes = engagements(p.totals);
  return {
    id: p.id,
    label: p.abVariant ?? LETTERS[i] ?? String(i + 1),
    title: p.title ?? (p.caption ? p.caption.slice(0, 80) : null),
    thumbnailUrl: p.asset?.thumbnailUrl ?? null,
    status: p.status,
    platforms: p.platforms,
    trials,
    successes,
    rate: rate(successes, trials),
  };
}

/* ---------------------------------- Posts ---------------------------------- */

async function postSection(sb: ServiceClient, ws: string, since: string, keys: string[]): Promise<{ posts: AnalyticsView['posts']; tests: AbTestView[] }> {
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count: c, error } = await build(base());
    if (error) throw new Error(`Could not count posts: ${error.message}`);
    return c ?? 0;
  };
  const base = () => sb.from('posts').select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
  const [published, scheduled, failed, drafts, dailyRows, targets, groupRows] = await Promise.all([
    count((q) => q.in('status', ['published', 'partially_published']).gte('published_at', since)),
    count((q) => q.eq('status', 'scheduled')),
    count((q) => q.eq('status', 'failed').gte('updated_at', since)),
    count((q) => q.eq('status', 'draft')),
    sb.rpc('post_daily_metrics', { ws, since }).then((r) => check(r, 'Could not load daily post results')),
    sb.from('post_targets').select('post_id, platform, metrics').eq('workspace_id', ws).eq('status', 'published').gte('published_at', since).limit(5000).then((r) => check(r, 'Could not load published posts')),
    sb.from('posts').select('ab_group, published_at').eq('workspace_id', ws).not('ab_group', 'is', null).gte('published_at', since).order('published_at', { ascending: false }).limit(500).then((r) => check(r, 'Could not load A/B tests')),
  ]);

  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const daily: PostDayView[] = keys.map((day) => {
    const r = byDay.get(day);
    return { day, views: num(r?.views), impressions: num(r?.impressions), likes: num(r?.likes), comments: num(r?.comments), shares: num(r?.shares), saves: num(r?.saves), clicks: num(r?.clicks) };
  });
  const period = daily.reduce(
    (t, d) => ({ views: t.views + d.views, impressions: t.impressions + d.impressions, likes: t.likes + d.likes, comments: t.comments + d.comments, shares: t.shares + d.shares, saves: t.saves + d.saves, clicks: t.clicks + d.clicks }),
    { views: 0, impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0 },
  );

  const platformTargets = new Map<SocialPlatformId, PostMetricsView[]>();
  const reachByPost = new Map<string, number>();
  for (const t of targets) {
    const m = postMetrics(t.metrics);
    const platform = t.platform as SocialPlatformId;
    platformTargets.set(platform, [...(platformTargets.get(platform) ?? []), m]);
    reachByPost.set(t.post_id, (reachByPost.get(t.post_id) ?? 0) + reach(m));
  }
  const byPlatform = [...platformTargets].map(([platform, list]) => ({ platform, posts: list.length, totals: totalPostMetrics(list) })).sort((a, b) => reach(b.totals) - reach(a.totals));

  const topIds = [...reachByPost].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  const groups = [...new Set(groupRows.map((g) => g.ab_group!))].slice(0, 20);
  const [topRows, testRows, batches] = await Promise.all([
    topIds.length ? sb.from('posts').select('*').eq('workspace_id', ws).in('id', topIds).then((r) => check(r, 'Could not load top posts')) : [],
    groups.length ? sb.from('posts').select('*').eq('workspace_id', ws).in('ab_group', groups).neq('status', 'canceled').order('created_at').then((r) => check(r, 'Could not load A/B test posts')) : [],
    groups.length ? sb.from('variant_batches').select('name, ab_group').eq('workspace_id', ws).in('ab_group', groups).then((r) => check(r, 'Could not load variant batches')) : [],
  ]);
  const views = await toPostViews(sb, ws, [...topRows, ...testRows.filter((r) => !topIds.includes(r.id))]);
  const viewById = new Map(views.map((v) => [v.id, v]));
  const top = topIds.flatMap((id) => viewById.get(id) ?? []);

  const batchName = new Map(batches.map((b) => [b.ab_group, b.name]));
  const tests = groups.flatMap((group) => {
    const posts = testRows.filter((r) => r.ab_group === group).flatMap((r) => viewById.get(r.id) ?? []);
    if (!posts.length) return [];
    const first = posts[0]!;
    const started = posts.map((p) => p.publishedAt).filter((d): d is string => !!d).sort()[0] ?? null;
    return [
      abTest({
        id: group,
        kind: 'posts',
        name: batchName.get(group) ?? `Test: ${first.title ?? (first.caption.slice(0, 40) || 'untitled post')}`,
        metric: 'engagement',
        variants: posts.map(postVariant),
        startedAt: started,
      }),
    ];
  });

  return { posts: { counts: { published, scheduled, failed, drafts }, period, daily, byPlatform, top }, tests };
}

/* ----------------------------------- Ads ----------------------------------- */

const currencyOf = (c: Pick<CampaignView, 'currency' | 'account'>) => c.currency ?? c.account?.currency ?? null;

async function adSection(sb: ServiceClient, ws: string, since: string, keys: string[]): Promise<{ ads: NonNullable<AnalyticsView['ads']>; tests: AbTestView[] }> {
  const [dailyRows, launched, accounts, campaignRows] = await Promise.all([
    sb.rpc('ad_daily_metrics', { ws, since }).then((r) => check(r, 'Could not load daily ad results')),
    sb.from('ad_campaigns').select('currency, ad_account_id').eq('workspace_id', ws).not('launched_at', 'is', null).then((r) => check(r, 'Could not load campaigns')),
    sb.from('ad_accounts').select('id, currency').eq('workspace_id', ws).then((r) => check(r, 'Could not load ad accounts')),
    sb.from('ad_campaigns').select('*').eq('workspace_id', ws).not('launched_at', 'is', null).order('launched_at', { ascending: false }).limit(100).then((r) => check(r, 'Could not load campaigns')),
  ]);
  const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency]));
  const currencies = [...new Set(launched.map((c) => c.currency ?? accountCurrency.get(c.ad_account_id) ?? null).filter((c): c is string => !!c))];
  const mixedCurrency = currencies.length > 1;

  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const daily: AdDayView[] = keys.map((day) => {
    const r = byDay.get(day);
    return { day, spend: mixedCurrency ? null : num(r?.spend), impressions: num(r?.impressions), clicks: num(r?.clicks), conversions: num(r?.conversions), videoViews: num(r?.video_views) };
  });
  const sums = daily.reduce((t, d) => ({ spend: t.spend + (d.spend ?? 0), impressions: t.impressions + d.impressions, clicks: t.clicks + d.clicks, conversions: t.conversions + d.conversions, videoViews: t.videoViews + d.videoViews }), {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    videoViews: 0,
  });
  const spend = mixedCurrency ? null : Math.round(sums.spend * 10_000) / 10_000;
  const period: AdMetricsView = {
    ...adMetrics({}),
    impressions: sums.impressions,
    clicks: sums.clicks,
    spend,
    conversions: sums.conversions,
    videoViews: sums.videoViews,
    ctr: sums.impressions ? (sums.clicks / sums.impressions) * 100 : null,
    cpc: spend != null && sums.clicks ? spend / sums.clicks : null,
    cpm: spend != null && sums.impressions ? (spend / sums.impressions) * 1000 : null,
    cpa: spend != null && sums.conversions ? spend / sums.conversions : null,
  };

  const campaignViews = await toCampaignViews(sb, ws, campaignRows);
  const currencyGroups = new Map<string | null, AdMetricsView[]>();
  for (const c of campaignViews) {
    const key = currencyOf(c);
    currencyGroups.set(key, [...(currencyGroups.get(key) ?? []), ...c.ads.filter((a) => a.launched).map((a) => a.metrics)]);
  }
  const byCurrency = [...currencyGroups].filter(([, list]) => list.length).map(([currency, list]) => ({ currency, totals: totalAdMetrics(list) }));

  const campaigns = campaignViews.map((c) => ({
    id: c.id,
    name: c.name,
    platform: c.account?.platform ?? null,
    status: c.status,
    currency: currencyOf(c),
    ads: c.ads.length,
    launchedAt: c.launchedAt,
    totals: c.totals,
  }));

  const top = campaignViews
    .flatMap((c) => c.ads.filter((a) => a.launched && num(a.metrics.impressions) >= 100).map((a) => ({ ...a, campaignName: c.name, currency: currencyOf(c) })))
    .sort((a, b) => num(b.metrics.conversions) - num(a.metrics.conversions) || num(b.metrics.ctr) - num(a.metrics.ctr))
    .slice(0, 6);

  const tests = campaignViews
    .filter((c) => c.status !== 'draft' && c.status !== 'launching' && c.ads.filter((a) => a.launched).length >= 2)
    .slice(0, 10)
    .map((c) =>
      abTest({
        id: c.id,
        kind: 'ads',
        name: c.name,
        metric: 'ctr',
        startedAt: c.launchedAt,
        variants: c.ads
          .filter((a) => a.launched)
          .map((a, i) => {
            const trials = num(a.metrics.impressions);
            const successes = num(a.metrics.clicks);
            return {
              id: a.id,
              label: a.variantLabel ?? LETTERS[i] ?? String(i + 1),
              title: a.headline ?? a.asset?.name ?? null,
              thumbnailUrl: a.asset?.thumbnailUrl ?? null,
              status: a.status,
              platforms: c.account ? [c.account.platform] : [],
              trials,
              successes,
              rate: rate(successes, trials),
            };
          }),
      }),
    );

  return { ads: { currency: mixedCurrency ? null : (currencies[0] ?? null), mixedCurrency, period, daily, byCurrency, campaigns, top }, tests };
}

/* --------------------------------- Builder --------------------------------- */

export async function buildAnalytics(sb: ServiceClient, caller: Caller, days: number): Promise<AnalyticsView> {
  const since = windowStart(days);
  const sinceIso = since.toISOString();
  const keys = dayKeys(since, days);
  const withAds = caller.scopes.includes('ads');
  const [posts, ads] = await Promise.all([postSection(sb, caller.workspaceId, sinceIso, keys), withAds ? adSection(sb, caller.workspaceId, sinceIso, keys) : null]);
  const tests = [...posts.tests, ...(ads?.tests ?? [])].sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  return { days, since: sinceIso, posts: posts.posts, ads: ads?.ads ?? null, tests };
}
