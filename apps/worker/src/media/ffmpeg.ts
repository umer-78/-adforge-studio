import { spawn } from 'node:child_process';
import path from 'node:path';
import { env } from '@adforge/core/server';
import { rgbToHex } from '@adforge/core';
import { JobAborted } from '../lib/errors';
import { cpuCount, mapLimit } from '../lib/util';

export interface RunOptions {
  signal?: AbortSignal;
  /** Called with seconds of output written so far. */
  onTime?: (seconds: number) => void;
  /** Collect stdout as a buffer (for raw PCM / pixels). */
  stdout?: boolean;
  timeoutMs?: number;
}

export interface RunResult {
  stdout: Buffer;
  stderr: string;
}

function spawnTool(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(opts.signal.reason ?? new JobAborted('canceled'));
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    let progressBuf = '';
    const progress = !!opts.onTime && !opts.stdout;
    child.stdout.on('data', (chunk: Buffer) => {
      if (opts.stdout) out.push(chunk);
      else if (progress) {
        progressBuf += chunk.toString();
        const lines = progressBuf.split('\n');
        progressBuf = lines.pop() ?? '';
        for (const line of lines) {
          const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
          if (m) opts.onTime!(Number(m[1]) / 1_000_000);
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    const onAbort = () => child.kill('SIGKILL');
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = opts.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs) : null;
    child.on('error', (e) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (timer) clearTimeout(timer);
      reject(new Error(`${path.basename(bin)} could not start: ${e.message}. Install FFmpeg or set FFMPEG_PATH/FFPROBE_PATH.`));
    });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (timer) clearTimeout(timer);
      if (opts.signal?.aborted) return reject(opts.signal.reason ?? new JobAborted('canceled'));
      if (code !== 0) {
        const tail = err.trim().split('\n').slice(-6).join('\n');
        return reject(new Error(`${path.basename(bin)} exited with ${code}: ${tail}`));
      }
      resolve({ stdout: Buffer.concat(out), stderr: err });
    });
  });
}

/**
 * The full argument list for one FFmpeg run. FFmpeg sizes its threads from every core it can see,
 * which in a container can be the whole host's, and each thread holds frames in memory, so threads
 * are sized from the CPUs this container may use: decoder threads before each input, encoder
 * threads before the output that every call ends with.
 */
export function ffmpegArgs(args: string[], progress: boolean, threads = Math.min(16, cpuCount())): string[] {
  const t = String(threads);
  const base = ['-hide_banner', '-nostdin', '-y', '-filter_threads', t, '-filter_complex_threads', t];
  const sized = args.flatMap((a, i) => (a === '-i' || i === args.length - 1 ? ['-threads', t, a] : [a]));
  return [...base, ...(progress ? ['-progress', 'pipe:1', '-nostats'] : []), ...sized];
}

export function ffmpeg(args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return spawnTool(env().FFMPEG_PATH, ffmpegArgs(args, !!opts.onTime && !opts.stdout), opts);
}

/* --------------------------------- Probing --------------------------------- */

export interface ProbeResult {
  formatName: string;
  durationS: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  rotation: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  /** A single still frame (image file or cover art only). */
  isStill: boolean;
}

interface FfprobeJson {
  format?: { format_name?: string; duration?: string; bit_rate?: string };
  streams?: {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    r_frame_rate?: string;
    duration?: string;
    nb_frames?: string;
    sample_rate?: string;
    channels?: number;
    tags?: Record<string, string>;
    side_data_list?: { rotation?: number }[];
    disposition?: { attached_pic?: number };
  }[];
}

