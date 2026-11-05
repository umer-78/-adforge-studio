import 'server-only';
import { LLM_TASKS, llmEstimate, type LlmTask } from '@adforge/core';
import { assertBudget, modelForTier, recordUsage, requireProviderKey, structured, type ImageInput, type ServiceClient } from '@adforge/core/server';
import type * as z from 'zod';
import type { Caller } from './api';

/** Runs a structured Claude call for a request: budget check first, usage recorded after. */
export async function runLlm<T extends z.ZodType>(
  sb: ServiceClient,
  caller: Caller,
  opts: { task: LlmTask; schema: T; system: string; prompt: string; images?: { label?: string; image: ImageInput }[]; meta?: Record<string, unknown> },
): Promise<z.infer<T>> {
  const key = await requireProviderKey(caller.workspaceId, 'anthropic');
  const t = LLM_TASKS[opts.task];
  await assertBudget(sb, caller.workspaceId, llmEstimate(modelForTier(t.tier), t.input, t.output));
  const res = await structured({ apiKey: key, schema: opts.schema, system: opts.system, prompt: opts.prompt, images: opts.images, tier: t.tier });
  await recordUsage(sb, {
    workspaceId: caller.workspaceId,
    userId: caller.userId,
    kind: 'llm',
    provider: 'anthropic',
    model: res.model,
    units: res.usage.input_tokens + res.usage.output_tokens,
    unit: 'token',
    costUsd: res.costUsd,
    meta: { task: opts.task, ...opts.meta },
  });
  return res.data;
}

/** Brand context for prompts from the workspace's default brand kit. */
export async function workspaceBrandContext(sb: ServiceClient, workspaceId: string, brandKitId?: string | null) {
  let q = sb.from('brand_kits').select('name, tone, colors').eq('workspace_id', workspaceId);
  q = brandKitId ? q.eq('id', brandKitId) : q.eq('is_default', true);
  const { data } = await q.limit(1).maybeSingle();
  if (!data) return null;
  const colors = Array.isArray(data.colors) ? (data.colors as unknown[]).map((c) => (typeof c === 'string' ? c : (c as { hex?: string })?.hex)).filter((c): c is string => !!c) : [];
  return { name: data.name, tone: data.tone, colors };
}
