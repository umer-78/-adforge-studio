import { estimateSchema } from '@adforge/core';
import { budgetStatus } from '@adforge/core/server';
import { route } from '@/lib/server/api';
import { estimateGeneration } from '@/lib/server/generation';

/** Price and time for a generation before anything is spent. */
export const POST = route({ body: estimateSchema, role: 'viewer', scope: 'read' }, async ({ sb, caller, body }) => {
  const [estimate, budget] = await Promise.all([estimateGeneration(sb, caller, body.modelId, body.params, body.variants), budgetStatus(sb, caller.workspaceId)]);
  return { estimate, budget, withinBudget: !budget.hardStop || budget.spentUsd + estimate.usd <= budget.budgetUsd + 1e-9 };
});
