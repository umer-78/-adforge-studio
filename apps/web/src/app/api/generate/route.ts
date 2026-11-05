import { generationCreateSchema } from '@adforge/core';
import { logActivity, route } from '@/lib/server/api';
import { createGenerations, toGenerationViews } from '@/lib/server/generation';

export const POST = route({ body: generationCreateSchema, scope: 'generate', limit: ['generate', 120, 3600] }, async ({ sb, caller, body }) => {
  const rows = await createGenerations(sb, caller, body);
  await logActivity(sb, caller, 'generation.started', 'generation', rows[0]!.id, { model: body.modelId, variants: rows.length });
  return { items: await toGenerationViews(sb, caller.workspaceId, rows) };
});
