import { AGENT_STEPS, asJson, formatUsd, getModel, parseAgentSteps, type AgentStep, type Update } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, conflict, logActivity, owned, route } from '@/lib/server/api';
import { agentSpent, estimateStep, toAgentRunViews } from '@/lib/server/agent';

const patch = z.object({
  goal: z.string().trim().min(5).max(2000).optional(),
  /** Can change at any time; it is checked before each step starts. */
  budgetUsd: z.number().min(1).max(10_000).optional(),
  /** Opt-in: steps estimated at or under this run without asking. Launching ads always asks. */
  autoApproveUnderUsd: z.number().min(0).max(25).optional(),
  /** Defaults for the steps still to come. Changeable between steps, not while one runs. */
  config: z
    .object({
      platforms: z.array(z.enum(['meta', 'tiktok'])).min(1).max(2).optional(),
      adAccountId: z.string().uuid().nullable().optional(),
      dailyAdBudget: z.number().positive().max(10_000).nullable().optional(),
      aspect: z.enum(['9:16', '1:1', '4:5', '16:9']).optional(),
      durationS: z.number().int().min(6).max(90).optional(),
      videoModelId: z.string().max(100).nullable().optional(),
      voiceId: z.string().max(100).nullable().optional(),
      style: z.enum(['ugc', 'polished']).optional(),
      countries: z.array(z.string().length(2)).min(1).max(25).optional(),
      landingUrl: z.string().url().max(2000).nullable().optional(),
    })
    .optional(),
});

export const GET = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'agent_runs', params.id!, caller, 'The agent run');
  return (await toAgentRunViews(sb, caller.workspaceId, [row]))[0];
});

export const PATCH = route({ body: patch }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'agent_runs', params.id!, caller, 'The agent run');
  if (row.status === 'canceled') throw badRequest('This run was canceled. Start a new one instead.');
  const steps = parseAgentSteps(row.steps);
  const update: Update<'agent_runs'> = {};
  if (body.goal) update.goal = body.goal;
  if (body.autoApproveUnderUsd !== undefined) update.auto_approve_under_usd = body.autoApproveUnderUsd;
  if (body.budgetUsd !== undefined) {
    const spent = agentSpent(steps);
    if (body.budgetUsd + 1e-6 < spent) throw badRequest(`This run already spent ${formatUsd(spent)}. Set a budget of at least that.`);
    update.budget_usd = body.budgetUsd;
  }

  const cfg = body.config;
  if (cfg && Object.values(cfg).some((v) => v !== undefined)) {
    // The worker rewrites the steps document when a step ends, so defaults change between steps only.
    if (row.status === 'running') throw conflict('Wait for the current step to finish, then change the run settings.');
    const next = { ...steps.config };
    if (cfg.platforms) next.platforms = [...new Set(cfg.platforms)];
    if (cfg.adAccountId !== undefined) {
      if (cfg.adAccountId) {
        const account = await owned(sb, 'ad_accounts', cfg.adAccountId, caller, 'The ad account');
        if (!next.platforms.includes(account.platform as 'meta' | 'tiktok')) throw badRequest('That ad account is not for one of the platforms this run targets.');
      }
      next.adAccountId = cfg.adAccountId;
    }
    if (cfg.videoModelId !== undefined) {
      if (cfg.videoModelId && getModel(cfg.videoModelId)?.capability !== 't2v') throw badRequest('Pick a text-to-video model for the shots.');
      next.videoModelId = cfg.videoModelId;
    }
    if (cfg.voiceId !== undefined) {
      if (cfg.voiceId) {
        const { data: voice } = await sb.from('voices').select('id').eq('workspace_id', caller.workspaceId).eq('provider_voice_id', cfg.voiceId).limit(1).maybeSingle();
        if (!voice) throw badRequest('Add that voice to your Voice-over library first.');
      }
      next.voiceId = cfg.voiceId;
    }
    if (cfg.countries) next.countries = [...new Set(cfg.countries.map((c) => c.toUpperCase()))];
    if (cfg.dailyAdBudget !== undefined) next.dailyAdBudget = cfg.dailyAdBudget;
    if (cfg.aspect) next.aspect = cfg.aspect;
    if (cfg.durationS) next.durationS = cfg.durationS;
    if (cfg.style) next.style = cfg.style;
    if (cfg.landingUrl !== undefined) next.landingUrl = cfg.landingUrl;
    steps.config = next;
    // The step waiting for approval is priced with the new defaults.
    const current = row.current_step as AgentStep | 'done';
    if (row.status === 'awaiting_approval' && current !== 'done' && AGENT_STEPS.includes(current)) {
      try {
        steps[current].estimateUsd = (await estimateStep(sb, row, steps, current, steps[current].edits)).usd;
      } catch {
        steps[current].estimateUsd = null;
      }
    }
    update.steps = asJson(steps);
  }
  if (!Object.keys(update).length) return (await toAgentRunViews(sb, caller.workspaceId, [row]))[0];

  // Steps changes are guarded against a step starting at the same moment.
  let req = sb.from('agent_runs').update(update).eq('id', row.id);
  if (update.steps) req = req.eq('updated_at', row.updated_at).neq('status', 'running');
  const saved = check(await req.select('*').maybeSingle(), 'Could not save the run');
  if (!saved) throw conflict('The run just moved on. Refresh and try again.');
  return (await toAgentRunViews(sb, caller.workspaceId, [saved]))[0];
});

/** Removes the run. What it made (product, script, edit, video, paused campaigns) stays in their libraries. */
export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'agent_runs', params.id!, caller, 'The agent run');
  if (row.status === 'running') throw badRequest('Cancel the run before deleting it.');
  check(await sb.from('agent_runs').delete().eq('id', row.id), 'Could not delete the run');
  await logActivity(sb, caller, 'agent.delete', 'agent_run', row.id, { goal: row.goal.slice(0, 200) });
});
