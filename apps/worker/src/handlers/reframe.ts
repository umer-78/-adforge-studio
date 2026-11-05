import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ASPECT_SIZES, reframeSchema, SYSTEM_PROMPTS, type AspectRatio } from '@adforge/core';
import { PermanentError } from '../lib/errors';
import { createAssetFromFile, downloadAsset, loadAsset } from '../lib/files';
import { frameInputs, llmAvailable, runLlm } from '../lib/llm';
import { detectScenes, extractFrames, ffmpeg, probe, sampleTimes } from '../media/ffmpeg';
import type { JobHandler } from '../runner';

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

interface PathPoint {
  t: number;
  /** Crop offset in source pixels along the pan axis. */
  offset: number;
}

/** Smooths subject positions into a camera path: holds through low confidence, eases, caps pan speed except at cuts. */
export function cameraPath(samples: { t: number; c: number; confidence: number }[], cropSize: number, sourceSize: number, cuts: number[], maxSpeedPerS: number): PathPoint[] {
  const maxOffset = sourceSize - cropSize;
  const out: PathPoint[] = [];
  let current = sourceSize / 2;
  let lastT = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const target = s.confidence >= 0.35 ? s.c : current;
    const cut = cuts.some((c) => c > lastT && c <= s.t);
    if (i === 0 || cut) current = target;
    else {
      const eased = current + (target - current) * 0.6;
      const limit = maxSpeedPerS * Math.max(0.001, s.t - lastT);
      current += Math.max(-limit, Math.min(limit, eased - current));
    }
    lastT = s.t;
    out.push({ t: s.t, offset: Math.round(Math.max(0, Math.min(maxOffset, current - cropSize / 2))) });
  }
  return out;
}

/** Piecewise-linear FFmpeg expression of time for a camera path. */
export function pathExpression(points: PathPoint[]): string {
  if (!points.length) return '0';
  if (points.length === 1) return String(points[0]!.offset);
  let expr = String(points[points.length - 1]!.offset);
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dt = Math.max(0.001, b.t - a.t);
    const seg = a.offset === b.offset ? String(a.offset) : `${a.offset}+(${b.offset - a.offset})*(t-${a.t.toFixed(3)})/${dt.toFixed(3)}`;
    expr = `if(lt(t,${b.t.toFixed(3)}),${seg},${expr})`;
  }
  return `if(lt(t,${points[0]!.t.toFixed(3)}),${points[0]!.offset},${expr})`;
}

export const mediaReframe: JobHandler<'media.reframe'> = {
  async run(ctx, { assetId, aspect }) {
    const asset = await loadAsset(ctx.sb, ctx.workspaceId, assetId);
    if (asset.type !== 'video') throw new PermanentError('Auto-reframe works on videos.');
    ctx.progress(5, 'Reading video');
    const file = await downloadAsset(ctx, asset);
    const p = await probe(file, ctx.signal);
    const W = p.width ?? asset.width ?? 0;
    const H = p.height ?? asset.height ?? 0;
    const duration = p.durationS ?? asset.duration_s ?? 0;
    if (!W || !H || !duration) throw new PermanentError('Could not read the video size.');
    const target = ASPECT_SIZES[aspect as AspectRatio];
    const r = target.width / target.height;
    const R = W / H;
    if (Math.abs(R - r) < 0.01) throw new PermanentError(`This video is already ${aspect}.`);
    const horizontal = R > r; // pan left/right when the source is wider
    const cropW = horizontal ? even(H * r) : W;
    const cropH = horizontal ? H : even(W / r);

    ctx.progress(12, 'Finding cuts');
    const cuts = await detectScenes(file, 0.35, ctx.signal).catch(() => []);
    const times = sampleTimes(duration, Math.max(4, Math.min(48, Math.round(duration * 2))));
    let samples = times.map((t) => ({ t, c: (horizontal ? W : H) / 2, confidence: 1 }));
    let subject: string | null = null;

    if (await llmAvailable(ctx)) {
      ctx.progress(25, 'Tracking the subject');
      const dir = path.join(await ctx.tmp(), 'reframe');
      await mkdir(dir, { recursive: true });
      const frames = await extractFrames(file, times, dir, 384, ctx.signal);
      const images = (await frameInputs(frames)).map((f, i) => ({ ...f, label: `Frame index ${i} (t=${times[i]!.toFixed(2)}s):` }));
      const { data } = await runLlm(ctx, {
        task: 'reframe',
        schema: reframeSchema,
        system: SYSTEM_PROMPTS.reframe,
        prompt: `Reframing from ${W}×${H} to ${aspect}. Give the subject centre for every frame index 0–${frames.length - 1}.`,
        images,
        meta: { assetId: asset.id, aspect },
      });
      subject = data.subject;
      const byIndex = new Map(data.samples.map((s) => [Math.round(s.index), s]));
      samples = times.map((t, i) => {
        const s = byIndex.get(i);
        if (!s) return { t, c: (horizontal ? W : H) / 2, confidence: 0 };
        const frac = Math.max(0, Math.min(1, horizontal ? s.cx : s.cy));
        return { t, c: frac * (horizontal ? W : H), confidence: Math.max(0, Math.min(1, s.confidence)) };
      });
    } else {
      ctx.log.info('no Claude key; using a centre crop');
    }

    const sourceSize = horizontal ? W : H;
    const cropSize = horizontal ? cropW : cropH;
    const points = cameraPath(samples, cropSize, sourceSize, cuts, sourceSize * 0.3);
    const expr = pathExpression(points);
    const outW = even(Math.min(target.width, cropW));
    const outH = even(outW / r);
    const crop = horizontal ? `crop=${cropW}:${cropH}:x='${expr}':y=0` : `crop=${cropW}:${cropH}:x=0:y='${expr}'`;

    ctx.progress(45, 'Rendering');
    const out = path.join(await ctx.tmp(), 'reframed.mp4');
    await ffmpeg(
      [
        '-i', file,
        '-vf', `${crop},scale=${outW}:${outH}:flags=lanczos,setsar=1,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
        ...(p.hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
        '-movflags', '+faststart', out,
      ],
      { signal: ctx.signal, onTime: (t) => ctx.progress(45 + Math.min(1, t / duration) * 45, 'Rendering') },
    );

    ctx.progress(92, 'Saving');
    const created = await createAssetFromFile(ctx, {
      workspaceId: asset.workspace_id,
      filePath: out,
      mime: 'video/mp4',
      name: `${asset.name} (${aspect})`,
      source: 'derived',
      parentAssetId: asset.id,
      projectId: asset.project_id,
      folderId: asset.folder_id,
      isAiGenerated: asset.is_ai_generated,
      licenseId: asset.license_id,
      tags: asset.tags,
      meta: { reframe: { from: `${W}x${H}`, aspect, subject, path: points, tracked: !!subject } },
    });
    return { assetId: created.id, tracked: !!subject };
  },
};
