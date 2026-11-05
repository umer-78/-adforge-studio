import { asJson, isRecord, workspacePatchSchema, type Update } from '@adforge/core';
import { check, logActivity, route } from '@/lib/server/api';
import { requireSession } from '@/lib/server/providers';
import { loadMe } from '@/lib/server/workspace';

/** Workspace name, spend cap and defaults. Admins only, from the app (a leaked API key cannot raise the cap). */
export const PATCH = route({ body: workspacePatchSchema, role: 'admin' }, async ({ sb, caller, body }) => {
  requireSession(caller, 'Workspace settings');
  const patch: Update<'workspaces'> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.monthlyBudgetUsd !== undefined) patch.monthly_budget_usd = Math.round(body.monthlyBudgetUsd * 100) / 100;
  if (body.budgetHardStop !== undefined) patch.budget_hard_stop = body.budgetHardStop;
  if (body.aiLabelDefault !== undefined) patch.ai_label_default = body.aiLabelDefault;
  if (body.settings) {
    const ws = check(await sb.from('workspaces').select('settings').eq('id', caller.workspaceId).single(), 'Could not load the workspace');
    const changes = Object.fromEntries(Object.entries(body.settings).filter(([, v]) => v !== undefined));
    patch.settings = asJson({ ...(isRecord(ws.settings) ? ws.settings : {}), ...changes });
  }
  if (Object.keys(patch).length) {
    check(await sb.from('workspaces').update(patch).eq('id', caller.workspaceId), 'Could not save the workspace');
    await logActivity(sb, caller, 'workspace.updated', 'workspace', caller.workspaceId, { fields: Object.keys(patch) });
  }
  return loadMe(sb, caller);
});
