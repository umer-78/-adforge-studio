import { asJson, isRecord, type PlaybackInfo } from '@adforge/core';
import { verifyMuxWebhook } from '@adforge/core/server';
import { publicRoute } from '@/lib/server/api';
import { ack, rejectSignature } from '@/lib/server/webhooks';

interface MuxEvent {
  type?: string;
  data?: { id?: string; status?: string; passthrough?: string; playback_ids?: { id: string; policy: 'signed' | 'public' }[] };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mux reports when streaming copies are ready. The asset id travels as the passthrough value. */
export const POST = publicRoute({ limit: ['webhook-mux', 600, 60] }, async ({ req, sb }) => {
  const raw = await req.text();
  if (!verifyMuxWebhook(req.headers.get('mux-signature'), raw)) return rejectSignature();
  let event: MuxEvent;
  try {
    event = JSON.parse(raw) as MuxEvent;
  } catch {
    return ack({ ignored: 'not json' });
  }
  if (event.type !== 'video.asset.ready' && event.type !== 'video.asset.errored') return ack({ ignored: event.type ?? 'unknown' });
  const d = event.data ?? {};
  if (!d.id || !d.passthrough || !UUID.test(d.passthrough)) return ack({ ignored: 'no asset' });
  const { data: asset } = await sb.from('assets').select('id, playback').eq('id', d.passthrough).maybeSingle();
  const playback = (isRecord(asset?.playback) ? asset.playback : {}) as PlaybackInfo;
  if (!asset || playback.muxAssetId !== d.id) return ack({ ignored: 'unknown asset' });
  const pid = d.playback_ids?.[0];
  const next: PlaybackInfo = { ...playback, muxStatus: event.type === 'video.asset.ready' ? 'ready' : 'errored', ...(pid ? { muxPlaybackId: pid.id, policy: pid.policy } : {}) };
  await sb.from('assets').update({ playback: asJson(next) }).eq('id', asset.id);
  return ack({ asset: asset.id, status: next.muxStatus });
});
