import { env, verifyStandardWebhook } from '@adforge/core/server';
import { publicRoute } from '@/lib/server/api';
import { ack, rejectSignature, wakeGeneration } from '@/lib/server/webhooks';

/** Replicate calls this when a prediction finishes. Signed with Standard Webhooks (REPLICATE_WEBHOOK_SECRET). */
export const POST = publicRoute({ limit: ['webhook-replicate', 600, 60] }, async ({ req, sb }) => {
  const raw = await req.text();
  if (!verifyStandardWebhook(req.headers, raw, env().REPLICATE_WEBHOOK_SECRET)) return rejectSignature();
  let body: { id?: string; status?: string } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return ack({ ignored: 'not json' });
  }
  const generationId = req.nextUrl.searchParams.get('generationId');
  if (!generationId) return ack({ ignored: 'no generation' });
  if (body.status && !['succeeded', 'failed', 'canceled'].includes(body.status)) return ack({ ignored: body.status });
  return ack(await wakeGeneration(sb, generationId, body.id ?? null, 'replicate'));
});
