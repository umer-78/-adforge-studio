'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, Hand, Play, RotateCcw, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SAFE_ZONES_BY_ID } from '@adforge/core';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, Notice } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import type { AssetView, Page, SocialPlatformId } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FeedCard, fillsFrame, FRAME_H, FramePost, PhoneFrame, PLACEMENTS, ScreenShell, type Placement, type PostMediaSource, type PreviewPost } from './phone';

const CTAS = ['Learn more', 'Shop now', 'Sign up', 'Download', 'Book now', 'Get offer', 'Watch more', 'Contact us'];
const NO_CTA = 'none';

export interface FeedPreviewDefaults {
  handle?: string | null;
  avatarUrl?: string | null;
  caption?: string;
  platform?: SocialPlatformId | null;
}

const aspectOf = (a: AssetView) => (a.width && a.height ? a.width / a.height : null);

/** The placement a file most likely runs in, from its shape and the platform it is going to. */
export function guessPlacement(aspect: number | null, platform?: SocialPlatformId | null): Placement {
  const vertical = aspect != null && aspect < 0.7;
  if (platform === 'tiktok') return 'tiktok';
  if (platform === 'youtube') return vertical ? 'shorts' : 'feed';
  if (!platform || platform === 'instagram' || platform === 'facebook') return vertical ? 'reels' : 'feed';
  return 'feed';
}

