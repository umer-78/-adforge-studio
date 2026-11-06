import {
  adChecksOf,
  asJson,
  checkAdPolicy,
  FlashDetector,
  isRecord,
  loudnessReport,
  policyStatus,
  soundOffReport,
  type AdChecks,
  type AssetRow,
  type SoundOffReport,
  type TimelineData,
} from '@adforge/core';
import { PermanentError } from '../lib/errors';
import { downloadAsset, loadAsset } from '../lib/files';
import { measureLoudness, probe, streamFrames } from '../media/ffmpeg';
import type { JobContext, JobHandler } from '../runner';

/** Small frames are enough: flash rules work on areas of the screen, not detail. */
const FRAME_W = 64;
const FRAME_H = 36;
/** Ads are short; this keeps the check quick on long files. */
const MAX_SCAN_S = 600;

type Part = 'flash' | 'loudness' | 'soundOff' | 'policy';

/** Whether the edit behind a render has captions or on-screen text. Null when it was not made in the editor. */
async function editHasText(ctx: JobContext, asset: AssetRow): Promise<boolean | null> {
  const render = isRecord(asset.meta) && isRecord(asset.meta.render) ? asset.meta.render : null;
  if (!render || typeof render.timelineId !== 'string') return null;
  const { data } = await ctx.sb.from('timeline_snapshots').select('data').eq('timeline_id', render.timelineId).eq('version', Number(render.version)).maybeSingle();
  const tl = (data?.data ?? null) as unknown as TimelineData | null;
  if (!tl || !Array.isArray(tl.tracks)) return null;
  return tl.tracks.some((t) => t.clips.some((c) => c.type === 'captions' || c.type === 'text'));
}

function transcriptSegments(asset: AssetRow): { start: number; end: number }[] | null {
  if (asset.transcript == null) return null;
  const stored = isRecord(asset.transcript_segments) ? asset.transcript_segments : null;
  const list = stored && Array.isArray(stored.segments) ? stored.segments : [];
  return list.filter((s): s is { start: number; end: number } => isRecord(s) && typeof s.start === 'number' && typeof s.end === 'number');
}

/** Flash safety, loudness, sound-off and wording checks, saved on the file for the Library and Publish. */
export const mediaCheck: JobHandler<'media.check'> = {
  async run(ctx, { assetId, parts }) {
    const asset = await loadAsset(ctx.sb, ctx.workspaceId, assetId);
    if (asset.deleted_at) return { skipped: 'deleted' };
    if (asset.type === 'model3d') throw new PermanentError('Checks work on videos, photos and audio.');
    const previous = adChecksOf(asset.meta);
    const want = new Set<Part>(previous && parts?.length ? parts : ['flash', 'loudness', 'soundOff', 'policy']);
    const needsFile = want.has('flash') || want.has('loudness') || (want.has('soundOff') && !previous);

    let durationS = asset.duration_s == null ? null : Number(asset.duration_s);
    let hasAudio = isRecord(asset.meta) && typeof asset.meta.hasAudio === 'boolean' ? asset.meta.hasAudio : asset.type !== 'image';
    let flash = previous?.flash ?? null;
    let loudness = previous?.loudness ?? loudnessReport(null, null, hasAudio);

    if (needsFile && asset.type !== 'image') {
      ctx.progress(5, 'Reading file');
      const file = await downloadAsset(ctx, asset);
      const p = await probe(file, ctx.signal);
      durationS = p.durationS ?? durationS;
      hasAudio = p.hasAudio;
      if (want.has('flash') && asset.type === 'video') {
        const fps = Math.min(60, Math.max(10, Math.round(p.fps ?? 30)));
        const detector = new FlashDetector(FRAME_W, FRAME_H, fps);
        const total = Math.max(1, Math.min(durationS ?? MAX_SCAN_S, MAX_SCAN_S) * fps);
        await streamFrames(file, {
          width: FRAME_W,
          height: FRAME_H,
          fps,
          maxS: MAX_SCAN_S,
          signal: ctx.signal,
          onFrame: (rgb) => {
            detector.push(rgb);
            if (detector.frames % (fps * 2) === 0) ctx.progress(10 + Math.min(1, detector.frames / total) * 60, 'Checking for flashing');
          },
        });
        flash = detector.result();
      }
      if (want.has('loudness')) {
        ctx.progress(75, 'Measuring loudness');
        const loud = hasAudio ? await measureLoudness(file, -14, ctx.signal).catch(() => null) : null;
        loudness = loudnessReport(loud ? Number(loud.input_i) : null, loud ? Number(loud.input_tp) : null, hasAudio);
      }
    }

    ctx.progress(90, 'Checking wording');
    const soundOff: SoundOffReport =
      asset.type === 'video'
        ? soundOffReport({ hasAudio, durationS, segments: transcriptSegments(asset), captions: await editHasText(ctx, asset) })
        : { status: 'none', speechShare: null, captions: null, message: asset.type === 'image' ? 'Photos have no sound.' : 'Audio on its own has nothing to show muted.' };
    const findings = asset.transcript ? checkAdPolicy(asset.transcript) : [];
    const checks: AdChecks = {
      version: 1,
      checkedAt: new Date().toISOString(),
      flash: asset.type === 'video' ? flash : null,
      loudness: asset.type === 'image' ? loudnessReport(null, null, false) : loudness,
      soundOff,
      policy: { status: asset.transcript ? policyStatus(findings) : 'none', findings, source: asset.transcript ? 'transcript' : null },
    };

    // Write onto the latest meta so work that finished meanwhile is kept.
    const { data: fresh } = await ctx.sb.from('assets').select('meta').eq('id', asset.id).maybeSingle();
    const meta = isRecord(fresh?.meta) ? fresh.meta : {};
    const { error } = await ctx.sb.from('assets').update({ meta: asJson({ ...meta, checks }) }).eq('id', asset.id);
    if (error) throw new Error(`Could not save the checks: ${error.message}`);
    return { flash: checks.flash?.status ?? null, loudness: checks.loudness.status, soundOff: checks.soundOff.status, policy: checks.policy.status };
  },
};
