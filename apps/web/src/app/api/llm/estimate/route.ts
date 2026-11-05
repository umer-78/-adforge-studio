import { LLM_TASKS, llmEstimate, type LlmTask } from '@adforge/core';
import { modelForTier } from '@adforge/core/server';
import * as z from 'zod';
import { route } from '@/lib/server/api';

const query = z.object({ task: z.enum(Object.keys(LLM_TASKS) as [LlmTask, ...LlmTask[]]) });

/** Typical price of one writing task (script, rewrite, translation) with the configured Claude model. */
export const GET = route({ query }, async ({ query: q }) => {
  const t = LLM_TASKS[q.task];
  return { usd: llmEstimate(modelForTier(t.tier), t.input, t.output), approx: true };
});
