import { verifyFalWebhook } from '@adforge/core/server';
import { publicRoute } from '@/lib/server/api';
import { ack, rejectSignature, wakeGeneration } from '@/lib/server/webhooks';

/** fal calls this when a queued request finishes. Signed with fal's ED25519 key (JWKS). */
export const POST = publicRoute({ limit: ['webhook-fal', 600, 60] }, async ({ req, sb }) => {
  const raw = Buffer.from(await req.arrayBuffer());
  if (!(await verifyFalWebhook(req.headers, raw))) return rejectSignature();
  let body: { request_id?: string; gateway_request_id?: string } = {};
  try {
    body = JSON.parse(raw.toString('utf8')) as typeof body;
  } catch {
    return ack({ ignored: 'not json' });
  }
  const generationId = req.nextUrl.searchParams.get('generationId');
  if (!generationId) return ack({ ignored: 'no generation' });
  const first = await wakeGeneration(sb, generationId, body.request_id ?? null, 'fal');
  // fal may report its gateway id instead of the queue id.
  if ('ignored' in first && first.ignored === 'unknown generation' && body.gateway_request_id) return ack(await wakeGeneration(sb, generationId, body.gateway_request_id, 'fal'));
  return ack(first);
});
