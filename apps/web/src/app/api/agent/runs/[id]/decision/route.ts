import { AGENT_STEP_LABELS, AGENT_STEPS, agentDecisionSchema, asJson, parseAgentSteps, type AgentRunRow, type AgentStep, type AgentSteps } from '@adforge/core';
import { enqueueJob, type ServiceClient } from '@adforge/core/server';
import { badRequest, check, conflict, logActivity, owned, requireScope, route, type Caller } from '@/lib/server/api';
import { assertRunBudget, assertStepReady, estimateStep, parseStepEdits, redoGenerateOutput, resetAfter, scopeForStep, stopRunWork, toAgentRunViews } from '@/lib/server/agent';

const now = () => new Date().toISOString();
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Saves the steps and queues the step, guarded so two clicks never start it twice. */
async function startStep(sb: ServiceClient, caller: Caller, run: AgentRunRow, steps: AgentSteps, step: AgentStep, verb: string) {
  const saved = check(
    await sb
      .from('agent_runs')
      .update({ steps: asJson(steps), current_step: step, status: 'running', error: null })
      .eq('id', run.id)
      .eq('updated_at', run.updated_at)
      .in('status', ['awaiting_approval', 'completed'])
      .select('*')
      .maybeSingle(),
    'Could not start the step',
  );
  if (!saved) throw conflict('The run just changed. Refresh and try again.');
  try {
    const job = await enqueueJob(sb, { type: 'agent.step', payload: { runId: run.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `agent.step:${run.id}:${step}:${Date.now()}` });
    await sb.from('agent_runs').update({ job_id: job.id }).eq('id', run.id);
    saved.job_id = job.id;
  } catch (err) {
    // Back to the gate rather than a run that says it is working with nothing queued.
    await sb.from('agent_runs').update({ status: 'awaiting_approval', error: 'Could not queue the step. Try again.' }).eq('id', run.id);
    throw err;
  }
  await logActivity(sb, caller, verb, 'agent_run', run.id, { step, label: AGENT_STEP_LABELS[step], estimateUsd: steps[step].estimateUsd });
  return saved;
}

/** The step a redo goes back to by default: the one before the gate, or the last one that ran. */
function defaultRedo(steps: AgentSteps, current: AgentStep | 'done'): AgentStep | null {
  if (current !== 'done') return AGENT_STEPS[AGENT_STEPS.indexOf(current) - 1] ?? null;
  return [...AGENT_STEPS].reverse().find((s) => steps[s].status === 'done') ?? null;
}

export const POST = route({ body: agentDecisionSchema, limit: ['agent-decision', 300, 3600] }, async ({ sb, caller, params, body }) => {
  const run = await owned(sb, 'agent_runs', params.id!, caller, 'The agent run');
  const steps = parseAgentSteps(run.steps);
  const current = run.current_step as AgentStep | 'done';
  const view = async (row: AgentRunRow) => (await toAgentRunViews(sb, caller.workspaceId, [row]))[0];

  if (body.decision === 'cancel') {
    if (run.status !== 'awaiting_approval' && run.status !== 'running') throw badRequest('This run has already ended.');
    const saved = check(await sb.from('agent_runs').update({ status: 'canceled', error: null }).eq('id', run.id).in('status', ['awaiting_approval', 'running']).select('*').maybeSingle(), 'Could not cancel the run');
    if (!saved) throw conflict('The run just changed. Refresh and try again.');
    await stopRunWork(sb, caller.workspaceId, run, steps);
    await logActivity(sb, caller, 'agent.cancel', 'agent_run', run.id, { step: current });
    return view(saved);
  }

  if (body.decision === 'skip') {
    if (run.status !== 'awaiting_approval' || current === 'done') throw badRequest('Only a run waiting for approval can finish early.');
    if (current === 'research') throw badRequest('Nothing has run yet. Cancel the run instead.');
    const at = current;
    for (const s of AGENT_STEPS.slice(AGENT_STEPS.indexOf(at))) {
      steps[s] = { ...steps[s], status: 'skipped', estimateUsd: null, error: null, finishedAt: now(), note: s === at ? 'Skipped: the run finished here.' : 'Skipped.' };
    }
    const saved = check(
      await sb.from('agent_runs').update({ steps: asJson(steps), current_step: 'done', status: 'completed', error: null }).eq('id', run.id).eq('updated_at', run.updated_at).eq('status', 'awaiting_approval').select('*').maybeSingle(),
      'Could not finish the run',
    );
    if (!saved) throw conflict('The run just changed. Refresh and try again.');
    await logActivity(sb, caller, 'agent.finish', 'agent_run', run.id, { skippedFrom: at });
    return view(saved);
  }

  if (body.decision === 'approve') {
    if (run.status === 'running') throw conflict('This step is already running.');
    if (run.status !== 'awaiting_approval' || current === 'done') throw badRequest('Nothing in this run is waiting for approval.');
    if (body.step && body.step !== current) throw conflict(`The run is waiting at “${AGENT_STEP_LABELS[current]}” now. Refresh and try again.`);
    const step = current;
    requireScope(caller, scopeForStep(step));
    const edits = parseStepEdits(step, body.edits, body.note);
    delete edits.newShots;
    delete edits.newVoice;
    // A retry resumes from the step's last output (kept shots and voice-over are not paid twice).
    const est = await estimateStep(sb, run, steps, step, edits);
    assertRunBudget(run, steps, est.usd);
    await assertStepReady(sb, caller, steps, step, edits, steps[step].output, est.usd);
    steps[step] = { ...steps[step], edits, estimateUsd: est.usd, error: null };
    return view(await startStep(sb, caller, run, steps, step, 'agent.approve'));
  }

  // Redo or reopen: back to a finished step; the steps after it start over.
  if (run.status !== 'awaiting_approval' && run.status !== 'completed') throw badRequest(run.status === 'running' ? 'Wait for the current step to finish.' : 'This run has ended.');
  const target = body.step ?? defaultRedo(steps, current);
  if (body.decision === 'reopen') {
    if (!target) throw badRequest('Say which step to go back to.');
    if (current !== 'done' && AGENT_STEPS.indexOf(target) >= AGENT_STEPS.indexOf(current)) throw badRequest('That step is not finished yet.');
    if (steps[target].status !== 'done' && steps[target].status !== 'skipped') throw badRequest('Only finished or skipped steps can be reopened.');
    if (target === 'launch' && strings(steps.launch.output.campaignIds).length) throw badRequest('These ads were already created. Manage them in the Ad Launcher.');
    const prev = AGENT_STEPS[AGENT_STEPS.indexOf(target) - 1];
    if (prev && steps[prev].status !== 'done') throw badRequest(`Finish “${AGENT_STEP_LABELS[prev]}” first.`);
    steps[target] = { ...steps[target], status: 'pending', startedAt: null, finishedAt: null, output: target === 'generate' ? redoGenerateOutput(steps, { newShots: false, newVoice: false }) : {}, note: null, error: null };
    resetAfter(steps, target);
    try {
      steps[target].estimateUsd = (await estimateStep(sb, run, steps, target, steps[target].edits)).usd;
    } catch {
      steps[target].estimateUsd = null;
    }
    const saved = check(
      await sb.from('agent_runs').update({ steps: asJson(steps), current_step: target, status: 'awaiting_approval', error: null }).eq('id', run.id).eq('updated_at', run.updated_at).in('status', ['awaiting_approval', 'completed']).select('*').maybeSingle(),
      'Could not reopen the step',
    );
    if (!saved) throw conflict('The run just changed. Refresh and try again.');
    await logActivity(sb, caller, 'agent.reopen', 'agent_run', run.id, { step: target });
    return view(saved);
  }
  if (!target) throw badRequest('No step has finished yet. Approve the first step to start.');
  if (current !== 'done' && AGENT_STEPS.indexOf(target) >= AGENT_STEPS.indexOf(current)) throw badRequest('Only finished steps can be redone. Approve this step to run it.');
  if (steps[target].status !== 'done' && steps[target].status !== 'skipped') throw badRequest('Only finished steps can be redone.');
  if (target === 'launch' && steps.launch.status === 'done' && strings(steps.launch.output.campaignIds).length) {
    throw badRequest('These ads were already created. Manage them in the Ad Launcher, or redo an earlier step to make a new ad.');
  }
  requireScope(caller, scopeForStep(target));
  const edits = parseStepEdits(target, body.edits, body.note);
  const output = target === 'generate' ? redoGenerateOutput(steps, edits) : {};
  delete edits.newShots;
  delete edits.newVoice;
  const probe: AgentSteps = { ...steps, [target]: { ...steps[target], output } };
  const est = await estimateStep(sb, run, probe, target, edits, output);
  assertRunBudget(run, steps, est.usd);
  await assertStepReady(sb, caller, probe, target, edits, output, est.usd);
  steps[target] = { ...steps[target], status: 'pending', startedAt: null, finishedAt: null, edits, output, estimateUsd: est.usd, note: null, error: null };
  resetAfter(steps, target);
  return view(await startStep(sb, caller, run, steps, target, 'agent.redo'));
});
