'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Activity, CalendarClock, Coins, FileText, HardDrive, Image as ImageIcon, Layers, Send, ShoppingBag, Smartphone, Sparkles, Upload } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { formatBytes, formatUsd } from '@adforge/core';
import { AssetCard } from '@/components/app/asset-card';
import { BarChart, ShareBars } from '@/components/charts/bar-chart';
import type { StageItem } from '@/components/dashboard/creative-stage';
import { LiveJobs, Sparkline, StorageSplit, WeekStrip } from '@/components/dashboard/stat-visuals';
import { AnimatedNumber } from '@/components/fx/animated-number';
import { TiltCard } from '@/components/fx/tilt-card';
import { GenerationCard } from '@/components/generate/generation-card';
import { useStats } from '@/components/library/use-library';
import { Words } from '@/components/marketing/words';
import { Button } from '@/components/ui/button';
import { EmptyState, Progress, Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api-client';
import { useBrandColors } from '@/lib/hooks/use-brand-kits';
import { useMe } from '@/lib/hooks/use-me';
import type { AssetView, GenerationView, Page } from '@/lib/types';
import { usageKindLabel } from '@/lib/usage-labels';
import { cn, timeAgo } from '@/lib/utils';

// WebGL loads after the page shell, and only in the browser.
const CreativeStage = dynamic(() => import('@/components/dashboard/creative-stage').then((m) => m.CreativeStage), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center">
      <div className="aspect-[9/19] h-[78%] animate-pulse rounded-[2rem] bg-surface-3/60" />
    </div>
  ),
});

/** Shown on the stage until the library has something of its own. */
const SAMPLES: StageItem[] = [
  { id: null, name: 'Sample clip', poster: '/landing/showcase.jpg', video: '/landing/showcase.mp4', aspect: 9 / 16 },
  { id: null, name: 'Sample', poster: '/landing/kinetic.jpg', video: null, aspect: 9 / 16 },
  { id: null, name: 'Sample', poster: '/landing/compare.jpg', video: null, aspect: 9 / 16 },
];

function stageItem(a: AssetView): StageItem {
  const video = a.type === 'video' ? (a.previewUrl ?? a.proxyUrl ?? null) : null;
  return { id: a.id, name: a.name, poster: a.thumbnailUrl ?? (a.type === 'image' ? a.url : null), video, aspect: a.width && a.height ? a.width / a.height : 9 / 16 };
}

interface Usage {
  totalUsd: number;
  daily: { date: string; usd: number }[];
  byKind: { key: string; usd: number }[];
}
interface ActivityRow {
  id: string;
  verb: string;
  object_type: string;
  object_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
}
interface PostSummary {
  id: string;
  title: string | null;
  scheduledAt: string | null;
  platforms: string[];
  status: string;
}

const QUICK = [
  { href: '/generate', label: 'Generate video', icon: Sparkles },
  { href: '/photo', label: 'Product photos', icon: ImageIcon },
  { href: '/products', label: 'URL to video', icon: ShoppingBag },
  { href: '/scripts', label: 'Write a script', icon: FileText },
  { href: '/variants', label: 'Batch variants', icon: Layers },
  { href: '/publish', label: 'Publish', icon: Send },
];

function describe(a: ActivityRow): string {
  const d = a.data;
  const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  switch (a.verb) {
    case 'generated':
      return `Generated with ${s('model') || 'AI'}`;
    case 'generation.started':
      return `Started a generation${s('model') ? ` with ${s('model')}` : ''}`;
    case 'uploaded':
      return 'Uploaded a file';
    case 'rendered':
      return 'Rendered a video';
    case 'published':
      return `Published${s('platform') ? ` to ${s('platform')}` : ''}`;
    case 'share.created':
      return 'Created a share link';
    case 'consent.accepted':
      return `Recorded consent for ${s('subject') || 'a person'}`;
    case 'trash.emptied':
      return 'Emptied the trash';
    default:
      return a.verb.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }
}

const noopSubscribe = () => () => {};
const localHour = () => new Date().getHours();

const fade = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] as const } });

