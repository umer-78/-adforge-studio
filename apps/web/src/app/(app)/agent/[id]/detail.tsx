'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Check, ChevronDown, CircleAlert, CircleDashed, CircleMinus, Hand, Loader2, Play, RotateCcw, Settings2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatUsd } from '@adforge/core';
import { PlatformIcon } from '@/components/app/platform-icon';
import { useVoices, VoicePicker } from '@/components/app/voice-picker';
import { ApprovalGate, canRedo, RedoDialog } from '@/components/agent/gate';
import { RUN_STATUS_LABEL } from '@/components/agent/labels';
import { GenerateOutput, LaunchOutput, OptimizeOutput, ResearchOutput, ScriptOutput } from '@/components/agent/step-output';
import { useAgentRun, useDecision, useRunPatch } from '@/components/agent/use-agent';
import { useAdsSetup } from '@/components/distribution/use-distribution';
import { ModelPicker } from '@/components/generate/model-picker';
import { useModels } from '@/components/generate/use-studio-model';
import { ChipList, hostOf, JobLine, StatusPill } from '@/components/growth/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, Notice, Progress, Skeleton } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api-client';
import type { AgentConfigView, AgentRunView, AgentStepView } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';

export function AgentRunDetail({ id }: { id: string }) {
  const q = useAgentRun(id);
  if (q.isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />;
  if (q.isError || !q.data)
    return (
      <EmptyState
        title="Run not found"
        description={q.error ? errorMessage(q.error) : 'It may have been deleted.'}
        action={
          <Button asChild variant="outline">
            <Link href="/agent">Back to Agent</Link>
          </Button>
        }
      />
    );
  return <Loaded run={q.data} />;
}

function Loaded({ run }: { run: AgentRunView }) {
  const router = useRouter();
  const qc = useQueryClient();
  const decide = useDecision(run.id);
  const [deleting, setDeleting] = useState(false);
  const live = run.status === 'awaiting_approval' || run.status === 'running';
  const lastDone = [...run.steps].reverse().find((s) => s.status === 'done')?.id;

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/agent/runs/${run.id}`);
      qc.invalidateQueries({ queryKey: ['agent', 'runs'] });
      router.push('/agent');
    } catch (e) {
      toast.error(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <Link href="/agent" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Agent
          </Link>
          <div className="flex items-start gap-3">
            <h1 className="line-clamp-3 min-w-0 text-xl font-semibold tracking-tight sm:text-2xl">{run.goal}</h1>
            <StatusPill status={run.status} label={RUN_STATUS_LABEL[run.status]} className="mt-1 shrink-0" />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {run.product ? (
              <Link href={`/products/${run.product.id}`} className="inline-flex items-center gap-2 hover:text-foreground">
                {run.product.image?.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={run.product.image.thumbnailUrl} alt="" className="size-5 rounded object-cover" />
                )}
                {run.product.title ?? hostOf(run.productUrl)}
              </Link>
            ) : (
              run.productUrl && <span>{hostOf(run.productUrl)}</span>
            )}
            <span>Started {timeAgo(run.createdAt)}</span>
            {run.config.platforms.map((p) => (
              <span key={p} className="inline-flex items-center gap-1">
                <PlatformIcon platform={p} className="size-3.5" plain /> {p === 'meta' ? 'Meta' : 'TikTok'}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {live && (
            <Confirm
              title="Cancel this run?"
              description="The agent stops now: shots still generating are canceled and nothing else runs. What it already made stays in your library."
              confirmLabel="Cancel run"
              destructive
              onConfirm={() => decide.mutateAsync({ decision: 'cancel' })}
            >
              <Button variant="outline" size="sm">
                <Ban className="size-4" /> Cancel run
              </Button>
            </Confirm>
          )}
          {run.status !== 'running' && (
            <Confirm title="Delete this run?" description="The run’s history is removed. The product, script, edit, video and any ads it made stay where they are." confirmLabel="Delete" destructive onConfirm={remove}>
              <Button variant="ghost" size="sm" loading={deleting}>
                <Trash2 className="size-4" /> Delete
              </Button>
            </Confirm>
          )}
        </div>
      </div>

      {run.status === 'awaiting_approval' && run.error && run.steps.every((s) => s.status !== 'failed') && <Notice tone="error">{run.error}</Notice>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ol className="space-y-3" aria-label="Steps">
          {run.steps.map((s, i) => (
            <StepCard key={s.id} run={run} step={s} index={i} defaultOpen={s.id === lastDone} />
          ))}
        </ol>
        <aside className="space-y-4 self-start xl:sticky xl:top-20">
          <SpendCard run={run} />
          <SettingsCard run={run} />
        </aside>
      </div>
    </div>
  );
}

/* ---------------------------------- Steps ---------------------------------- */

function StepCard({ run, step, index, defaultOpen }: { run: AgentRunView; step: AgentStepView; index: number; defaultOpen: boolean }) {
  const current = run.currentStep === step.id;
  const gate = current && run.status === 'awaiting_approval';
  const working = current && run.status === 'running';
  const stopped = run.status === 'canceled' && (step.status === 'running' || step.status === 'waiting');
  const [openState, setOpen] = useState<boolean | null>(null);
  const [redo, setRedo] = useState(false);
  const decide = useDecision(run.id);
  const hasOutput = step.status === 'done' || (step.id === 'generate' && !!run.video) || (step.id === 'launch' && run.campaigns.length > 0);
  const open = gate || working || (openState ?? (defaultOpen || (step.status === 'skipped' && !!step.note)));
  const collapsible = !gate && !working && (hasOutput || !!step.note);

  let icon: ReactNode;
  let status: ReactNode;
  if (gate) {
    icon = <Hand className="size-4 text-warning" />;
    status = step.status === 'failed' ? <span className="text-destructive">Stopped. Needs you</span> : <span className="text-warning">Waiting for your OK</span>;
  } else if (working) {
    icon = <Loader2 className="size-4 animate-spin text-primary" />;
    status = <span className="text-primary">{run.job?.progressMessage ?? 'Working…'}</span>;
  } else if (stopped) {
    icon = <Ban className="size-4 text-muted-foreground" />;
    status = 'Stopped';
  } else if (step.status === 'done') {
    icon = <Check className="size-4 text-success" />;
    status = `Done ${timeAgo(step.finishedAt)}`;
  } else if (step.status === 'skipped') {
    icon = <CircleMinus className="size-4 text-muted-foreground" />;
    status = 'Skipped';
  } else if (step.status === 'failed') {
    icon = <CircleAlert className="size-4 text-destructive" />;
    status = <span className="text-destructive">Failed</span>;
  } else {
    icon = <CircleDashed className="size-4 text-muted-foreground" />;
    status = step.estimateUsd != null && run.status !== 'canceled' && run.status !== 'completed' ? `≈ ${formatUsd(step.estimateUsd)}` : 'Not started';
  }

  return (
    <li className={cn('rounded-2xl border bg-card transition-colors', gate && 'border-warning/50 shadow-[0_0_0_1px_var(--warning)]/10', working && 'border-primary/40')}>
      <button
        type="button"
        className={cn('flex w-full items-center gap-3 px-4 py-3 text-left', collapsible ? 'cursor-pointer' : 'cursor-default')}
        onClick={() => collapsible && setOpen(!open)}
        aria-expanded={collapsible ? open : undefined}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted-foreground tabular-nums">Step {index + 1}</span>
          <span className="block truncate text-sm font-medium">{step.label}</span>
        </span>
        <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
          <span className="block">{status}</span>
          {step.costUsd > 0 && <span className="block tabular-nums">Spent {formatUsd(step.costUsd)}</span>}
        </span>
        {collapsible && <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />}
      </button>
      <div className="px-4 text-xs text-muted-foreground sm:hidden">{status}</div>
      {open && (
        <div className="space-y-4 border-t px-4 py-4">
          {working && (
            <div className="space-y-2">
              <JobLine job={run.job} label={step.label} />
              {step.id === 'generate' && <p className="text-xs text-muted-foreground">Shots take a few minutes each. You can leave this page; the agent keeps working and asks before the next step.</p>}
              {step.id === 'launch' && <p className="text-xs text-muted-foreground">Creating the campaign, ad set and ad on the platform. Everything stays paused.</p>}
            </div>
          )}
          {hasOutput && (
            <>
              {step.id === 'research' && <ResearchOutput run={run} />}
              {step.id === 'script' && <ScriptOutput run={run} />}
              {step.id === 'generate' && <GenerateOutput run={run} />}
              {step.id === 'launch' && <LaunchOutput run={run} />}
              {step.id === 'optimize' && <OptimizeOutput run={run} />}
            </>
          )}
          {!gate && step.note && <p className={cn('text-xs', step.status === 'skipped' ? 'text-muted-foreground' : 'text-foreground/80')}>{step.note}</p>}
          {!gate && !working && step.status === 'failed' && step.error && <p className="text-xs text-destructive">{step.error}</p>}
          {gate && <ApprovalGate key={`${step.id}:${step.status}:${step.finishedAt ?? ''}`} run={run} />}
          {canRedo(run, step) && (
            <div className="flex justify-end">
              {step.status === 'skipped' ? (
                <Button size="sm" variant="outline" loading={decide.isPending} onClick={() => decide.mutate({ decision: 'reopen', step: step.id })}>
                  <Play className="size-4" /> Pick up from here
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setRedo(true)}>
                  <RotateCcw className="size-4" /> {step.id === 'optimize' ? 'Read results again' : 'Redo with changes'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {redo && <RedoDialog run={run} step={step.id} open onOpenChange={setRedo} />}
    </li>
  );
}

/* ---------------------------------- Spend ---------------------------------- */

function SpendCard({ run }: { run: AgentRunView }) {
  const patch = useRunPatch(run.id);
  const [budget, setBudget] = useState(String(run.budgetUsd ?? ''));
  const [limit, setLimit] = useState(String(run.autoApproveUnderUsd || 1));
  const ended = run.status === 'canceled';
  const pct = run.budgetUsd ? Math.min(100, (run.spentUsd / run.budgetUsd) * 100) : 0;
  const saveBudget = () => {
    const v = Number(budget);
    if (!Number.isFinite(v) || v < 1) return setBudget(String(run.budgetUsd ?? ''));
    if (v !== run.budgetUsd) patch.mutate({ budgetUsd: Math.round(v * 100) / 100 });
  };
  const saveLimit = (on: boolean, raw = limit) => {
    const v = Math.min(25, Math.max(0.01, Number(raw) || 1));
    patch.mutate({ autoApproveUnderUsd: on ? Math.round(v * 100) / 100 : 0 });
  };
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <div>
        <div className="text-sm font-medium">AI spend</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatUsd(run.spentUsd)}</span>
          {run.budgetUsd != null && <span className="text-xs text-muted-foreground tabular-nums">of {formatUsd(run.budgetUsd)}</span>}
        </div>
        {run.budgetUsd != null && <Progress value={pct} className="mt-2" />}
      </div>
      <ul className="space-y-1 text-xs">
        {run.steps.map((s) => (
          <li key={s.id} className="flex justify-between gap-2">
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="shrink-0 tabular-nums">{s.costUsd > 0 ? formatUsd(s.costUsd) : '–'}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">Ad spend is separate: it is billed by Meta or TikTok, and only after you activate the ads.</p>
      {!ended && (
        <>
          <Field label="Run budget" hint="The agent stops before a step that would go over it.">
            <div className="flex gap-2">
              <Input type="number" min={1} max={10000} step={1} value={budget} onChange={(e) => setBudget(e.target.value)} onBlur={saveBudget} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Run budget in USD" />
            </div>
          </Field>
          <div className="space-y-2 border-t pt-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Run cheap steps without asking</span>
              <Switch checked={run.autoApproveUnderUsd > 0} disabled={patch.isPending} onCheckedChange={(on) => saveLimit(on)} />
            </label>
            {run.autoApproveUnderUsd > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Up to $</span>
                <Input type="number" min={0.01} max={25} step={0.5} value={limit} onChange={(e) => setLimit(e.target.value)} onBlur={() => saveLimit(true)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="h-7 w-20" aria-label="Auto-approve limit in USD" />
                <span>per step</span>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Launching ads always waits for you.</p>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------- Settings --------------------------------- */

function SettingsCard({ run }: { run: AgentRunView }) {
  const models = useModels('t2v');
  const voices = useVoices();
  const setup = useAdsSetup();
  const [editing, setEditing] = useState(false);
  const c = run.config;
  const model = models.data?.find((m) => m.id === c.videoModelId);
  const voice = voices.data?.find((v) => v.providerVoiceId === c.voiceId);
  const account = setup.data?.accounts.find((a) => a.id === c.adAccountId);
  const rows: [string, ReactNode][] = [
    ['Format', `${c.aspect} · ${c.durationS} s · ${c.style === 'ugc' ? 'Authentic UGC' : 'Polished'}`],
    ['Video model', model?.label ?? 'Recommended'],
    ['Voice', voice?.name ?? 'Picked for you'],
    ['Ad account', account ? (account.name ?? account.externalId) : 'First connected'],
    ['Countries', c.countries.join(', ')],
    ['Daily ad budget', c.dailyAdBudget != null ? String(c.dailyAdBudget) : '10'],
    ['Landing page', hostOf(c.landingUrl ?? run.productUrl) || 'Product page'],
  ];
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Run settings</div>
        {run.status !== 'canceled' && (
          <Button size="xs" variant="ghost" disabled={run.status === 'running'} title={run.status === 'running' ? 'Change settings between steps' : undefined} onClick={() => setEditing(true)}>
            <Settings2 className="size-3.5" /> Change
          </Button>
        )}
      </div>
      <dl className="space-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{k}</dt>
            <dd className="min-w-0 truncate text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {editing && <SettingsDialog run={run} open onOpenChange={setEditing} />}
    </div>
  );
}

function SettingsDialog({ run, open, onOpenChange }: { run: AgentRunView; open: boolean; onOpenChange: (v: boolean) => void }) {
  const patch = useRunPatch(run.id);
  const models = useModels('t2v');
  const setup = useAdsSetup();
  const [c, setC] = useState<AgentConfigView>(run.config);
  const [dailyBudget, setDailyBudget] = useState(String(run.config.dailyAdBudget ?? ''));
  const set = <K extends keyof AgentConfigView>(k: K, v: AgentConfigView[K]) => setC((prev) => ({ ...prev, [k]: v }));
  const accounts = (setup.data?.accounts ?? []).filter((a) => c.platforms.includes(a.platform));
  const togglePlatform = (p: 'meta' | 'tiktok') => set('platforms', c.platforms.includes(p) ? c.platforms.filter((x) => x !== p) : [...c.platforms, p]);
  const save = () => {
    const budget = Number(dailyBudget);
    patch.mutate(
      {
        config: {
          platforms: c.platforms,
          adAccountId: c.adAccountId && accounts.some((a) => a.id === c.adAccountId) ? c.adAccountId : null,
          dailyAdBudget: dailyBudget.trim() && Number.isFinite(budget) && budget > 0 ? budget : null,
          aspect: c.aspect,
          durationS: c.durationS,
          videoModelId: c.videoModelId,
          voiceId: c.voiceId,
          style: c.style,
          countries: c.countries,
          landingUrl: c.landingUrl?.trim() || null,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run settings</DialogTitle>
          <DialogDescription>Defaults for the steps still to come. You can also change them at each approval.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shape">
              <Segmented size="sm" value={c.aspect} onChange={(v) => set('aspect', v)} options={(['9:16', '1:1', '4:5', '16:9'] as const).map((a) => ({ value: a, label: a }))} />
            </Field>
            <Field label="Style">
              <Segmented size="sm" value={c.style} onChange={(v) => set('style', v)} options={[{ value: 'ugc', label: 'Authentic UGC' }, { value: 'polished', label: 'Polished' }]} />
            </Field>
          </div>
          <Field label="Length" aside={<span className="font-medium text-foreground tabular-nums">{c.durationS} s</span>}>
            <Slider min={6} max={90} step={1} value={[c.durationS]} onValueChange={(v) => set('durationS', v[0] ?? c.durationS)} />
          </Field>
          <Field label="Video model">
            <ModelPicker models={models.data ?? []} value={c.videoModelId ?? models.data?.find((m) => m.recommended)?.id} onChange={(id) => set('videoModelId', id)} />
          </Field>
          <Field label="Voice">
            <VoicePicker value={c.voiceId} onChange={(v) => set('voiceId', v)} noneLabel="Pick a natural voice for me" />
          </Field>
          <Field label="Platforms">
            <div className="flex gap-4">
              {(['meta', 'tiktok'] as const).map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={c.platforms.includes(p)} disabled={c.platforms.length === 1 && c.platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
                  <PlatformIcon platform={p} className="size-4" plain /> {p === 'meta' ? 'Meta' : 'TikTok'}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Ad account">
            <Select
              value={c.adAccountId && accounts.some((a) => a.id === c.adAccountId) ? c.adAccountId : 'auto'}
              onValueChange={(v) => set('adAccountId', v === 'auto' ? null : v)}
              options={[{ value: 'auto', label: 'First connected account per platform' }, ...accounts.map((a) => ({ value: a.id, label: a.name ?? a.externalId, hint: a.platform === 'meta' ? 'Meta' : 'TikTok' }))]}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Daily ad budget">
              <Input type="number" min={1} step={1} value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} placeholder="10" />
            </Field>
            <Field label="Landing page">
              <Input type="url" value={c.landingUrl ?? ''} onChange={(e) => set('landingUrl', e.target.value)} placeholder={run.productUrl ?? 'https://'} />
            </Field>
          </div>
          <Field label="Countries">
            <ChipList items={c.countries} onChange={(v) => set('countries', [...new Set(v.map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)))].slice(0, 25))} max={25} maxLength={2} placeholder="US" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={patch.isPending} disabled={!c.countries.length || !c.platforms.length} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
