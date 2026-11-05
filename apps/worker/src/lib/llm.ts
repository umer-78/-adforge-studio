import { readFile } from 'node:fs/promises';
import type * as z from 'zod';
import { LLM_TASKS, llmEstimate, type LlmTask } from '@adforge/core';
import { assertBudget, modelForTier, providerKey, recordUsage, requireProviderKey, structured, type ImageInput, type StructuredRequest } from '@adforge/core/server';
import type { JobContext } from '../runner';

export interface LlmCall<T extends z.ZodType> extends Omit<StructuredRequest<T>, 'apiKey' | 'tier'> {
  task: LlmTask;
  meta?: Record<string, unknown>;
}

/** Runs a structured Claude task within the workspace budget and records its cost. */
export async function runLlm<T extends z.ZodType>(ctx: JobContext, call: LlmCall<T>): Promise<{ data: z.infer<T>; costUsd: number; model: string }> {
  const workspaceId = ctx.workspaceId;
  const apiKey = await requireProviderKey(workspaceId, 'anthropic');
  const spec = LLM_TASKS[call.task];
  const model = call.model ?? modelForTier(spec.tier);
  const imageTokens = (call.images?.length ?? 0) * 1200;
  await assertBudget(ctx.sb, workspaceId, llmEstimate(model, spec.input + imageTokens, spec.output));
  ctx.checkAborted();
  const { task, meta, ...req } = call;
  const res = await structured({ ...req, apiKey, tier: spec.tier, model });
  await recordUsage(ctx.sb, {
    workspaceId,
    userId: ctx.job.created_by,
    kind: 'llm',
    provider: 'anthropic',
    model: res.model,
    units: res.usage.input_tokens + res.usage.output_tokens,
    unit: 'tokens',
    costUsd: res.costUsd,
    jobId: ctx.job.id,
    meta: { task, ...res.usage, ...meta },
  });
  return { data: res.data, costUsd: res.costUsd, model: res.model };
}

/** True when the workspace (or the server) has a Claude key. */
export const llmAvailable = async (ctx: JobContext) => !!(await providerKey(ctx.job.workspace_id, 'anthropic'));

export async function jpegInput(file: string): Promise<ImageInput> {
  return { base64: (await readFile(file)).toString('base64'), mediaType: 'image/jpeg' };
}

/** Frames labelled with their timestamps, as Claude image inputs. */
export async function frameInputs(frames: { t: number; file: string }[]): Promise<{ label: string; image: ImageInput }[]> {
  return Promise.all(frames.map(async (f) => ({ label: `Frame at ${f.t.toFixed(1)}s:`, image: await jpegInput(f.file) })));
}