const STILL_CODECS = new Set(['mjpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'jpegls', 'jpeg2000']);

function rate(value: string | undefined): number | null {
  if (!value) return null;
  const [n, d] = value.split('/').map(Number);
  if (!n || !d) return null;
  const r = n / d;
  return Number.isFinite(r) && r > 0 && r < 1000 ? Math.round(r * 1000) / 1000 : null;
}

export async function probe(input: string, signal?: AbortSignal): Promise<ProbeResult> {
  const { stdout } = await spawnTool(env().FFPROBE_PATH, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input], { signal, stdout: true, timeoutMs: 120_000 });
  const json = JSON.parse(stdout.toString('utf8') || '{}') as FfprobeJson;
  const streams = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const cover = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic);
  const audio = streams.find((s) => s.codec_type === 'audio');
  const rotationRaw = video?.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation ?? Number(video?.tags?.rotate ?? 0);
  const rotation = ((Math.round(rotationRaw) % 360) + 360) % 360;
  const swap = rotation === 90 || rotation === 270;
  const frames = Number(video?.nb_frames ?? 0);
  const isStill = !!video && (STILL_CODECS.has(video.codec_name ?? '') && (frames <= 1 || /image2|_pipe|png|webp/.test(json.format?.format_name ?? '')));
  const durationS = Number(json.format?.duration ?? video?.duration ?? audio?.duration ?? NaN);
  const source = video ?? (audio ? undefined : cover);
  const w = source?.width ?? null;
  const h = source?.height ?? null;
  return {
    formatName: json.format?.format_name ?? '',
    durationS: Number.isFinite(durationS) && !isStill ? Math.round(durationS * 1000) / 1000 : null,
    width: w && h ? (swap ? h : w) : null,
    height: w && h ? (swap ? w : h) : null,
    fps: video && !isStill ? (rate(video.avg_frame_rate) ?? rate(video.r_frame_rate)) : null,
    rotation,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    hasVideo: !!video && !isStill,
    hasAudio: !!audio,
    bitrate: json.format?.bit_rate ? Number(json.format.bit_rate) : null,
    sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : null,
    channels: audio?.channels ?? null,
    isStill,
  };
}

/* ------------------------------ Frames & images ----------------------------- */

