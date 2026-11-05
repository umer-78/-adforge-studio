import { agentConfigSchema, getModel } from '@adforge/core';
import * as z from 'zod';
import { badRequest, route } from '@/lib/server/api';
import { planEstimate } from '@/lib/server/agent';

const query = z.object({
  durationS: z.coerce.number().int().min(6).max(90).default(20),
  aspect: z.enum(['9:16', '1:1', '4:5', '16:9']).default('9:16'),
  style: z.enum(['ugc', 'polished']).default('ugc'),
  videoModelId: z.string().max(100).optional(),
  productId: z.string().uuid().optional(),
});

/** Ballpark cost of a whole run before it starts, shown on the new-run form. */
export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  if (q.videoModelId && getModel(q.videoModelId)?.capability !== 't2v') throw badRequest('Pick a text-to-video model for the shots.');
  const { data: product } = q.productId ? await sb.from('products').select('status').eq('id', q.productId).eq('workspace_id', caller.workspaceId).maybeSingle() : { data: null };
  const cfg = agentConfigSchema.parse({ durationS: q.durationS, aspect: q.aspect, style: q.style, videoModelId: q.videoModelId ?? null });
  return planEstimate(cfg, product?.status === 'ready');
});
