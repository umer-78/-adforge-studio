import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PACK_ASPECTS, PACK_SIZES, reframeSchema, SYSTEM_PROMPTS, type AssetRow, type PackAspect, type SizeMode } from '@adforge/core';
import { PermanentError } from '../lib/errors';
import { createAssetFromFile, downloadAsset, loadAsset } from '../lib/files';
import { frameInputs, llmAvailable, runLlm } from '../lib/llm';
import { detectScenes, extractFrames, ffmpeg, probe, sampleTimes, type ProbeResult } from '../media/ffmpeg';
import type { JobContext, JobHandler } from '../runner';

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

/** Crop and output sizes for cutting `aspect` out of a W×H source; `horizontal` when the crop pans left and right. */
export function cropBox(W: number, H: number, aspect: PackAspect) {
  const target = PACK_SIZES[aspect];
  const r = target.width / target.height;
  const horizontal = W / H > r;
  const cropW = horizontal ? even(H * r) : W;
  const cropH = horizontal ? H : even(W / r);
  const outW = even(Math.min(target.width, cropW));
  return { horizontal, cropW, cropH, outW, outH: even(outW / r) };
}

export const sameAspect = (W: number, H: number, aspect: PackAspect) => Math.abs(W / H - PACK_SIZES[aspect].width / PACK_SIZES[aspect].height) < 0.01;

/** The whole frame scaled to fit, centred on a blurred, darkened fill of itself, so nothing is cut off. */
export function fitFilter(width: number, height: number, pixFmt: string): string {
  const sw = even(width / 8);
  const sh = even(height / 8);
  return [
    '[0:v]split=2[bg][fg]',
    `[bg]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh},gblur=sigma=6,colorchannelmixer=rr=0.8:gg=0.8:bb=0.8,scale=${width}:${height}:flags=bicubic[b]`,
    `[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos[f]`,
    `[b][f]overlay=(W-w)/2:(H-h)/2,setsar=1,format=${pixFmt}[v]`,
  ].join(';');
}