/** One JPEG per timestamp, scaled to fit `size` px on the long side. */
export async function extractFrames(input: string, times: number[], outDir: string, size = 768, signal?: AbortSignal): Promise<{ t: number; file: string }[]> {
  return mapLimit(times, 4, async (t, i) => {
    const file = path.join(outDir, `frame-${String(i).padStart(3, '0')}.jpg`);
    await ffmpeg(
      ['-ss', Math.max(0, t).toFixed(3), '-i', input, '-frames:v', '1', '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease:force_divisible_by=2`, '-q:v', '4', file],
      { signal, timeoutMs: 60_000 },
    );
    return { t, file };
  });
}

/** Evenly spaced sample times, avoiding the very first and last frames. */
export function sampleTimes(durationS: number, count: number): number[] {
  if (!durationS || durationS <= 0) return [0];
  const n = Math.max(1, Math.min(count, Math.ceil(durationS * 2)));
  return Array.from({ length: n }, (_, i) => Math.min(durationS - 0.05, ((i + 0.5) / n) * durationS));
}

export async function thumbnail(input: string, out: string, opts: { at?: number; width?: number; signal?: AbortSignal } = {}) {
  const width = opts.width ?? 640;
  await ffmpeg(
    [...(opts.at ? ['-ss', opts.at.toFixed(3)] : []), '-i', input, '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-q:v', '3', out],
    { signal: opts.signal, timeoutMs: 120_000 },
  );
}

/**
 * An MP4 every platform takes: H.264 video (HEVC and H.264 are copied as they are) with AAC sound.
 * Clips made in a browser can be WebM, VP9, AV1 or Opus, which Instagram, TikTok and others refuse.
 */
export async function toPublishMp4(input: string, out: string, p: ProbeResult, signal?: AbortSignal) {
  const copy = p.videoCodec === 'h264' || p.videoCodec === 'hevc';
  await ffmpeg(
    [
      '-i', input,
      '-map', '0:v:0', ...(p.hasAudio ? ['-map', '0:a:0'] : []),
      ...(copy ? ['-c:v', 'copy', ...(p.videoCodec === 'hevc' ? ['-tag:v', 'hvc1'] : [])] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p']),
      ...(p.hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'] : ['-an']),
      '-movflags', '+faststart', out,
    ],
    { signal, timeoutMs: Math.max(10 * 60_000, (p.durationS ?? 0) * 4000) },
  );
}

/** Converts any still image to a JPEG (Instagram, ad platforms and LLM inputs prefer it). */
export async function toJpeg(input: string, out: string, maxSize = 4096, signal?: AbortSignal) {
  await ffmpeg(['-i', input, '-frames:v', '1', '-vf', `scale='min(${maxSize},iw)':'min(${maxSize},ih)':force_original_aspect_ratio=decrease,format=yuvj444p`, '-q:v', '2', out], { signal, timeoutMs: 120_000 });
}

/** Dominant colours of an image or frame as #RRGGBB, most common first. */
export async function dominantColors(input: string, count = 5, signal?: AbortSignal): Promise<string[]> {
  const { stdout } = await ffmpeg(['-i', input, '-frames:v', '1', '-vf', 'scale=48:48:force_original_aspect_ratio=decrease', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { signal, stdout: true, timeoutMs: 60_000 });
  const pixels: [number, number, number][] = [];
  for (let i = 0; i + 2 < stdout.length; i += 3) pixels.push([stdout[i]!, stdout[i + 1]!, stdout[i + 2]!]);
  return kMeansColors(pixels, count);
}

export function kMeansColors(pixels: [number, number, number][], k: number): string[] {
  if (!pixels.length) return [];
  const step = Math.max(1, Math.floor(pixels.length / k));
  let centers = Array.from({ length: k }, (_, i) => [...pixels[Math.min(pixels.length - 1, i * step)]!] as [number, number, number]);
  let counts = new Array<number>(k).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = new Array<number>(k).fill(0);
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, ci) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      });
      sums[best]![0]! += p[0];
      sums[best]![1]! += p[1];
      sums[best]![2]! += p[2];
      counts[best]!++;
    }
    centers = centers.map((c, ci) => (counts[ci] ? [sums[ci]![0]! / counts[ci]!, sums[ci]![1]! / counts[ci]!, sums[ci]![2]! / counts[ci]!] : c)) as [number, number, number][];
  }
  const ranked = centers.map((c, i) => ({ hex: rgbToHex(c[0], c[1], c[2]), n: counts[i]! })).filter((c) => c.n > 0);
  ranked.sort((a, b) => b.n - a.n);
  // Merge near-duplicates so the palette is useful.
  const out: string[] = [];
  for (const { hex } of ranked) {
    const rgb = hexToTriple(hex);
    if (out.every((o) => distance(hexToTriple(o), rgb) > 40)) out.push(hex);
  }
  return out;
}

