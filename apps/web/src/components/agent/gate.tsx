'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { CircleAlert, Clapperboard, Flag, Mic, Play, RotateCcw, Square } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AD_OBJECTIVES, formatUsd } from '@adforge/core';
import { PlatformIcon } from '@/components/app/platform-icon';
import { VoicePicker } from '@/components/app/voice-picker';
import { OBJECTIVE_LABEL } from '@/components/distribution/labels';
import { useAdsSetup } from '@/components/distribution/use-distribution';
import { ModelPicker } from '@/components/generate/model-picker';
import { useModels } from '@/components/generate/use-studio-model';
import { ChipList, money } from '@/components/growth/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Confirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, Notice } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api-client';
import { useDictation } from '@/lib/hooks/use-dictation';
import type { AgentEstimateView, AgentRunView, AgentStepId, AgentStepView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { researchBrief } from './step-output';
import { useDecision, useRunPatch, useStepEstimate } from './use-agent';

const ORDER: AgentStepId[] = ['research', 'script', 'generate', 'launch', 'optimize'];
const SHORT: Record<AgentStepId, string> = { research: 'research', script: 'script', generate: 'video', launch: 'launch', optimize: 'results' };
const APPROVE_LABEL: Record<AgentStepId, string> = {
  research: 'Start research',
  script: 'Write the script',
  generate: 'Generate the video',
  launch: 'Create paused ads',
  optimize: 'Read the results',
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const stepOf = (run: AgentRunView, id: AgentStepId) => run.steps.find((s) => s.id === id)!;
const previousOf = (id: AgentStepId) => ORDER[ORDER.indexOf(id) - 1] ?? null;

/* ---------------------------------- Pieces ---------------------------------- */

function NoteField({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  const dict = useDictation((text, final) => final && onChange(`${value}${value && !/\s$/.test(value) ? ' ' : ''}${text.trim()}`));
  return (
    <Field label={label}>
      <div className="relative">
        <Textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} maxLength={2000} placeholder={placeholder} className="pr-12" />
        <Button type="button" size="icon-sm" variant={dict.listening ? 'brand' : 'ghost'} className="absolute top-2 right-2" aria-label="Dictate" onClick={dict.toggle} loading={dict.busy}>
          {dict.listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
        </Button>
      </div>
    </Field>
  );
}

/** "≈ $1.20" with what it covers, and why it cannot run when a budget is short. */
function PriceLine({ q, onRaise }: { q: UseQueryResult<AgentEstimateView>; onRaise?: (usd: number) => void }) {
  if (q.isError) return <p className="text-xs text-destructive">{errorMessage(q.error)}</p>;
  const e = q.data;
  if (!e) return <p className="text-xs text-muted-foreground">Pricing…</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 text-muted-foreground">{e.detail}</span>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums transition-opacity', q.isFetching && 'opacity-60')}>
          {e.usd === 0 ? 'Free' : `${e.approx ? '≈ ' : ''}${formatUsd(e.usd)}`}
        </span>
      </div>
      {!e.withinRunBudget && (
        <Notice
          tone="warning"
          title="Over the run budget"
          action={
            onRaise && (
              <Button size="xs" variant="outline" onClick={() => onRaise(e.usd - (e.runLeftUsd ?? 0))}>
                Raise budget
              </Button>
            )
          }
        >
          Only {formatUsd(e.runLeftUsd ?? 0)} of this run’s budget is left.
        </Notice>
      )}
      {e.withinRunBudget && !e.withinMonthlyBudget && (
        <Notice tone="warning" title="Over the monthly budget">
          {formatUsd(e.monthly.spentUsd)} of {formatUsd(e.monthly.budgetUsd)} is used this month. Raise the monthly budget in{' '}
          <Link href="/settings/usage" className="text-primary hover:underline">
            Settings
          </Link>
          .
        </Notice>
      )}
    </div>
  );
}

function AngleChoice({ run, index, custom, onIndex, onCustom }: { run: AgentRunView; index: number; custom: string; onIndex: (i: number) => void; onCustom: (v: string) => void }) {
  const brief = researchBrief(run);
  const angles = brief?.angles ?? [];
  const usingCustom = index < 0;
  return (
    <Field label="Angle for this ad">
      <div className="space-y-1.5" role="radiogroup">
        {angles.map((a, i) => (
          <button
            key={`${a.name}-${i}`}
            type="button"
            role="radio"
            aria-checked={index === i}
            onClick={() => onIndex(i)}
            className={cn('flex w-full gap-3 rounded-xl border p-2.5 text-left transition', index === i ? 'border-primary bg-primary/10' : 'hover:border-input hover:bg-accent/40')}
          >
            <span className={cn('mt-0.5 size-4 shrink-0 rounded-full border-2', index === i ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_var(--card)]' : 'border-input')} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{a.name}</span>
              <span className="block text-xs text-muted-foreground">“{a.hook}”</span>
            </span>
          </button>
        ))}
        <div className={cn('rounded-xl border p-2.5 transition', usingCustom ? 'border-primary bg-primary/10' : '')}>
          <button type="button" role="radio" aria-checked={usingCustom} onClick={() => onIndex(-1)} className="flex w-full items-center gap-3 text-left">
            <span className={cn('size-4 shrink-0 rounded-full border-2', usingCustom ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_var(--card)]' : 'border-input')} />
            <span className="text-sm font-medium">My own angle</span>
          </button>
          {usingCustom && <Input autoFocus value={custom} onChange={(e) => onCustom(e.target.value)} maxLength={300} placeholder="e.g. Show it surviving a 3-day hike in the desert" className="mt-2" />}
        </div>
      </div>
    </Field>
  );
}

interface ScriptState {
  angleIndex: number;
  angle: string;
  durationS: number;
}

function scriptInitial(run: AgentRunView, edits: Record<string, unknown>): ScriptState {
  const custom = str(edits.angle);
  const angles = researchBrief(run)?.angles.length ?? 0;
  const index = num(edits.angleIndex) ?? 0;
  return { angleIndex: custom ? -1 : index < angles ? index : 0, angle: custom ?? '', durationS: num(edits.durationS) ?? run.config.durationS };
}

const scriptEdits = (s: ScriptState) => (s.angleIndex < 0 ? (s.angle.trim() ? { angle: s.angle.trim() } : {}) : { angleIndex: s.angleIndex }) as Record<string, unknown>;

function ScriptFields({ run, value, onChange }: { run: AgentRunView; value: ScriptState; onChange: (v: ScriptState) => void }) {
  return (
    <>
      <AngleChoice run={run} index={value.angleIndex} custom={value.angle} onIndex={(i) => onChange({ ...value, angleIndex: i })} onCustom={(v) => onChange({ ...value, angle: v })} />
      <Field label="Length" aside={<span className="font-medium text-foreground tabular-nums">{value.durationS} s</span>}>
        <Slider min={6} max={90} step={1} value={[value.durationS]} onValueChange={(v) => onChange({ ...value, durationS: v[0] ?? value.durationS })} />
      </Field>
    </>
  );
}

interface GenerateState {
  videoModelId: string | undefined;
  voiceId: string | null;
}

function GenerateFields({ value, onChange }: { value: GenerateState; onChange: (v: GenerateState) => void }) {
  const models = useModels('t2v');
  const list = models.data ?? [];
  const current = value.videoModelId ?? list.find((m) => m.recommended && m.available)?.id ?? list.find((m) => m.available)?.id;
  // The model shown is the model priced and used.
  useEffect(() => {
    if (!value.videoModelId && current) onChange({ ...value, videoModelId: current });
  }, [value, current, onChange]);
  return (
    <>
      <Field label="Video model for the shots" hint={list.length && !list.some((m) => m.available) ? 'Add a fal.ai, Replicate or Agnes key in Settings → Providers.' : undefined}>
        <ModelPicker models={list} value={current} onChange={(id) => onChange({ ...value, videoModelId: id })} />
      </Field>
      <Field label="Voice-over">
        <VoicePicker value={value.voiceId} onChange={(v) => onChange({ ...value, voiceId: v })} noneLabel="Pick a natural voice for me" />
      </Field>
    </>
  );
}

const generateEdits = (s: GenerateState) => ({ ...(s.videoModelId ? { videoModelId: s.videoModelId } : {}), ...(s.voiceId ? { voiceId: s.voiceId } : {}) });

interface LaunchState {
  adAccountId: string;
  landingUrl: string;
  countries: string[];
  objective: (typeof AD_OBJECTIVES)[number];
  dailyBudget: string;
}

function launchInitial(run: AgentRunView, edits: Record<string, unknown>): LaunchState {
  const objective = str(edits.objective);
  return {
    adAccountId: str(edits.adAccountId) ?? run.config.adAccountId ?? 'auto',
    landingUrl: str(edits.landingUrl) ?? run.config.landingUrl ?? run.productUrl ?? '',
    countries: Array.isArray(edits.countries) ? (edits.countries as string[]) : run.config.countries,
    objective: objective && (AD_OBJECTIVES as readonly string[]).includes(objective) ? (objective as LaunchState['objective']) : 'traffic',
    dailyBudget: String(num(edits.dailyBudget) ?? run.config.dailyAdBudget ?? 10),
  };
}

function launchEdits(s: LaunchState): Record<string, unknown> {
  const budget = Number(s.dailyBudget);
  return {
    ...(s.adAccountId !== 'auto' ? { adAccountId: s.adAccountId } : {}),
    ...(s.landingUrl.trim() ? { landingUrl: s.landingUrl.trim() } : {}),
    ...(s.countries.length ? { countries: s.countries } : {}),
    objective: s.objective,
    ...(Number.isFinite(budget) && budget > 0 ? { dailyBudget: budget } : {}),
  };
}

function LaunchFields({ run, value, onChange }: { run: AgentRunView; value: LaunchState; onChange: (v: LaunchState) => void }) {
  const setup = useAdsSetup();
  const accounts = (setup.data?.accounts ?? []).filter((a) => run.config.platforms.includes(a.platform));
  const picked = accounts.find((a) => a.id === value.adAccountId) ?? accounts.find((a) => a.status === 'active');
  if (setup.data && !accounts.length) {
    return (
      <Notice tone="warning" title="No ad account connected" action={<Button asChild size="xs" variant="outline"><Link href="/settings/ad-accounts">Connect</Link></Button>}>
        Connect a {run.config.platforms.map((p) => (p === 'meta' ? 'Meta' : 'TikTok')).join(' or ')} ad account to launch, or finish the run here and post the video yourself.
      </Notice>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Ad account" className="md:col-span-2">
        <Select
          value={value.adAccountId}
          onValueChange={(v) => onChange({ ...value, adAccountId: v })}
          options={[
            { value: 'auto', label: 'First connected account per platform' },
            ...accounts.map((a) => ({ value: a.id, label: <span className="inline-flex items-center gap-2"><PlatformIcon platform={a.platform} className="size-4" plain /> {a.name ?? a.externalId}</span>, hint: a.status === 'active' ? a.currency ?? undefined : 'Reconnect first', disabled: a.status !== 'active' })),
          ]}
        />
      </Field>
      <Field label="Landing page" className="md:col-span-2">
        <Input type="url" value={value.landingUrl} onChange={(e) => onChange({ ...value, landingUrl: e.target.value })} placeholder="https://" maxLength={2000} />
      </Field>
      <Field label="Goal">
        <Select value={value.objective} onValueChange={(v) => onChange({ ...value, objective: v as LaunchState['objective'] })} options={AD_OBJECTIVES.map((o) => ({ value: o, label: OBJECTIVE_LABEL[o] }))} />
      </Field>
      <Field label={`Daily budget${picked?.currency ? ` (${picked.currency})` : ''}`} hint="Only spent after you activate the ads.">
        <Input type="number" min={1} step={1} inputMode="decimal" value={value.dailyBudget} onChange={(e) => onChange({ ...value, dailyBudget: e.target.value })} />
      </Field>
      <Field label="Countries" hint="Two-letter codes, e.g. US, GB, DE." className="md:col-span-2">
        <ChipList items={value.countries} onChange={(v) => onChange({ ...value, countries: [...new Set(v.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 25) })} max={25} maxLength={2} placeholder="US" />
      </Field>
    </div>
  );
}

/* ----------------------------------- Gate ----------------------------------- */

/** The decision in front of the user: what the next step does, its price, and what to change first. */
export function ApprovalGate({ run }: { run: AgentRunView }) {
  const step = run.currentStep as AgentStepId;
  const state = stepOf(run, step);
  const decide = useDecision(run.id);
  const patch = useRunPatch(run.id);
  const [note, setNote] = useState('');
  const [script, setScript] = useState(() => scriptInitial(run, state.edits));
  const [gen, setGen] = useState<GenerateState>(() => ({ videoModelId: str(state.edits.videoModelId) ?? run.config.videoModelId ?? undefined, voiceId: str(state.edits.voiceId) ?? run.config.voiceId }));
  const [launch, setLaunch] = useState(() => launchInitial(run, state.edits));
  const [redo, setRedo] = useState<AgentStepId | null>(null);
  const setup = useAdsSetup();

  const edits = useMemo((): Record<string, unknown> => {
    if (step === 'script') return { ...scriptEdits(script), durationS: script.durationS };
    if (step === 'generate') return generateEdits(gen);
    if (step === 'launch') return launchEdits(launch);
    return {};
  }, [step, script, gen, launch]);
  const estimate = useStepEstimate(run.id, 'approve', step, edits);
  const prev = previousOf(step);
  const canRedoPrev = !!prev && stepOf(run, prev).status === 'done' && !(prev === 'launch' && run.campaigns.length);
  const failed = state.status === 'failed';
  const blocked = (step === 'script' && script.angleIndex < 0 && !script.angle.trim()) || (step === 'launch' && (!launch.countries.length || !setup.data?.accounts.some((a) => run.config.platforms.includes(a.platform))));
  const approve = () => decide.mutate({ decision: 'approve', step, edits, ...(note.trim() ? { note: note.trim() } : {}) });
  const ready = !!estimate.data && estimate.data.withinRunBudget && estimate.data.withinMonthlyBudget;

  const button = (
    <Button variant="brand" loading={decide.isPending && decide.variables?.decision === 'approve'} disabled={blocked || !ready || decide.isPending} onClick={step === 'launch' ? undefined : approve}>
      {failed ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
      {failed ? 'Try again' : APPROVE_LABEL[step]}
      {estimate.data && estimate.data.usd > 0 && <span className="tabular-nums opacity-80">· {formatUsd(estimate.data.usd)}</span>}
    </Button>
  );

  return (
    <div className="space-y-4 rounded-xl border border-warning/40 bg-warning/5 p-4">
      {failed && state.error && (
        <Notice tone="error" title="This step stopped">
          {state.error}
        </Notice>
      )}
      {!failed && state.note && <Notice tone="info">{state.note}</Notice>}
      {step === 'script' && <ScriptFields run={run} value={script} onChange={setScript} />}
      {step === 'generate' && (
        <>
          <GenerateFields value={gen} onChange={setGen} />
          {str(stepOf(run, 'script').output.timelineId) && (
            <p className="text-xs text-muted-foreground">
              Want to change the storyboard first?{' '}
              <Link href={`/editor/${str(stepOf(run, 'script').output.timelineId)}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                <Clapperboard className="size-3" /> Open it in the editor
              </Link>
              ; the agent fills in your version.
            </p>
          )}
        </>
      )}
      {step === 'launch' && (
        <>
          <Notice tone="info" title="Ads are created paused">
            Nothing is spent until you activate them in the Ad Launcher.
          </Notice>
          <LaunchFields run={run} value={launch} onChange={setLaunch} />
        </>
      )}
      <NoteField
        value={note}
        onChange={setNote}
        label={step === 'research' ? 'Anything the research should focus on? (optional)' : 'Notes for this step (optional)'}
        placeholder={
          step === 'research'
            ? 'e.g. We sell mostly to new parents; our main competitor is Brand X.'
            : step === 'script'
              ? 'e.g. Open with the problem, keep it playful, mention free shipping.'
              : step === 'optimize'
                ? 'e.g. We care most about cost per purchase.'
                : 'Anything to keep in mind'
        }
      />
      <PriceLine q={estimate} onRaise={(missing) => patch.mutate({ budgetUsd: Math.ceil(((run.budgetUsd ?? 0) + missing) * 100) / 100 + 1 })} />
      <div className="flex flex-wrap items-center gap-2">
        {step === 'launch' ? (
          <Confirm
            title="Create the ads, paused?"
            description={`The agent creates a campaign on ${run.config.platforms.map((p) => (p === 'meta' ? 'Meta' : 'TikTok')).join(' and ')} with a daily budget of ${money(Number(launch.dailyBudget) || 0, setup.data?.accounts.find((a) => a.id === launch.adAccountId)?.currency)}. Everything stays paused until you activate it.`}
            confirmLabel="Create paused ads"
            onConfirm={() => decide.mutateAsync({ decision: 'approve', step, edits, ...(note.trim() ? { note: note.trim() } : {}) })}
          >
            {button}
          </Confirm>
        ) : (
          button
        )}
        {canRedoPrev && (
          <Button variant="outline" onClick={() => setRedo(prev)}>
            <RotateCcw className="size-4" /> Redo {SHORT[prev!]}
          </Button>
        )}
        {step !== 'research' && (
          <Button variant="ghost" loading={decide.isPending && decide.variables?.decision === 'skip'} disabled={decide.isPending} onClick={() => decide.mutate({ decision: 'skip', step })}>
            <Flag className="size-4" /> Finish here
          </Button>
        )}
      </div>
      {redo && <RedoDialog run={run} step={redo} open onOpenChange={(v) => !v && setRedo(null)} />}
    </div>
  );
}

/* ----------------------------------- Redo ----------------------------------- */

/** Run a finished step again with feedback. The steps after it start over. */
export function RedoDialog({ run, step, open, onOpenChange }: { run: AgentRunView; step: AgentStepId; open: boolean; onOpenChange: (v: boolean) => void }) {
  const state = stepOf(run, step);
  const decide = useDecision(run.id, () => onOpenChange(false));
  const patch = useRunPatch(run.id);
  const [note, setNote] = useState('');
  const [script, setScript] = useState(() => scriptInitial(run, state.edits));
  const [gen, setGen] = useState<GenerateState>(() => ({ videoModelId: str(state.edits.videoModelId) ?? run.config.videoModelId ?? undefined, voiceId: str(state.edits.voiceId) ?? run.config.voiceId }));
  const [newShots, setNewShots] = useState(true);
  const [newVoice, setNewVoice] = useState(true);
  const edits = useMemo((): Record<string, unknown> => {
    if (step === 'script') return { ...scriptEdits(script), durationS: script.durationS };
    if (step === 'generate') return { ...generateEdits(gen), newShots, newVoice };
    return {};
  }, [step, script, gen, newShots, newVoice]);
  const estimate = useStepEstimate(run.id, 'redo', step, edits, open);
  const later = ORDER.slice(ORDER.indexOf(step) + 1).filter((s) => stepOf(run, s).status === 'done');
  const blocked = step === 'script' && script.angleIndex < 0 && !script.angle.trim();
  const ready = !!estimate.data && estimate.data.withinRunBudget && estimate.data.withinMonthlyBudget;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redo the {SHORT[step]}</DialogTitle>
          <DialogDescription>Tell the agent what to change. It keeps everything else from this run.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {step === 'script' && <ScriptFields run={run} value={script} onChange={setScript} />}
          {step === 'generate' && (
            <>
              <div className="space-y-2 rounded-xl border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={newShots} onCheckedChange={(v) => setNewShots(v === true)} /> Generate new shots
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={newVoice} onCheckedChange={(v) => setNewVoice(v === true)} /> Record a new voice-over
                </label>
                {!newShots && !newVoice && <p className="text-xs text-muted-foreground">The ad is assembled and rendered again, picking up licensed music you added since.</p>}
              </div>
              <GenerateFields value={gen} onChange={setGen} />
            </>
          )}
          <NoteField value={note} onChange={setNote} label="What should change?" placeholder={step === 'research' ? 'e.g. Focus on busy parents instead of students.' : step === 'optimize' ? 'e.g. Judge on cost per purchase, not clicks.' : 'e.g. Faster pacing, warmer tone, show the product sooner.'} />
          {later.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> The {later.map((s) => SHORT[s]).join(', ')} step{later.length > 1 ? 's' : ''} after it will run again with your approval.{later.includes('launch') ? ' Ads already created stay in the Ad Launcher.' : ''}
            </p>
          )}
          <PriceLine q={estimate} onRaise={(missing) => patch.mutate({ budgetUsd: Math.ceil(((run.budgetUsd ?? 0) + missing) * 100) / 100 + 1 })} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" loading={decide.isPending} disabled={blocked || !ready} onClick={() => decide.mutate({ decision: 'reject', step, edits, ...(note.trim() ? { note: note.trim() } : {}) })}>
            <RotateCcw className="size-4" /> Redo {SHORT[step]}
            {estimate.data && estimate.data.usd > 0 && <span className="tabular-nums opacity-80">· {formatUsd(estimate.data.usd)}</span>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Whether a step can run again from its card: a finished step (not ads already created), or the
 * first skipped step after a finished one, which picks the run back up.
 */
export function canRedo(run: AgentRunView, step: AgentStepView): boolean {
  if (run.status !== 'awaiting_approval' && run.status !== 'completed') return false;
  if (step.status !== 'done' && step.status !== 'skipped') return false;
  if (step.id === 'launch' && run.campaigns.length) return false;
  if (step.status === 'skipped') {
    const prev = previousOf(step.id);
    if (!prev || stepOf(run, prev).status !== 'done') return false;
  }
  const current = run.currentStep;
  return current === 'done' || ORDER.indexOf(step.id) < ORDER.indexOf(current);
}