interface Tracking {
  samples: { t: number; cx: number; cy: number; confidence: number }[];
  subject: string | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Where the subject is at each sample time (0–1 of the frame), from Claude when a key is set, else the centre. */
async function trackSubject(ctx: JobContext, asset: AssetRow, file: string, times: number[], W: number, H: number, aspects: PackAspect[]): Promise<Tracking> {
  const centre = { samples: times.map((t) => ({ t, cx: 0.5, cy: 0.5, confidence: 1 })), subject: null };
  if (!(await llmAvailable(ctx))) {
    ctx.log.info('no Claude key; using a centre crop');
    return centre;
  }
  const dir = path.join(await ctx.tmp(), 'reframe');
  await mkdir(dir, { recursive: true });
  const frames = await extractFrames(file, times, dir, 384, ctx.signal);
  const images = (await frameInputs(frames)).map((f, i) => ({ ...f, label: `Frame index ${i} (t=${times[i]!.toFixed(2)}s):` }));
  const { data } = await runLlm(ctx, {
    task: 'reframe',
    schema: reframeSchema,
    system: SYSTEM_PROMPTS.reframe,
    prompt: `Reframing from ${W}×${H} to ${aspects.join(', ')}. Give the subject centre for every frame index 0–${frames.length - 1}.`,
    images,
    meta: { assetId: asset.id, aspects },
  });
  const byIndex = new Map(data.samples.map((s) => [Math.round(s.index), s]));
  return {
    subject: data.subject,
    samples: times.map((t, i) => {
      const s = byIndex.get(i);
      return s ? { t, cx: clamp01(s.cx), cy: clamp01(s.cy), confidence: clamp01(s.confidence) } : { t, cx: 0.5, cy: 0.5, confidence: 0 };
    }),
  };
}

interface Source {
  asset: AssetRow;
  file: string;
  p: ProbeResult;
  W: number;
  H: number;
  duration: number;
  video: boolean;
}

/** Renders one size to a local file. */
async function renderSize(ctx: JobContext, src: Source, aspect: PackAspect, mode: SizeMode, tracking: Tracking, cuts: number[], onProgress: (fraction: number) => void) {
  const { file, p, W, H, duration, video } = src;
  const from = `${W}x${H}`;
  const png = !video && src.asset.mime_type === 'image/png';
  const ext = video ? 'mp4' : png ? 'png' : 'jpg';
  const out = path.join(await ctx.tmp(), `size-${aspect.replace(':', 'x')}-${mode}.${ext}`);
  const pix = video ? 'yuv420p' : png ? 'rgb24' : 'yuvj444p';
  const still = png ? ['-frames:v', '1'] : ['-frames:v', '1', '-q:v', '2'];
  const encode = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart'];
  const onTime = video ? (t: number) => onProgress(Math.min(1, t / Math.max(0.1, duration))) : undefined;
  let meta: Record<string, unknown>;

  if (mode === 'fit') {
    const t = PACK_SIZES[aspect];
    const audio = video && p.hasAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k'] : ['-an'];
    await ffmpeg(['-i', file, '-filter_complex', fitFilter(t.width, t.height, pix), '-map', '[v]', ...(video ? [...audio, ...encode] : still), out], { signal: ctx.signal, onTime });
    meta = { size: { aspect, mode, from } };
  } else {
    const { horizontal, cropW, cropH, outW, outH } = cropBox(W, H, aspect);
    const sourceSize = horizontal ? W : H;
    const cropSize = horizontal ? cropW : cropH;
    const samples = tracking.samples.map((s) => ({ t: s.t, c: (horizontal ? s.cx : s.cy) * sourceSize, confidence: s.confidence }));
    const points = cameraPath(samples, cropSize, sourceSize, cuts, sourceSize * 0.3);
    const tracked = !!tracking.subject;
    if (video) {
      const expr = pathExpression(points);
      const crop = horizontal ? `crop=${cropW}:${cropH}:x='${expr}':y=0` : `crop=${cropW}:${cropH}:x=0:y='${expr}'`;
      const audio = p.hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an'];
      await ffmpeg(['-i', file, '-vf', `${crop},scale=${outW}:${outH}:flags=lanczos,setsar=1,format=yuv420p`, ...encode, ...audio, out], { signal: ctx.signal, onTime });
      meta = { size: { aspect, mode, from, tracked }, reframe: { from, aspect, subject: tracking.subject, path: points, tracked } };
    } else {
      const offset = points[0]?.offset ?? 0;
      const [x, y] = horizontal ? [offset, 0] : [0, offset];
      await ffmpeg(['-i', file, '-vf', `crop=${cropW}:${cropH}:${x}:${y},scale=${outW}:${outH}:flags=lanczos,format=${pix}`, ...still, out], { signal: ctx.signal, timeoutMs: 120_000 });
      meta = { size: { aspect, mode, from, tracked, subject: tracking.subject } };
    }
  }
  return { out, mime: video ? 'video/mp4' : png ? 'image/png' : 'image/jpeg', meta };
}

export type SizeItem = {
  aspect: PackAspect;
  assetId: string;
  /** The file itself already has this shape. */
  original?: boolean;
};

/** Makes a copy of a video or photo in each shape: following the subject, or fitted whole on a blurred fill. */
async function makeSizes(ctx: JobContext, assetId: string, aspects: PackAspect[], mode: SizeMode, opts: { videoOnly?: boolean } = {}) {
  const asset = await loadAsset(ctx.sb, ctx.workspaceId, assetId);
  if (opts.videoOnly && asset.type !== 'video') throw new PermanentError('Auto-reframe works on videos.');
  if (asset.type !== 'video' && asset.type !== 'image') throw new PermanentError('Sizes can be made from videos and photos.');
  if (asset.mime_type === 'image/gif') throw new PermanentError('Animated GIFs are not supported here. Turn the GIF into a video first.');
  ctx.progress(4, 'Reading the file');
  const file = await downloadAsset(ctx, asset);
  const p = await probe(file, ctx.signal);
  const video = asset.type === 'video';
  const W = p.width ?? asset.width ?? 0;
  const H = p.height ?? asset.height ?? 0;
  const duration = video ? (p.durationS ?? asset.duration_s ?? 0) : 0;
  if (!W || !H || (video && !duration)) throw new PermanentError('Could not read the file size.');

  const items: SizeItem[] = [];
  const todo: PackAspect[] = [];
  for (const a of PACK_ASPECTS.filter((r) => aspects.includes(r))) {
    if (sameAspect(W, H, a)) items.push({ aspect: a, assetId: asset.id, original: true });
    else todo.push(a);
  }
  let tracking: Tracking = { samples: [{ t: 0, cx: 0.5, cy: 0.5, confidence: 1 }], subject: null };
  let cuts: number[] = [];
  if (todo.length && mode === 'smart') {
    if (video) {
      ctx.progress(8, 'Finding cuts');
      cuts = await detectScenes(file, 0.35, ctx.signal).catch(() => []);
    }
    ctx.progress(15, 'Finding the subject');
    const times = video ? sampleTimes(duration, Math.max(4, Math.min(48, Math.round(duration * 2)))) : [0];
    tracking = await trackSubject(ctx, asset, file, times, W, H, todo);
  }

  const start = mode === 'smart' ? 30 : 10;
  const span = 88 - start;
  const src: Source = { asset, file, p, W, H, duration, video };
  for (const [i, aspect] of todo.entries()) {
    const at = start + (span * i) / todo.length;
    const label = `Making ${aspect}`;
    ctx.progress(at, label);
    const made = await renderSize(ctx, src, aspect, mode, tracking, cuts, (f) => ctx.progress(at + (span / todo.length) * f, label));
    const created = await createAssetFromFile(ctx, {
      workspaceId: asset.workspace_id,
      filePath: made.out,
      mime: made.mime,
      name: `${asset.name} (${aspect})`,
      source: 'derived',
      parentAssetId: asset.id,
      projectId: asset.project_id,
      folderId: asset.folder_id,
      isAiGenerated: asset.is_ai_generated,
      licenseId: asset.license_id,
      tags: asset.tags,
      meta: made.meta,
    });
    items.push({ aspect, assetId: created.id });
  }
  ctx.progress(95, 'Saving');
  items.sort((a, b) => PACK_ASPECTS.indexOf(a.aspect) - PACK_ASPECTS.indexOf(b.aspect));
  return { items, tracked: !!tracking.subject };
}

export const mediaReframe: JobHandler<'media.reframe'> = {
  async run(ctx, { assetId, aspect }) {
    const { items, tracked } = await makeSizes(ctx, assetId, [aspect], 'smart', { videoOnly: true });
    const item = items[0];
    if (!item || item.original) throw new PermanentError(`This video is already ${aspect}.`);
    return { assetId: item.assetId, tracked };
  },
};

export const mediaSizes: JobHandler<'media.sizes'> = {
  async run(ctx, { assetId, aspects, mode }) {
    const { items, tracked } = await makeSizes(ctx, assetId, aspects, mode);
    return { items, tracked, made: items.filter((i) => !i.original).length };
  },
};
