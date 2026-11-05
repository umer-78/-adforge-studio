import { agentConfigSchema, agentRunCreateSchema, agentStepsSchema, asJson, getModel } from '@adforge/core';
import { assertSafeUrl, enqueueJob } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, check, logActivity, owned, route } from '@/lib/server/api';
import { toAgentRunViews } from '@/lib/server/agent';
import { assertLlmReady, llmTaskUsd } from '@/lib/server/growth';

const query = z.object({
  status: z.enum(['awaiting_approval', 'running', 'completed', 'failed', 'canceled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().datetime({ offset: true }).optional(),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('agent_runs').select('*').eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(q.limit + 1);
  if (q.status) req = req.eq('status', q.status);
  if (q.cursor) req = req.lt('created_at', q.cursor);
  const rows = check(await req, 'Could not load agent runs');
  const page = rows.slice(0, q.limit);
  return { items: await toAgentRunViews(sb, caller.workspaceId, page), nextCursor: rows.length > q.limit ? page[page.length - 1]!.created_at : null };
});

/**
 * Starts an agent run: research → script → generate → launch (paused) → optimize. Each step waits
 * for approval unless its estimate is under the opt-in auto-approve amount; launching always asks.
 */
export const POST = route({ body: agentRunCreateSchema, scope: 'generate', limit: ['agent', 30, 3600] }, async ({ sb, caller, body }) => {
  let productId: string | null = null;
  let productUrl: string;
  let productReady = false;
  if (body.productId) {
    const product = await owned(sb, 'products', body.productId, caller, 'The product');
    productId = product.id;
    productUrl = product.source_url;
    productReady = product.status === 'ready';
  } else productUrl = assertSafeUrl(body.productUrl!).toString();

  const platforms = [...new Set(body.platforms)];
  if (body.adAccountId) {
    const account = await owned(sb, 'ad_accounts', body.adAccountId, caller, 'The ad account');
    if (!platforms.includes(account.platform as (typeof platforms)[number])) throw badRequest(`That ad account is for ${account.platform === 'tiktok' ? 'TikTok' : 'Meta'}. Add the platform or pick another account.`);
  }
  if (body.videoModelId && getModel(body.videoModelId)?.capability !== 't2v') throw badRequest('Pick a text-to-video model for the shots.');
  if (body.voiceId) {
    const { data: voice } = await sb.from('voices').select('id').eq('workspace_id', caller.workspaceId).eq('provider_voice_id', body.voiceId).limit(1).maybeSingle();
    if (!voice) throw badRequest('Add that voice to your Voice-over library first.');
  }

  const config = agentConfigSchema.parse({
    platforms,
    adAccountId: body.adAccountId ?? null,
    dailyAdBudget: body.dailyAdBudget ?? null,
    aspect: body.aspect,
    durationS: body.durationS,
    videoModelId: body.videoModelId ?? null,
    voiceId: body.voiceId ?? null,
    style: body.style,
    countries: [...new Set(body.countries.map((c) => c.toUpperCase()))],
    landingUrl: body.landingUrl ?? null,
  });
  const steps = agentStepsSchema.parse({ config });
  const estimate = llmTaskUsd('research') + (productReady ? 0 : llmTaskUsd('extractProduct'));
  steps.research.estimateUsd = Math.round(estimate * 10_000) / 10_000;
  if (body.start) await assertLlmReady(sb, caller, estimate, 'use agent mode');

  const row = check(
    await sb
      .from('agent_runs')
      .insert({
        workspace_id: caller.workspaceId,
        goal: body.goal,
        product_id: productId,
        product_url: productUrl,
        budget_usd: body.budgetUsd,
        auto_approve_under_usd: body.autoApproveUnderUsd,
        status: body.start ? 'running' : 'awaiting_approval',
        current_step: 'research',
        steps: asJson(steps),
        created_by: caller.userId,
      })
      .select('*')
      .single(),
    'Could not start the agent',
  );
  let jobId: string | null = null;
  if (body.start) {
    const job = await enqueueJob(sb, { type: 'agent.step', payload: { runId: row.id }, workspaceId: caller.workspaceId, createdBy: caller.userId, priority: 5, idempotencyKey: `agent.step:${row.id}:research:start` });
    jobId = job.id;
    check(await sb.from('agent_runs').update({ job_id: job.id }).eq('id', row.id), 'Could not start the agent');
  }
  await logActivity(sb, caller, 'agent.create', 'agent_run', row.id, { goal: body.goal.slice(0, 200), started: body.start });
  return (await toAgentRunViews(sb, caller.workspaceId, [{ ...row, job_id: jobId }]))[0];
});
