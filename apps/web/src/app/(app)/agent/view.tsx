'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, ChevronDown, Link2, Mic, Package, Play, Square } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatUsd } from '@adforge/core';
import { PlatformIcon } from '@/components/app/platform-icon';
import { VoicePicker } from '@/components/app/voice-picker';
import { RUN_STATUS_LABEL } from '@/components/agent/labels';
import { useAgentRuns, usePlanEstimate } from '@/components/agent/use-agent';
import { useAdsSetup } from '@/components/distribution/use-distribution';
import { ModelPicker } from '@/components/generate/model-picker';
import { useModels } from '@/components/generate/use-studio-model';
import { ChipList, hostOf, StatusPill } from '@/components/growth/shared';
import { useReadyProducts } from '@/components/growth/use-growth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Progress, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api-client';
import { useDictation } from '@/lib/hooks/use-dictation';
import { useMe } from '@/lib/hooks/use-me';
import type { AgentRunView } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { useOnChange } from '@/lib/hooks/use-on-change';

const ASPECTS = ['9:16', '1:1', '4:5', '16:9'] as const;

export function AgentView() {
  const runs = useAgentRuns();
  const items = runs.data?.items ?? [];
  const waiting = items.filter((r) => r.status === 'awaiting_approval');
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <NewRunForm className="self-start xl:sticky xl:top-20" />
      <section className="min-w-0 space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">Runs</h2>
          {waiting.length > 0 && <span className="text-xs text-warning">{waiting.length} waiting for you</span>}
        </div>
        {runs.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={<Bot />}
            title="No runs yet"
            description="Start with a product page and what you want to achieve. The agent asks before each step, shows its price, and never turns ads on by itself."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((r) => (
              <RunCard key={r.id} run={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* -------------------------------- New run form ------------------------------- */

function Disclosure({ title, summary, children, defaultOpen = false }: { title: string; summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="text-sm font-medium">{title}</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{!open && summary}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-3 border-t px-3 py-3">{children}</div>}
    </div>
  );
}

function NewRunForm({ className }: { className?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const me = useMe();
  const products = useReadyProducts();
  const models = useModels('t2v');
  const setup = useAdsSetup();

  const initialProduct = params.get('productId');
  const [source, setSource] = useState<'url' | 'product'>(initialProduct ? 'product' : 'url');
  const [url, setUrl] = useState(params.get('url') ?? '');
  const [productId, setProductId] = useState(initialProduct ?? 'none');
  const [goal, setGoal] = useState('');
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>('9:16');
  const [durationS, setDurationS] = useState(20);
  const [style, setStyle] = useState<'ugc' | 'polished'>('ugc');
  const [videoModelId, setVideoModelId] = useState<string>();
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<('meta' | 'tiktok')[]>(['meta']);
  const [adAccountId, setAdAccountId] = useState('auto');
  const [countries, setCountries] = useState<string[]>(['US']);
  const [dailyBudget, setDailyBudget] = useState('10');
  const [landingUrl, setLandingUrl] = useState('');
  const [budget, setBudget] = useState('25');
  const [auto, setAuto] = useState(false);
  const [autoLimit, setAutoLimit] = useState('1');
  const dict = useDictation((text, final) => final && setGoal((v) => `${v}${v && !/\s$/.test(v) ? ' ' : ''}${text.trim()}`));

  // The recommended usable model, so the price below is for the model that will run.
  const list = models.data ?? [];
  const fallbackModel = list.find((m) => m.recommended && m.available)?.id ?? list.find((m) => m.available)?.id ?? list.find((m) => m.recommended)?.id;
  const modelId = videoModelId ?? fallbackModel;
  const model = list.find((m) => m.id === modelId);
  const product = products.data?.find((p) => p.id === productId);
  useOnChange([initialProduct, products.data], () => {
    if (initialProduct && products.data && !products.data.some((p) => p.id === initialProduct)) setProductId('none');
  });

  const plan = usePlanEstimate({ durationS, aspect, style, videoModelId: modelId, productId: source === 'product' && productId !== 'none' ? productId : undefined });
  const accounts = (setup.data?.accounts ?? []).filter((a) => platforms.includes(a.platform));
  const togglePlatform = (p: 'meta' | 'tiktok') => setPlatforms((v) => (v.includes(p) ? (v.length > 1 ? v.filter((x) => x !== p) : v) : [...v, p]));

  const f = me.data?.features;
  const missing = f
    ? [
        !f.llm && 'Claude (research and scripts)',
        model && !model.available && `${model.vendor} for ${model.label} shots`,
        !f.elevenlabs && 'ElevenLabs (voice-over)',
      ].filter((x): x is string => !!x)
    : [];

  const validUrl = (() => {
    try {
      const u = new URL(url.trim());
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  })();
  const productReady = source === 'url' ? validUrl : productId !== 'none';
  const ready = productReady && goal.trim().length >= 5 && countries.length > 0 && Number(budget) >= 1 && !!f?.llm;

  const create = useMutation({
    mutationFn: () =>
      api.post<AgentRunView>('/agent/runs', {
        goal: goal.trim(),
        ...(source === 'url' ? { productUrl: url.trim() } : { productId }),
        budgetUsd: Math.min(10_000, Math.max(1, Number(budget))),
        platforms,
        ...(adAccountId !== 'auto' && accounts.some((a) => a.id === adAccountId) ? { adAccountId } : {}),
        ...(Number(dailyBudget) > 0 ? { dailyAdBudget: Number(dailyBudget) } : {}),
        aspect,
        durationS,
        ...(modelId ? { videoModelId: modelId } : {}),
        ...(voiceId ? { voiceId } : {}),
        style,
        countries,
        ...(landingUrl.trim() ? { landingUrl: landingUrl.trim() } : {}),
        autoApproveUnderUsd: auto ? Math.min(25, Math.max(0.01, Number(autoLimit) || 1)) : 0,
        start: true,
      }),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['agent', 'runs'] });
      router.push(`/agent/${run.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const p = plan.data;
  return (
    <div className={cn('space-y-4 rounded-2xl border bg-card p-5', className)}>
      <h2 className="font-semibold">New run</h2>

      <Field label="Product">
        <Segmented
          size="sm"
          value={source}
          onChange={setSource}
          options={[
            { value: 'url', label: <span className="inline-flex items-center gap-1.5"><Link2 className="size-3.5" /> Product page</span> },
            { value: 'product', label: <span className="inline-flex items-center gap-1.5"><Package className="size-3.5" /> Imported</span>, disabled: !products.data?.length },
          ]}
        />
      </Field>
      {source === 'url' ? (
        <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourstore.com/products/…" aria-label="Product page URL" />
      ) : (
        <Select
          value={productId}
          onValueChange={setProductId}
          options={[{ value: 'none', label: 'Pick a product', disabled: true }, ...(products.data ?? []).map((pr) => ({ value: pr.id, label: pr.title ?? pr.sourceUrl, hint: hostOf(pr.sourceUrl) }))]}
        />
      )}

      <Field label="Goal" hint="Who you want to reach and what counts as success.">
        <div className="relative">
          <Textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={2000} placeholder="First 100 sales from US hikers aged 25–40, under $15 per purchase." className="pr-12" />
          <Button type="button" size="icon-sm" variant={dict.listening ? 'brand' : 'ghost'} className="absolute top-2 right-2" aria-label="Dictate" onClick={dict.toggle} loading={dict.busy}>
            {dict.listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
          </Button>
        </div>
      </Field>

      <Disclosure title="Video" summary={`${aspect} · ${durationS} s · ${style === 'ugc' ? 'UGC' : 'Polished'}${model ? ` · ${model.label}` : ''}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shape">
            <Segmented size="sm" value={aspect} onChange={setAspect} options={ASPECTS.map((a) => ({ value: a, label: a }))} />
          </Field>
          <Field label="Style">
            <Segmented size="sm" value={style} onChange={setStyle} options={[{ value: 'ugc', label: 'Authentic UGC' }, { value: 'polished', label: 'Polished' }]} />
          </Field>
        </div>
        <Field label="Length" aside={<span className="font-medium text-foreground tabular-nums">{durationS} s</span>}>
          <Slider min={6} max={90} step={1} value={[durationS]} onValueChange={(v) => setDurationS(v[0] ?? 20)} />
        </Field>
        <Field label="Video model for the shots">
          <ModelPicker models={list} value={modelId} onChange={setVideoModelId} />
        </Field>
        <Field label="Voice-over">
          <VoicePicker value={voiceId} onChange={setVoiceId} noneLabel="Pick a natural voice for me" />
        </Field>
      </Disclosure>

      <Disclosure title="Ads" summary={`${platforms.map((x) => (x === 'meta' ? 'Meta' : 'TikTok')).join(' + ')} · ${countries.join(', ') || 'no country'}`}>
        <Field label="Platforms">
          <div className="flex gap-4">
            {(['meta', 'tiktok'] as const).map((x) => (
              <label key={x} className="flex items-center gap-2 text-sm">
                <Checkbox checked={platforms.includes(x)} onCheckedChange={() => togglePlatform(x)} />
                <PlatformIcon platform={x} className="size-4" plain /> {x === 'meta' ? 'Meta' : 'TikTok'}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Ad account" hint={setup.data && !accounts.length ? <>None connected yet. You can <Link href="/settings/ad-accounts" className="text-primary hover:underline">connect one</Link> before the launch step.</> : undefined}>
          <Select
            value={accounts.some((a) => a.id === adAccountId) ? adAccountId : 'auto'}
            onValueChange={setAdAccountId}
            options={[{ value: 'auto', label: 'First connected account per platform' }, ...accounts.map((a) => ({ value: a.id, label: a.name ?? a.externalId, hint: a.platform === 'meta' ? 'Meta' : 'TikTok', disabled: a.status !== 'active' }))]}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Daily ad budget" hint="Spent only after you activate.">
            <Input type="number" min={1} step={1} value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
          </Field>
          <Field label="Landing page" hint="Defaults to the product page.">
            <Input type="url" value={landingUrl} onChange={(e) => setLandingUrl(e.target.value)} placeholder="https://" />
          </Field>
        </div>
        <Field label="Countries">
          <ChipList items={countries} onChange={(v) => setCountries([...new Set(v.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 25))} max={25} maxLength={2} placeholder="US" />
        </Field>
      </Disclosure>

      <Disclosure title="Budget and approvals" summary={`${formatUsd(Number(budget) || 0)} cap · ${auto ? `auto under ${formatUsd(Number(autoLimit) || 0)}` : 'asks every step'}`}>
        <Field label="Run budget (USD)" hint="AI cost cap for this run. The agent stops before a step that would go over.">
          <Input type="number" min={1} max={10000} step={1} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Run cheap steps without asking</span>
          <Switch checked={auto} onCheckedChange={setAuto} />
        </label>
        {auto && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Steps up to $</span>
            <Input type="number" min={0.01} max={25} step={0.5} value={autoLimit} onChange={(e) => setAutoLimit(e.target.value)} className="h-7 w-20" aria-label="Auto-approve limit" />
            <span>start on their own. Launching ads always asks.</span>
          </div>
        )}
      </Disclosure>

      {missing.length > 0 && (
        <Notice tone="warning" title="Keys to add" action={<Button asChild size="xs" variant="outline"><Link href="/settings/providers">Providers</Link></Button>}>
          {missing.join(', ')}.
        </Notice>
      )}

      <div className="space-y-2 border-t pt-4">
        <div className="space-y-1 text-xs">
          <Row label="Research" value={p ? `≈ ${formatUsd(p.research)}` : '…'} />
          <Row label="Script and storyboard" value={p ? `≈ ${formatUsd(p.script)}` : '…'} />
          <Row
            label={p?.generate ? `Video: ${p.generate.shotsLow}–${p.generate.shotsHigh} shots with ${p.generate.modelLabel} + voice-over` : 'Video'}
            value={p?.generate ? `≈ ${formatUsd(p.generate.low)}–${formatUsd(p.generate.high)}` : p ? 'Pick a model' : '…'}
          />
          <Row label="Launch (paused)" value="Free" />
          <Row label="Read results" value={p ? `≈ ${formatUsd(p.optimize)}` : '…'} />
          <div className="flex justify-between gap-2 border-t pt-1.5 text-sm font-medium">
            <span>Whole run</span>
            <span className={cn('tabular-nums', plan.isFetching && 'opacity-60')}>{p ? `≈ ${formatUsd(p.total.low)}–${formatUsd(p.total.high)}` : '…'}</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">The exact price of each step is shown before you approve it. Ad spend is billed by the platform, only after you activate the ads.</p>
        <Button variant="brand" className="w-full" loading={create.isPending} disabled={!ready} onClick={() => create.mutate()}>
          <Play className="size-4" /> Start research{p ? <span className="tabular-nums opacity-80">· {formatUsd(p.research)}</span> : null}
        </Button>
        {!productReady && <p className="text-center text-[11px] text-muted-foreground">Add a product page link or pick an imported product.</p>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

/* ---------------------------------- Run card --------------------------------- */

function RunCard({ run }: { run: AgentRunView }) {
  const current = run.steps.find((s) => s.id === run.currentStep);
  const done = run.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const line =
    run.status === 'awaiting_approval' && current
      ? `${current.status === 'failed' ? 'Stopped at' : 'Waiting for you:'} ${current.label.toLowerCase()}`
      : run.status === 'running' && current
        ? (run.job?.progressMessage ?? current.label)
        : run.status === 'completed'
          ? 'Finished'
          : run.status === 'canceled'
            ? 'Canceled'
            : (run.error ?? '');
  return (
    <Link href={`/agent/${run.id}`} className={cn('group flex flex-col gap-3 rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:shadow-lg', run.status === 'awaiting_approval' && 'border-warning/40')}>
      <div className="flex items-start gap-3">
        {run.product?.image?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={run.product.image.thumbnailUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Bot className="size-5 text-muted-foreground" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium group-hover:text-primary">{run.goal}</div>
          <div className="truncate text-xs text-muted-foreground">{run.product?.title ?? hostOf(run.productUrl)}</div>
        </div>
        <StatusPill status={run.status} label={RUN_STATUS_LABEL[run.status]} className="shrink-0" />
      </div>
      <div className="flex gap-1" aria-label={`${done} of 5 steps finished`}>
        {run.steps.map((s) => (
          <span
            key={s.id}
            title={s.label}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              s.status === 'done' ? 'bg-success' : s.status === 'skipped' ? 'bg-muted-foreground/30' : s.status === 'failed' ? 'bg-destructive' : run.currentStep === s.id && run.status === 'running' ? 'animate-pulse bg-primary' : run.currentStep === s.id && run.status === 'awaiting_approval' ? 'bg-warning' : 'bg-surface-3',
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{line}</span>
        <span className="shrink-0 tabular-nums">
          {formatUsd(run.spentUsd)}
          {run.budgetUsd != null && ` / ${formatUsd(run.budgetUsd)}`} · {timeAgo(run.updatedAt)}
        </span>
      </div>
      {run.status === 'running' && run.job && run.job.progress > 0 && <Progress value={run.job.progress} className="h-1" />}
      {run.campaigns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {run.campaigns.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px]">
              {c.platform && <PlatformIcon platform={c.platform} className="size-3" plain />} {c.status}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
