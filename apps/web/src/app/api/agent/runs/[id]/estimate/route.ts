import { AGENT_STEPS, parseAgentSteps, type AgentStep, type AgentSteps } from '@adforge/core';
import * as z from 'zod';
import { badRequest, owned, route } from '@/lib/server/api';
import { estimateStep, parseStepEdits, redoGenerateOutput, toEstimateView } from '@/lib/server/agent';

const body = z.object({
  /** approve: the step waiting at the gate. redo: a finished step run again. */
  mode: z.enum(['approve', 'redo']).default('approve'),
  step: z.enum(AGENT_STEPS).optional(),
  edits: z.record(z.string(), z.unknown()).optional(),
});

/** Live price of a step with the edits about to be approved, against the run and monthly budgets. */
export const POST = route({ body, limit: ['agent-estimate', 600, 3600] }, async ({ sb, caller, params, body: b }) => {
  const run = await owned(sb, 'agent_runs', params.id!, caller, 'The agent run');
  const steps = parseAgentSteps(run.steps);
  const current = run.current_step as AgentStep | 'done';
  const step = b.step ?? (b.mode === 'approve' && current !== 'done' ? current : null);
  if (!step) throw badRequest('Say which step to price.');
  const edits = parseStepEdits(step, b.edits);
  const output = b.mode === 'redo' ? (step === 'generate' ? redoGenerateOutput(steps, edits) : {}) : steps[step].output;
  const probe: AgentSteps = { ...steps, [step]: { ...steps[step], output } };
  return toEstimateView(sb, run, probe, step, await estimateStep(sb, run, probe, step, edits, output));
});