const toHandle = (name: string | null | undefined) =>
  (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'your_brand';

function mediaOf(a: AssetView): PostMediaSource {
  return a.type === 'video' ? { kind: 'video', src: a.proxyUrl ?? a.url, poster: a.thumbnailUrl, aspect: aspectOf(a) } : { kind: 'image', src: a.url, poster: a.thumbnailUrl ?? a.url, aspect: aspectOf(a) };
}

/** A button that opens the feed preview for a finished video or photo. */
export function FeedPreviewButton({ asset, defaults, label = 'Feed preview', ...props }: { asset: AssetView; defaults?: FeedPreviewDefaults; label?: string } & Omit<ButtonProps, 'onClick'>) {
  const [open, setOpen] = useState(false);
  const usable = (asset.type === 'video' || asset.type === 'image') && asset.status === 'ready' && !!asset.url;
  return (
    <>
      <Button variant="outline" size="sm" {...props} disabled={!usable || props.disabled} onClick={() => setOpen(true)}>
        <Smartphone className="size-4" /> {label}
      </Button>
      {open && <FeedPreviewDialog asset={asset} defaults={defaults ?? {}} onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedPreviewDialog({ asset, defaults, onClose }: { asset: AssetView; defaults: FeedPreviewDefaults; onClose: () => void }) {
  const me = useMe();
  const aspect = aspectOf(asset);
  const [placement, setPlacement] = useState<Placement>(() => guessPlacement(aspect, defaults.platform));
  const [handleInput, setHandle] = useState<string | null>(null);
  const [caption, setCaption] = useState(defaults.caption ?? '');
  const [cta, setCta] = useState(CTAS[0]!);
  const [zones, setZones] = useState(false);
  const [sound, setSound] = useState(false);
  const [vision, setVision] = useState<Vision>('typical');
  const [mode, setMode] = useState<'preview' | 'test'>('preview');

  const handle = handleInput ?? defaults.handle ?? toHandle(me.data?.workspace.name);
  const post: PreviewPost = { media: mediaOf(asset), handle, avatarUrl: defaults.avatarUrl ?? null, caption, cta: cta === NO_CTA ? null : cta };
  const test = useScrollTest(asset, post);
  const label = PLACEMENTS.find((p) => p.id === placement)!;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Feed preview</DialogTitle>
          <DialogDescription>See “{asset.name}” the way people meet it on a phone, then test whether it makes you stop scrolling.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="h-[min(620px,64vh)] md:h-[min(700px,72vh)]" style={{ filter: VISION[vision].filter }}>
            <VisionFilters />
            <PhoneFrame label={`${asset.name} as a ${label.hint} ${post.cta ? 'ad' : 'post'}`}>
              {mode === 'preview' ? <PreviewScreen placement={placement} post={post} muted={!sound} zones={zones} /> : <TestScreen test={test} placement={placement} muted={!sound} />}
            </PhoneFrame>
          </div>
          <div className="min-w-0 space-y-4">
            <Segmented value={mode} onChange={(m) => { test.reset(); setMode(m); }} options={[{ value: 'preview', label: 'Preview' }, { value: 'test', label: 'Scroll test' }]} />
            <Field label="Placement">
              <Segmented size="sm" value={placement} onChange={(p) => { test.reset(); setPlacement(p); }} options={PLACEMENTS.map((p) => ({ value: p.id, label: p.label, title: p.hint }))} />
            </Field>
            {mode === 'preview' ? (
              <>
                <Field label="Account name" htmlFor="fp-handle">
                  <Input id="fp-handle" value={handle} onChange={(e) => setHandle(e.target.value.replace(/\s+/g, '_').slice(0, 30))} />
                </Field>
                <Field label="Caption" htmlFor="fp-caption">
                  <Textarea id="fp-caption" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} placeholder="The caption people will see under your ad" />
                </Field>
                <Field label="Button">
                  <Select aria-label="Button" value={cta} onValueChange={setCta} options={[...CTAS.map((c) => ({ value: c, label: c })), { value: NO_CTA, label: 'No button (regular post)' }]} />
                </Field>
                <Toggle label="Show safe zones" hint="What the app covers, and where text is safe." checked={zones} onChange={setZones} />
                <Toggle label="Sound" hint="Feeds start muted, so most people see your ad without sound." checked={sound} onChange={setSound} />
                <Field label="How people see it" hint={VISION[vision].hint}>
                  <Select aria-label="How people see it" value={vision} onValueChange={(v) => setVision(v as Vision)} options={(Object.keys(VISION) as Vision[]).map((v) => ({ value: v, label: VISION[v].label }))} />
                </Field>
                <Notes asset={asset} placement={placement} zones={zones} />
              </>
            ) : (
              <TestPanel test={test} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Color vision simulations (Machado, Oliveira and Fernandes 2009, full severity, applied in linear
 * light) and two common viewing conditions, to check that text and products still read.
 */
type Vision = 'typical' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia' | 'blur';
const VISION: Record<Vision, { label: string; hint: string; filter?: string }> = {
  typical: { label: 'Typical vision', hint: 'Simulate color blindness and low vision to check text and products still read.' },
  deuteranopia: { label: 'Green-blind (deuteranopia)', hint: 'The most common color blindness, about 5% of men. Reds and greens look alike.', filter: 'url(#af-deuteranopia)' },
  protanopia: { label: 'Red-blind (protanopia)', hint: 'About 1% of men. Reds look dark and close to greens.', filter: 'url(#af-protanopia)' },
  tritanopia: { label: 'Blue-blind (tritanopia)', hint: 'Rare. Blues and greens, and yellows and pinks, look alike.', filter: 'url(#af-tritanopia)' },
  achromatopsia: { label: 'No color', hint: 'Shows whether contrast alone carries the message.', filter: 'grayscale(1)' },
  blur: { label: 'Blurry (low vision)', hint: 'Small text that blurs away here is hard to read on a phone at arm’s length.', filter: 'blur(2px)' },
};
const MATRICES = {
  protanopia: '0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0 0 0 0 1 0',
  deuteranopia: '0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0',
  tritanopia: '1.255528 -0.076749 -0.178779 0 0 -0.078411 0.930809 0.147602 0 0 0.004733 0.691367 0.303900 0 0 0 0 0 1 0',
};

function VisionFilters() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      {Object.entries(MATRICES).map(([id, values]) => (
        <filter key={id} id={`af-${id}`} colorInterpolationFilters="linearRGB">
          <feColorMatrix type="matrix" values={values} />
        </filter>
      ))}
    </svg>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 text-sm">
      <span>
        {label}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Notes({ asset, placement, zones }: { asset: AssetView; placement: Placement; zones: boolean }) {
  const aspect = aspectOf(asset);
  const size = asset.width && asset.height ? `${asset.width}×${asset.height}` : 'not vertical';
  const notes: ReactNode[] = [];
  if (placement !== 'feed' && !fillsFrame(aspect)) notes.push(<>This file is {size}. {PLACEMENTS.find((p) => p.id === placement)!.label} fills a tall 9:16 screen, so it plays with blurred bars. Reframe it to 9:16 from its page in the Library.</>);
  if (placement === 'feed' && aspect != null && aspect < 0.8) notes.push(<>Feeds crop tall media to 4:5, so the top and bottom of this file are cut off. Keep text and logos in the middle.</>);
  return (
    <div className="space-y-3">
      {notes.map((n, i) => (
        <Notice key={i} tone="warning">
          {n}
        </Notice>
      ))}
      {zones && (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-sm border border-red-400/80 bg-red-500/25" /> Covered by the app’s buttons and captions
          </p>
          <p className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-sm outline-2 outline-sky-300 outline-dashed" /> Where text and logos are safe
          </p>
          <p>{SAFE_ZONES_BY_ID[placement].source}.</p>
        </div>
      )}
    </div>
  );
}

/** A second, neutral post under the preview so the ad is seen in context. */
const NEXT_POST: PreviewPost = { media: null, handle: 'next.post', avatarUrl: null, caption: '', cta: null, sample: true, tint: 3 };

function PreviewScreen({ placement, post, muted, zones }: { placement: Placement; post: PreviewPost; muted: boolean; zones: boolean }) {
  if (placement === 'feed') {
    return (
      <ScreenShell placement="feed">
        <div className="h-full overflow-y-auto [scrollbar-width:none]">
          <FeedCard post={post} active muted={muted} showZones={zones} />
          <FeedCard post={NEXT_POST} active={false} muted />
        </div>
      </ScreenShell>
    );
  }
  return (
    <ScreenShell placement={placement}>
      <FramePost placement={placement} post={post} active muted={muted} showZones={zones} />
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ Scroll test */

const SPEEDS = { fast: 1200, normal: 1700, slow: 2500 } as const;
type Speed = keyof typeof SPEEDS;
const MOVE_MS = 320;
const FEED_LENGTH = 9;

const SAMPLE_HANDLES = ['daily.eats', 'trail.miles', 'lena.studio', 'urban.sketch', 'homebrew.lab', 'coastline.co', 'pixel.pantry', 'north.knit'];
const SAMPLE_CAPTIONS = ['Sunday reset, done right', 'New route, same legs', 'Studio day: glazing the last batch', 'Five-minute sketch from the window', 'Batch 14 is the best yet', 'Golden hour never misses', 'The easiest weeknight pasta', 'Finished the winter scarf'];

interface RunResult {
  /** Feed position the person stopped on, or null when they reached the end. */
  stoppedOn: number | null;
  adIndex: number;
  /** Seconds the ad had been on screen when they stopped on it. */
  adSeconds: number | null;
}

type Phase = { kind: 'idle' } | { kind: 'countdown'; n: number } | { kind: 'running' } | { kind: 'done'; result: RunResult };

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function useScrollTest(asset: AssetView, ad: PreviewPost) {
  const [speed, setSpeed] = useState<Speed>('normal');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [index, setIndex] = useState(0);
  const [items, setItems] = useState<PreviewPost[]>([]);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const timer = useRef<number | null>(null);
  const changedAt = useRef(0);
  const adShownAt = useRef<number | null>(null);
  const live = useRef({ index: 0, adIndex: -1 });

  // Other recent photos and videos from the library stand in for the posts around the ad.
  const library = useQuery({
    queryKey: ['assets', 'feed-test'],
    queryFn: () => api.get<Page<AssetView>>('/assets?limit=24'),
    staleTime: 60_000,
  });
  const others = useMemo(
    () => (library.data?.items ?? []).filter((a) => a.id !== asset.id && a.status === 'ready' && !!a.url && (a.type === 'video' || a.type === 'image')),
    [library.data, asset.id],
  );

  const clear = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clear, [clear]);

  const reset = useCallback(() => {
    clear();
    setPhase({ kind: 'idle' });
    setIndex(0);
  }, [clear]);

  const finish = useCallback(
    (result: RunResult) => {
      clear();
      setPhase({ kind: 'done', result });
      setRuns((r) => [result, ...r].slice(0, 10));
    },
    [clear],
  );

  const start = useCallback(() => {
    clear();
    const fillers: PreviewPost[] = shuffle(others)
      .slice(0, FEED_LENGTH - 1)
      .map((a, i) => ({ media: mediaOf(a), handle: SAMPLE_HANDLES[i % SAMPLE_HANDLES.length]!, avatarUrl: null, caption: SAMPLE_CAPTIONS[i % SAMPLE_CAPTIONS.length]!, cta: null }));
    for (let i = fillers.length; i < FEED_LENGTH - 1; i++) fillers.push({ media: null, handle: SAMPLE_HANDLES[i % SAMPLE_HANDLES.length]!, avatarUrl: null, caption: SAMPLE_CAPTIONS[i % SAMPLE_CAPTIONS.length]!, cta: null, sample: true, tint: i });
    const order = shuffle(fillers);
    // Never first or last, so the ad always arrives mid-scroll.
    const at = 2 + Math.floor(Math.random() * (FEED_LENGTH - 4));
    order.splice(at, 0, ad);
    setItems(order);
    live.current = { index: 0, adIndex: at };
    adShownAt.current = null;
    setIndex(0);
    const dwell = SPEEDS[speed];
    // Each post holds for the chosen time, then the feed moves one post on.
    const step = (to: number) => {
      changedAt.current = performance.now();
      live.current.index = to;
      if (to === at) adShownAt.current = changedAt.current;
      setIndex(to);
      timer.current = window.setTimeout(() => (to + 1 >= order.length ? finish({ stoppedOn: null, adIndex: at, adSeconds: null }) : step(to + 1)), dwell);
    };
    const count = (n: number) => {
      if (n === 0) {
        setPhase({ kind: 'running' });
        step(0);
        return;
      }
      setPhase({ kind: 'countdown', n });
      timer.current = window.setTimeout(() => count(n - 1), 650);
    };
    count(3);
  }, [ad, clear, finish, others, speed]);

  const stop = useCallback(() => {
    if (phase.kind !== 'running') return;
    const now = performance.now();
    const { index: at, adIndex: adAt } = live.current;
    // Mid-swipe, the post that is still more than half on screen counts.
    const visible = at > 0 && now - changedAt.current < MOVE_MS / 2 ? at - 1 : at;
    finish({ stoppedOn: visible, adIndex: adAt, adSeconds: visible === adAt && adShownAt.current != null ? (now - adShownAt.current) / 1000 : null });
  }, [finish, phase.kind]);

  // Space or Enter stops the feed while it runs.
  useEffect(() => {
    if (phase.kind !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase.kind, stop]);


  return { phase, index, items, runs, speed, setSpeed, start, stop, reset, loadingLibrary: library.isLoading };
}

type ScrollTest = ReturnType<typeof useScrollTest>;

function TestScreen({ test, placement, muted }: { test: ScrollTest; placement: Placement; muted: boolean }) {
  const { phase, index, items } = test;
  const running = phase.kind === 'running';
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const [offsets, setOffsets] = useState<number[]>([]);
  useLayoutEffect(() => {
    if (placement === 'feed') setOffsets(cards.current.slice(0, items.length).map((c) => c?.offsetTop ?? 0));
  }, [items, placement]);
  const y = placement === 'feed' ? (offsets[index] ?? 0) : index * FRAME_H;
  const showFeed = phase.kind !== 'idle' && items.length > 0;

  return (
    <ScreenShell placement={placement}>
      <div className={cn('absolute inset-0', running && 'cursor-pointer')} onClick={running ? test.stop : undefined}>
        {showFeed ? (
          <div className="absolute inset-x-0 top-0 transition-transform ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none" style={{ transform: `translateY(${-y}px)`, transitionDuration: `${MOVE_MS}ms` }}>
            {items.map((p, i) =>
              placement === 'feed' ? (
                <div key={i} ref={(el) => void (cards.current[i] = el)}>
                  <FeedCard post={p} active={running && i === index} muted={muted} />
                </div>
              ) : (
                <FramePost key={i} placement={placement} post={p} active={running && i === index} muted={muted} />
              ),
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-10 text-center text-[17px] text-white/80">
            <Hand className="size-10 text-white/70" />
            Press Start, then tap the screen the moment a post makes you want to stop.
          </div>
        )}
        {phase.kind === 'countdown' && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 text-[96px] font-bold tabular-nums">{phase.n}</div>}
        {phase.kind === 'done' && (
          <div className="absolute inset-x-0 top-1/2 z-40 mx-auto w-fit -translate-y-1/2 rounded-2xl bg-black/75 px-6 py-4 text-center text-[18px] font-semibold backdrop-blur">
            {phase.result.stoppedOn == null ? 'End of the feed' : 'Stopped'}
          </div>
        )}
      </div>
    </ScreenShell>
  );
}

function TestPanel({ test }: { test: ScrollTest }) {
  const { phase, runs } = test;
  const hits = runs.filter((r) => r.stoppedOn === r.adIndex);
  const avg = hits.length ? hits.reduce((s, r) => s + (r.adSeconds ?? 0), 0) / hits.length : null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">The feed scrolls by itself, a post at a time, with your ad somewhere in the middle and the sound off. Tap the phone or press Space the moment something makes you want to stop.</p>
      <Field label="Scroll speed">
        <Segmented size="sm" value={test.speed} onChange={test.setSpeed} options={[{ value: 'fast', label: 'Fast' }, { value: 'normal', label: 'Normal' }, { value: 'slow', label: 'Slow' }]} />
      </Field>
      {phase.kind === 'running' || phase.kind === 'countdown' ? (
        <Button variant="brand" className="w-full" disabled={phase.kind === 'countdown'} onClick={test.stop}>
          <Hand className="size-4" /> Stop here
        </Button>
      ) : (
        <Button variant="brand" className="w-full" loading={test.loadingLibrary} onClick={test.start}>
          {phase.kind === 'done' ? <RotateCcw className="size-4" /> : <Play className="size-4" />} {phase.kind === 'done' ? 'Run again' : 'Start'}
        </Button>
      )}
      {phase.kind === 'done' && <ResultNotice result={phase.result} />}
      {runs.length > 0 && (
        <div className="space-y-2 rounded-xl border p-3 text-sm">
          <p className="font-medium">
            Stopped on your ad in {hits.length} of {runs.length} {runs.length === 1 ? 'run' : 'runs'}
            {avg != null && <span className="font-normal text-muted-foreground">, after {avg.toFixed(1)} s on average</span>}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {runs.map((r, i) => (
              <li key={runs.length - i} className="flex items-center gap-1.5">
                {r.stoppedOn === r.adIndex ? <CircleCheck className="size-3.5 text-success" /> : <CircleX className="size-3.5 text-muted-foreground" />}
                Run {runs.length - i}: {describe(r)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">This measures your own reaction, so it works best with someone who hasn’t seen the ad yet. Other posts come from your recent library files, or plain sample posts when there aren’t enough.</p>
    </div>
  );
}

function describe(r: RunResult) {
  if (r.stoppedOn == null) return 'scrolled past it';
  if (r.stoppedOn === r.adIndex) return `stopped after ${(r.adSeconds ?? 0).toFixed(1)} s`;
  return r.stoppedOn < r.adIndex ? 'stopped on an earlier post' : 'stopped on a later post';
}

function ResultNotice({ result: r }: { result: RunResult }) {
  if (r.stoppedOn === r.adIndex) {
    return (
      <Notice tone="success" title={`You stopped on your ad after ${(r.adSeconds ?? 0).toFixed(1)} s`}>
        {(r.adSeconds ?? 0) < 1 ? 'It caught you almost at once: the opening frame is doing its job.' : 'It held you once it was on screen. A stronger first second could stop people sooner.'}
      </Notice>
    );
  }
  if (r.stoppedOn == null) {
    return (
      <Notice tone="warning" title="You scrolled past your ad">
        It was post {r.adIndex + 1} of {FEED_LENGTH}. Try movement, a face or a bold line of text in the first second, then run it again.
      </Notice>
    );
  }
  return (
    <Notice tone="warning" title={`You stopped on post ${r.stoppedOn + 1}, not your ad`}>
      Your ad was post {r.adIndex + 1}. Something else in the feed won your attention first.
    </Notice>
  );
}