const hexToTriple = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const distance = (a: number[], b: number[]) => Math.sqrt((a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2);

/* ---------------------------------- Audio ---------------------------------- */

/** Mono float PCM at the given rate. */
export async function pcm(input: string, sampleRate: number, signal?: AbortSignal, maxSeconds = 1800): Promise<Float32Array> {
  const { stdout } = await ffmpeg(['-i', input, '-t', String(maxSeconds), '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1'], { signal, stdout: true, timeoutMs: 600_000 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
}

export interface WaveformData {
  version: 1;
  sampleRate: number;
  samplesPerPeak: number;
  durationS: number;
  /** Max absolute amplitude per bucket, 0–1. */
  peaks: number[];
}

export async function waveform(input: string, signal?: AbortSignal): Promise<WaveformData> {
  const sampleRate = 8000;
  const samples = await pcm(input, sampleRate, signal);
  const durationS = samples.length / sampleRate;
  const maxPeaks = 8000;
  const samplesPerPeak = Math.max(40, Math.ceil(samples.length / maxPeaks));
  const peaks: number[] = [];
  for (let i = 0; i < samples.length; i += samplesPerPeak) {
    let max = 0;
    const end = Math.min(samples.length, i + samplesPerPeak);
    for (let j = i; j < end; j++) {
      const v = Math.abs(samples[j]!);
      if (v > max) max = v;
    }
    peaks.push(Math.round(Math.min(1, max) * 1000) / 1000);
  }
  return { version: 1, sampleRate, samplesPerPeak, durationS: Math.round(durationS * 1000) / 1000, peaks };
}

export interface LoudnessStats {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** First loudnorm pass: measures integrated loudness, true peak and range. */
export async function measureLoudness(input: string, targetLufs = -14, signal?: AbortSignal): Promise<LoudnessStats | null> {
  const { stderr } = await ffmpeg(['-i', input, '-vn', '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'], { signal, timeoutMs: 900_000 });
  const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
  try {
    const stats = JSON.parse(json) as LoudnessStats;
    return Number.isFinite(Number(stats.input_i)) ? stats : null;
  } catch {
    return null;
  }
}

/** Second loudnorm pass filter, linear when the measurement allows it. */
export function loudnormFilter(stats: LoudnessStats, targetLufs = -14): string {
  return `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true:print_format=summary`;
}

export async function detectSilences(input: string, thresholdDb = -35, minS = 0.4, signal?: AbortSignal): Promise<[number, number][]> {
  const { stderr } = await ffmpeg(['-i', input, '-vn', '-af', `silencedetect=n=${thresholdDb}dB:d=${minS}`, '-f', 'null', '-'], { signal, timeoutMs: 900_000 });
  const out: [number, number][] = [];
  let start: number | null = null;
  for (const line of stderr.split('\n')) {
    const s = /silence_start: (-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (e && start != null) {
      out.push([round3(start), round3(Number(e[1]))]);
      start = null;
    }
  }
  if (start != null) {
    const p = await probe(input, signal);
    if (p.durationS) out.push([round3(start), p.durationS]);
  }
  return out;
}

export async function detectScenes(input: string, threshold = 0.3, signal?: AbortSignal): Promise<number[]> {
  const { stderr } = await ffmpeg(['-i', input, '-an', '-vf', `scale=320:-2,select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], { signal, timeoutMs: 1_800_000 });
  const cuts: number[] = [];
  for (const line of stderr.split('\n')) {
    const m = /pts_time:([\d.]+)/.exec(line);
    if (m && line.includes('Parsed_showinfo')) cuts.push(round3(Number(m[1])));
  }
  return cuts.filter((t, i) => i === 0 || t - cuts[i - 1]! > 0.25);
}

/** Mono 16 kHz MP3, small enough for transcription APIs. */
export async function extractSpeechAudio(input: string, out: string, signal?: AbortSignal) {
  await ffmpeg(['-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', out], { signal, timeoutMs: 900_000 });
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Decodes the picture as small packed RGB frames and hands each one over as it arrives, so long
 * videos never sit in memory. Used by the flash check.
 */
export function streamFrames(input: string, opts: { width: number; height: number; fps: number; maxS?: number; signal?: AbortSignal; onFrame: (rgb: Uint8Array) => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(opts.signal.reason ?? new JobAborted('canceled'));
    const size = opts.width * opts.height * 3;
    const args = ['-hide_banner', '-v', 'error', ...(opts.maxS ? ['-t', String(opts.maxS)] : []), '-i', input, '-map', '0:v:0', '-an', '-vf', `fps=${opts.fps},scale=${opts.width}:${opts.height}:flags=area,format=rgb24`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'];
    const child = spawn(env().FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let pending: Buffer = Buffer.alloc(0);
    let err = '';
    let failed: Error | null = null;
    const abort = () => child.kill('SIGKILL');
    opts.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (failed) return;
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let off = 0;
      try {
        while (pending.length - off >= size) {
          opts.onFrame(pending.subarray(off, off + size));
          off += size;
        }
      } catch (e) {
        failed = e as Error;
        child.kill('SIGKILL');
      }
      pending = pending.subarray(off);
    });
    child.stderr.on('data', (c: Buffer) => {
      if (err.length < 4000) err += c.toString();
    });
    child.on('error', (e) => reject(new Error(`ffmpeg could not start: ${e.message}. Install FFmpeg or set FFMPEG_PATH.`)));
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', abort);
      if (opts.signal?.aborted) return reject(opts.signal.reason ?? new JobAborted('canceled'));
      if (failed) return reject(failed);
      if (code !== 0) return reject(new Error(`ffmpeg could not read the video: ${err.trim().slice(-400) || `exit ${code}`}`));
      resolve();
    });
  });
}
