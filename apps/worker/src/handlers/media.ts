import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { asJson, parseWorkspaceSettings, type AssetMeta, type AssetRow, type Json, type PlaybackInfo, type Update } from '@adforge/core';
import { env, features, muxCreateAsset, providerKey } from '@adforge/core/server';
import { PermanentError } from '../lib/errors';
import { downloadAsset, loadAsset, putDerived, signedAssetUrl } from '../lib/files';
import { trackBeats } from '../media/beats';
import { detectScenes, detectSilences, dominantColors, ffmpeg, measureLoudness, pcm, probe, thumbnail, waveform, type ProbeResult } from '../media/ffmpeg';
import type { JobContext, JobHandler } from '../runner';

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Size that fits `short` on the shorter side without upscaling. */
function fitShortSide(w: number, h: number, short: number): { w: number; h: number } {
  const s = Math.min(1, short / Math.min(w, h));
  return { w: even(w * s), h: even(h * s) };
}

async function makeProxy(ctx: JobContext, input: string, p: ProbeResult, out: string, onPct: (pct: number) => void) {
  const { w, h } = fitShortSide(p.width ?? 1280, p.height ?? 720, 720);
  const fps = Math.round(p.fps ?? 30) || 30;
  await ffmpeg(
    [
      '-i', input,
      '-map', '0:v:0', ...(p.hasAudio ? ['-map', '0:a:0'] : []),
      '-vf', `scale=${w}:${h}:flags=bicubic,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-g', String(fps), '-keyint_min', String(fps), '-sc_threshold', '0',
      ...(p.hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an']),
      '-movflags', '+faststart', out,
    ],
    { signal: ctx.signal, onTime: (t) => p.durationS && onPct(Math.min(1, t / p.durationS)) },
  );
}

/** A short, silent hover preview stitched from three moments of the video. */
async function makePreview(ctx: JobContext, input: string, p: ProbeResult, out: string) {
  const d = p.durationS ?? 0;
  const { w, h } = fitShortSide(p.width ?? 640, p.height ?? 360, 270);
  const starts = d > 9 ? [0.12, 0.45, 0.78].map((f) => f * d) : [0];
  const len = d > 9 ? 2 : Math.min(d, 6);
  const parts = starts.map((s, i) => `[0:v]trim=start=${s.toFixed(2)}:duration=${len},setpts=PTS-STARTPTS,scale=${w}:${h},fps=24[p${i}]`);
  const graph = `${parts.join(';')};${starts.map((_, i) => `[p${i}]`).join('')}concat=n=${starts.length}:v=1:a=0,format=yuv420p[v]`;
  await ffmpeg(['-i', input, '-filter_complex', graph, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', out], { signal: ctx.signal });
}

/** Adaptive HLS (360p + 720p) for long videos when Mux is not configured. */
async function makeHls(ctx: JobContext, input: string, p: ProbeResult, dir: string) {
  const fps = Math.round(p.fps ?? 30) || 30;
  const gop = fps * 4;
  const low = fitShortSide(p.width ?? 1280, p.height ?? 720, 360);
  const high = fitShortSide(p.width ?? 1280, p.height ?? 720, 720);
  const audio = p.hasAudio;
  await ffmpeg(
    [
      '-i', input,
      '-filter_complex', `[0:v]split=2[a][b];[a]scale=${low.w}:${low.h},format=yuv420p[v0];[b]scale=${high.w}:${high.h},format=yuv420p[v1]`,
      '-map', '[v0]', ...(audio ? ['-map', '0:a:0'] : []),
      '-map', '[v1]', ...(audio ? ['-map', '0:a:0'] : []),
      '-c:v', 'libx264', '-preset', 'veryfast', '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
      '-b:v:0', '800k', '-maxrate:v:0', '900k', '-bufsize:v:0', '1600k',
      '-b:v:1', '2800k', '-maxrate:v:1', '3000k', '-bufsize:v:1', '5600k',
      ...(audio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : []),
      '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
      '-hls_segment_filename', path.join(dir, 'v%v', 'seg_%04d.ts'),
      '-master_pl_name', 'master.m3u8',
      '-var_stream_map', audio ? 'v:0,a:0 v:1,a:1' : 'v:0 v:1',
      path.join(dir, 'v%v', 'index.m3u8'),
    ],
    { signal: ctx.signal },
  );
}

async function uploadDir(asset: AssetRow, local: string, prefix: string): Promise<number> {
  let bytes = 0;
  const entries = await readdir(local, { withFileTypes: true, recursive: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    const full = path.join(e.parentPath, e.name);
    const rel = path.relative(local, full).split(path.sep).join('/');
    const type = e.name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
    bytes += (await putDerived(asset, `${prefix}/${rel}`, full, type)).bytes;
  }
  return bytes;
}

async function audioRole(ctx: JobContext, asset: AssetRow): Promise<AssetMeta['role'] | null> {
  const meta = asset.meta as AssetMeta;
  if (meta.role) return meta.role;
  const { data } = await ctx.sb.from('audio_tracks').select('kind').eq('asset_id', asset.id).maybeSingle();
  if (!data) return null;
  return data.kind === 'voiceover' || data.kind === 'recording' ? 'voice' : data.kind === 'music' ? 'music' : data.kind === 'sfx' ? 'sfx' : null;
}

export const mediaProcess: JobHandler<'media.process'> = {
  async run(ctx, { assetId }) {
    const asset = await loadAsset(ctx.sb, ctx.workspaceId, assetId);
    if (asset.deleted_at) return { skipped: 'deleted' };
    if (asset.status === 'uploading') throw new Error('The upload has not finished yet');
    if (asset.type === 'model3d') {
      await ctx.sb.from('assets').update({ status: 'ready', processing_error: null }).eq('id', asset.id);
      return { type: 'model3d' };
    }

    ctx.progress(3, 'Reading file');
    const file = await downloadAsset(ctx, asset);
    const dir = await ctx.tmp();
    let p: ProbeResult;
    try {
      p = await probe(file, ctx.signal);
    } catch {
      throw new PermanentError('This file could not be read. It may be damaged or use an unsupported codec.');
    }

    const meta: AssetMeta = { ...(asset.meta as AssetMeta) };
    const update: Update<'assets'> = {};
    let derived = 0;
    const put = async (name: string, local: string, type: string) => {
      const r = await putDerived(asset, name, local, type);
      derived += r.bytes;
      return r.key;
    };

    if (asset.type === 'video') {
      if (!p.hasVideo) throw new PermanentError('This file has no video track.');
      Object.assign(meta, { codec: p.videoCodec ?? undefined, audioCodec: p.audioCodec, bitrate: p.bitrate ?? undefined, hasAudio: p.hasAudio, rotation: p.rotation });
      Object.assign(update, { width: p.width, height: p.height, fps: p.fps, duration_s: p.durationS });

      ctx.progress(8, 'Creating thumbnail');
      const thumb = path.join(dir, 'thumb.jpg');
      await thumbnail(file, thumb, { at: Math.min(1, (p.durationS ?? 0) * 0.1), width: 960, signal: ctx.signal });
      update.thumbnail_key = await put('thumb.jpg', thumb, 'image/jpeg');
      meta.colors = await dominantColors(thumb, 5, ctx.signal).catch(() => meta.colors ?? []);

      ctx.progress(12, 'Creating editing proxy');
      const proxy = path.join(dir, 'proxy.mp4');
      await makeProxy(ctx, file, p, proxy, (f) => ctx.progress(12 + f * 48, 'Creating editing proxy'));
      update.proxy_key = await put('proxy.mp4', proxy, 'video/mp4');

      ctx.progress(62, 'Creating preview');
      const preview = path.join(dir, 'preview.mp4');
      await makePreview(ctx, file, p, preview);
      update.preview_key = await put('preview.mp4', preview, 'video/mp4');

      if (p.hasAudio) {
        ctx.progress(70, 'Measuring audio');
        const wave = await waveform(file, ctx.signal);
        const waveFile = path.join(dir, 'waveform.json');
        await writeFile(waveFile, JSON.stringify(wave));
        update.waveform_key = await put('waveform.json', waveFile, 'application/json');
        const loud = await measureLoudness(file, -14, ctx.signal).catch(() => null);
        if (loud) meta.loudnessLufs = Number(loud.input_i);
      }

      ctx.progress(80, 'Preparing streaming');
      const playback: PlaybackInfo = { provider: 'file' };
      if (features().mux) {
        const url = await signedAssetUrl(asset, 6 * 3600);
        const mux = await muxCreateAsset(url, asset.id);
        Object.assign(playback, { provider: 'mux', muxAssetId: mux.id, muxStatus: mux.status, policy: features().muxSigned ? 'signed' : 'public' });
      } else if ((p.durationS ?? 0) > 30) {
        const hlsDir = path.join(dir, 'hls');
        await makeHls(ctx, file, p, hlsDir);
        derived += await uploadDir(asset, hlsDir, 'hls');
        update.hls_key = `${asset.workspace_id}/${asset.id}/derived/hls/master.m3u8`;
        Object.assign(playback, { provider: 'hls', hlsKey: update.hls_key });
      }
      update.playback = asJson(playback);
    } else if (asset.type === 'image') {
      Object.assign(update, { width: p.width, height: p.height });
      const thumb = path.join(dir, 'thumb.jpg');
      await thumbnail(file, thumb, { width: 640, signal: ctx.signal });
      update.thumbnail_key = await put('thumb.jpg', thumb, 'image/jpeg');
      if ((p.width ?? 0) > 2048 || (p.height ?? 0) > 2048 || asset.size_bytes > 4 * 1024 ** 2) {
        const preview = path.join(dir, 'preview.jpg');
        await thumbnail(file, preview, { width: 2048, signal: ctx.signal });
        update.preview_key = await put('preview.jpg', preview, 'image/jpeg');
      }
      meta.colors = await dominantColors(file, 6, ctx.signal).catch(() => meta.colors ?? []);
    } else if (asset.type === 'audio') {
      if (!p.hasAudio) throw new PermanentError('This file has no audio.');
      Object.assign(meta, { codec: p.audioCodec ?? undefined, bitrate: p.bitrate ?? undefined, hasAudio: true, sampleRate: p.sampleRate, channels: p.channels });
      update.duration_s = p.durationS;
      ctx.progress(20, 'Drawing waveform');
      const wave = await waveform(file, ctx.signal);
      const waveFile = path.join(dir, 'waveform.json');
      await writeFile(waveFile, JSON.stringify(wave));
      update.waveform_key = await put('waveform.json', waveFile, 'application/json');
      ctx.progress(50, 'Measuring loudness');
      const loud = await measureLoudness(file, -14, ctx.signal).catch(() => null);
      if (loud) meta.loudnessLufs = Number(loud.input_i);
      const role = await audioRole(ctx, asset);
      if (role === 'music' && (p.durationS ?? 0) >= 6) {
        ctx.progress(70, 'Finding beats');
        const beats = trackBeats(await pcm(file, 22050, ctx.signal, 600), 22050);
        Object.assign(meta, { beats: beats.beats, bpm: beats.bpm ?? undefined });
        await ctx.sb.from('audio_tracks').update({ bpm: beats.bpm, beats: beats.beats as Json, loudness_lufs: meta.loudnessLufs ?? null }).eq('asset_id', asset.id);
      } else if (meta.loudnessLufs != null) {
        await ctx.sb.from('audio_tracks').update({ loudness_lufs: meta.loudnessLufs }).eq('asset_id', asset.id);
      }
    }

    update.meta = asJson(meta);
    update.derived_bytes = derived;
    update.status = 'ready';
    update.processing_error = null;
    const { error } = await ctx.sb.from('assets').update(update).eq('id', asset.id);
    if (error) throw new Error(`Could not save processing results: ${error.message}`);

    await queueAutoAnalysis(ctx, asset, p);
    // Flash, loudness and sound-off checks run on every ad-length video.
    if (asset.type === 'video' && (p.durationS ?? 0) <= 300) await ctx.enqueue('media.check', { assetId: asset.id }, { idempotencyKey: `media.check:${asset.id}:v${asset.version}`, priority: -1 });
    return { type: asset.type, durationS: p.durationS, width: p.width, height: p.height };
  },

  async onFailure(ctx, { assetId }, message) {
    await ctx.sb.from('assets').update({ status: 'failed', processing_error: message }).eq('id', assetId);
  },
};

/** Tags, transcript and search embedding for new uploads, when the workspace allows it. */
async function queueAutoAnalysis(ctx: JobContext, asset: AssetRow, p: ProbeResult) {
  if (!env().AUTO_ANALYZE || asset.source === 'render') return;
  const { data: ws } = await ctx.sb.from('workspaces').select('settings').eq('id', asset.workspace_id).single();
  const settings = parseWorkspaceSettings(ws?.settings);
  if (!settings.autoAnalyze) return;
  const [claude, openai, eleven] = await Promise.all([
    providerKey(asset.workspace_id, 'anthropic'),
    providerKey(asset.workspace_id, 'openai'),
    providerKey(asset.workspace_id, 'elevenlabs'),
  ]);
  const steps: ('transcribe' | 'tags' | 'embed')[] = [];
  const speechLike = (asset.type === 'video' && p.hasAudio) || asset.type === 'audio';
  if (settings.autoTranscribe && speechLike && (openai || eleven) && (p.durationS ?? 0) <= 3600) steps.push('transcribe');
  if (claude && (asset.type === 'video' || asset.type === 'image')) steps.push('tags');
  if (openai) steps.push('embed');
  if (!steps.length) return;
  await ctx.enqueue('media.analyze', { assetId: asset.id, steps }, { idempotencyKey: `media.analyze:${asset.id}:auto`, priority: -1 });
}

export const mediaDetect: JobHandler<'media.detect'> = {
  async run(ctx, { assetId, kind, thresholdDb, minSilenceS }) {
    const asset = await loadAsset(ctx.sb, ctx.workspaceId, assetId);
    if (asset.type !== 'video' && asset.type !== 'audio') throw new PermanentError('Detection works on video and audio files.');
    ctx.progress(5, 'Reading file');
    const file = await downloadAsset(ctx, asset);
    const meta = { ...(asset.meta as AssetMeta) };
    let count = 0;
    if (kind === 'silence') {
      ctx.progress(30, 'Finding silences');
      meta.silences = await detectSilences(file, thresholdDb ?? -35, minSilenceS ?? 0.4, ctx.signal);
      count = meta.silences.length;
    } else if (kind === 'scenes') {
      if (asset.type !== 'video') throw new PermanentError('Scene detection needs a video.');
      ctx.progress(30, 'Finding cuts');
      meta.scenes = await detectScenes(file, 0.3, ctx.signal);
      count = meta.scenes.length;
    } else {
      ctx.progress(30, 'Finding beats');
      const res = trackBeats(await pcm(file, 22050, ctx.signal, 900), 22050);
      if (!res.beats.length) throw new PermanentError('No steady beat was found in this audio.');
      meta.beats = res.beats;
      meta.bpm = res.bpm ?? undefined;
      count = res.beats.length;
      await ctx.sb.from('audio_tracks').update({ bpm: res.bpm, beats: res.beats as Json }).eq('asset_id', asset.id);
    }
    await ctx.sb.from('assets').update({ meta: asJson(meta) }).eq('id', asset.id);
    return { kind, count };
  },
};