export function DashboardView() {
  const me = useMe();
  const stats = useStats();
  const usage = useQuery({ queryKey: ['usage', 30], queryFn: () => api.get<Usage>('/usage?days=30') });
  const assets = useQuery({ queryKey: ['assets', 'recent'], queryFn: () => api.get<Page<AssetView>>('/assets?limit=8') });
  const gens = useQuery({ queryKey: ['generations', 'dashboard'], queryFn: () => api.get<Page<GenerationView>>('/generations?limit=4') });
  const activity = useQuery({ queryKey: ['activity'], queryFn: () => api.get<{ items: ActivityRow[] }>('/activity?limit=12') });
  const posts = useQuery({ queryKey: ['posts', 'upcoming'], queryFn: () => api.get<{ items: PostSummary[] }>('/posts?status=scheduled&limit=5') });
  const name = me.data?.user.name?.split(' ')[0];
  // Local time only exists in the browser; the server-rendered shell says hello without it.
  const hour = useSyncExternalStore(noopSubscribe, localHour, () => null);
  const greeting = hour === null ? 'Welcome back' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const budget = me.data?.budget;
  const router = useRouter();
  const brand = useBrandColors();

  // The newest video plays on the phone; other recent pictures float around it.
  const visual = (assets.data?.items ?? []).filter((a) => (a.type === 'video' || a.type === 'image') && (a.thumbnailUrl || a.url));
  const heroAsset = visual.find((a) => a.type === 'video' && (a.previewUrl || a.proxyUrl)) ?? visual[0] ?? null;
  const hero = heroAsset ? stageItem(heroAsset) : SAMPLES[0]!;
  const cards = heroAsset ? visual.filter((a) => a.id !== heroAsset.id).slice(0, 4).map(stageItem) : SAMPLES.slice(1);
  const s = stats.data;
  const summary = !s
    ? 'Your library, spend, jobs and posts at a glance.'
    : s.asset_count === 0
      ? 'Upload or generate your first ad and it plays right here, in 3D.'
      : `${plural(s.asset_count, 'file')}, ${plural(s.generation_count, 'generation')} and ${plural(s.scheduled_posts, 'scheduled post')}. Your newest ad is playing on the phone.`;

  return (
    <div className="space-y-6">
      <motion.section {...fade(0)} className="relative isolate overflow-hidden rounded-3xl border bg-card">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="aurora -top-44 -left-32 size-[30rem] bg-[#7c5cff]/30" />
          <div className="aurora -right-24 -bottom-60 size-[28rem] bg-[#ff4d8d]/20 [animation-delay:-6s]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_72%_50%,black,transparent_68%)] bg-[size:44px_44px] opacity-40" />
        </div>
        <div className="grid items-center lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="relative z-10 p-6 sm:p-8 lg:py-10 lg:pr-0 lg:pl-10">
            <p className="text-sm text-muted-foreground">
              {greeting}
              {name ? `, ${name}` : ''}
            </p>
            <h1 className="mt-1 font-display text-4xl leading-[1.04] tracking-tight sm:text-5xl xl:text-6xl">
              <Words text="What are we" /> <Words text="making" start={3} innerClassName="text-gradient pr-1 italic" /> <Words text="today?" start={4} />
            </h1>
            <p className="hero-in mt-4 max-w-md text-sm text-pretty text-muted-foreground" style={{ '--d': '0.55s' } as CSSProperties}>
              {summary}
            </p>
            <div className="hero-in mt-6 flex flex-wrap gap-2" style={{ '--d': '0.7s' } as CSSProperties}>
              <Button variant="brand" asChild>
                <Link href="/generate">
                  <Sparkles className="size-4" /> Generate video
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/library">
                  <Upload className="size-4" /> Upload
                </Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href={heroAsset ? `/motion?tab=devices&screen=${heroAsset.id}` : '/motion?tab=devices'}>
                  <Smartphone className="size-4" /> Device mockup
                </Link>
              </Button>
            </div>
          </div>
          <div className="relative h-[300px] sm:h-[360px] lg:h-[420px]" role="img" aria-label={`${heroAsset ? `Your latest file, ${hero.name},` : 'A sample clip'} playing on a 3D phone, with recent work floating around it`}>
            {assets.isLoading ? null : <CreativeStage className="absolute inset-0" hero={hero} cards={cards} accent={brand[0]} onOpen={(id) => router.push(`/library/${id}`)} />}
            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
              <span className="glass flex max-w-[60%] items-center gap-2 truncate rounded-full border px-3 py-1.5 text-xs">
                <span className="relative flex size-1.5 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative size-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="truncate">{heroAsset ? `Now playing: ${hero.name}` : 'Sample clip'}</span>
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">Move your pointer to look around</span>
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {QUICK.map((q, i) => (
          <motion.div key={q.href} {...fade(i + 1)}>
            <TiltCard className="h-full rounded-2xl" max={9}>
              <Link href={q.href} className="sheen group flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 transition duration-300 ease-out-expo hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_var(--glow)]">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition duration-500 ease-spring group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-brand group-hover:text-white">
                  <q.icon className="size-4" />
                </span>
                <span className="text-sm font-medium">{q.label}</span>
              </Link>
            </TiltCard>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Tile i={7} className="lg:col-span-2 lg:row-span-2" title="Spend, last 30 days" icon={<Coins />} action={<Link className="text-xs text-primary hover:underline" href="/settings/usage">Details</Link>}>
          {usage.data ? (
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <AnimatedNumber className="text-3xl font-semibold tabular-nums" value={usage.data.totalUsd} format={formatUsd} />
                {budget && budget.budgetUsd > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {formatUsd(budget.spentUsd)} of {formatUsd(budget.budgetUsd)} this month
                  </span>
                )}
              </div>
              {budget && budget.budgetUsd > 0 && <Progress value={(budget.spentUsd / budget.budgetUsd) * 100} />}
              <BarChart label="Daily spend" data={usage.data.daily.map((d) => ({ label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: d.usd }))} format={(v) => formatUsd(v)} />
              {usage.data.byKind.length > 0 && <ShareBars data={usage.data.byKind.slice(0, 5).map((k) => ({ key: k.key, label: usageKindLabel(k.key), value: k.usd }))} format={(v) => formatUsd(v)} />}
            </div>
          ) : (
            <Skeleton className="h-56" />
          )}
        </Tile>
        <Tile i={8} title="Storage" icon={<HardDrive />}>
          <Big value={s?.storage_bytes} format={formatBytes} hint={s ? plural(s.asset_count, 'file') : ''}>
            {s && <StorageSplit byType={s.storage_by_type ?? { video: s.storage_bytes }} />}
          </Big>
        </Tile>
        <Tile i={9} title="Running now" icon={<Activity />}>
          <Big value={s?.active_jobs} hint={s?.active_jobs === 1 ? 'job in the queue' : 'jobs in the queue'}>
            <LiveJobs />
          </Big>
        </Tile>
        <Tile i={10} title="Generations" icon={<Sparkles />}>
          <Big value={s?.generation_count} hint="all time">
            {s?.generations_daily && <Sparkline days={s.generations_daily} unit={['generation', 'generations']} />}
          </Big>
        </Tile>
        <Tile i={11} title="Posts" icon={<CalendarClock />}>
          <Big value={s?.scheduled_posts} hint={s ? `scheduled · ${s.published_posts} published` : ''}>
            <WeekStrip />
          </Big>
        </Tile>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Tile i={12} className="xl:col-span-2" title="Recent files" action={<Link className="text-xs text-primary hover:underline" href="/library">Open library</Link>}>
          {assets.isLoading ? (
            <Skeleton className="h-48" />
          ) : assets.data?.items.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {assets.data.items.map((a, i) => (
                <TiltCard key={a.id} className="rounded-xl" max={6}>
                  <Link href={`/library/${a.id}`} className="rise-in block" style={{ animationDelay: `${i * 60}ms` }}>
                    <AssetCard asset={a} />
                  </Link>
                </TiltCard>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Upload />} title="No files yet" description="Upload footage, product photos or music to get started." className="py-8" />
          )}
        </Tile>
        <Tile i={13} title="Activity">
          {activity.data?.items.length ? (
            <ul className="space-y-2.5">
              {activity.data.items.map((a, i) => (
                <li key={a.id} className="rise-in flex items-start justify-between gap-3 text-sm" style={{ animationDelay: `${200 + i * 50}ms` }}>
                  <span className="text-foreground/90">{describe(a)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Your recent actions show up here.</p>
          )}
        </Tile>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Tile i={14} className="xl:col-span-2" title="Latest generations" action={<Link className="text-xs text-primary hover:underline" href="/generate">Generate</Link>}>
          {gens.data?.items.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {gens.data.items.map((g) => (
                <TiltCard key={g.id} className="rounded-xl" max={6}>
                  <GenerationCard gen={g} />
                </TiltCard>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing generated yet.</p>
          )}
        </Tile>
        <Tile i={15} title="Up next" action={<Link className="text-xs text-primary hover:underline" href="/publish?view=calendar">Calendar</Link>}>
          {posts.data?.items.length ? (
            <ul className="space-y-2">
              {posts.data.items.map((p, i) => (
                <li key={p.id} className="rise-in rounded-lg border p-2.5 text-sm transition hover:border-primary/40" style={{ animationDelay: `${200 + i * 60}ms` }}>
                  <div className="truncate font-medium">{p.title ?? 'Untitled post'}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.scheduledAt ? new Date(p.scheduledAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Not scheduled'} · {p.platforms.join(', ')}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No scheduled posts.</p>
          )}
        </Tile>
      </div>
    </div>
  );
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function Tile({ title, icon, action, children, className, i }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; i: number }) {
  return (
    <motion.section {...fade(i)} className={cn('flex flex-col rounded-2xl border bg-card p-4 transition-colors duration-300 hover:border-primary/25 sm:p-5', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground [&_svg]:size-4">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

/** A headline number that counts up, with its chart pinned to the bottom of the tile. */
function Big({ value, hint, format, children }: { value: number | undefined; hint: string; format?: (v: number) => string; children?: ReactNode }) {
  return value == null ? (
    <Skeleton className="h-12" />
  ) : (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <AnimatedNumber className="text-3xl font-semibold tracking-tight tabular-nums" value={value} format={format} />
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      </div>
      {children && <div className="mt-auto">{children}</div>}
    </div>
  );
}
