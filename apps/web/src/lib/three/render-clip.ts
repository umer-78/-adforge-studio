'use client';

import { advance, type RootState } from '@react-three/fiber';
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  UrlSource,
  WebMOutputFormat,
  type AudioSample,
  type WrappedCanvas,
} from 'mediabunny';
import * as THREE from 'three';
import { canvasBlob, recorderMime } from '@/lib/canvas';

/**
 * Turns a react-three-fiber canvas into video files and stills. Frames are rendered one at a time
 * at the export size, so clips come out smooth whatever the device, and anything driven by the
 * scene clock (camera moves, turntables, video on a screen) lands on exact frame times.
 */

export interface ClipSize {
  width: number;
  height: number;
}

/** Switches the canvas to hand-driven frames at the given size; returns how to switch back. */
function takeOver(get: () => RootState, size: ClipSize): () => void {
  const state = get();
  const prev = { frameloop: state.frameloop, dpr: state.viewport.dpr, size: { ...state.size } };
  const camera = state.camera as THREE.PerspectiveCamera;
  state.setFrameloop('never');
  state.gl.setPixelRatio(1);
  state.gl.setSize(size.width, size.height, false);
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  return () => {
    // The store still holds the on-screen size, so its setters would see no change: reset by hand.
    const now = get();
    const cam = now.camera as THREE.PerspectiveCamera;
    now.gl.setPixelRatio(prev.dpr);
    now.gl.setSize(prev.size.width, prev.size.height, false);
    cam.aspect = prev.size.width / prev.size.height;
    cam.updateProjectionMatrix();
    now.setFrameloop(prev.frameloop);
    // Hand-set clock times would otherwise turn into one huge frame delta.
    now.clock.start();
  };
}

/** A sound track laid under a rendered clip. */
export interface ClipAudio {
  /** Adds the track to the output before encoding starts; false when it cannot be included. */
  attach(output: Output, container: 'mp4' | 'webm'): Promise<boolean>;
  /** Encodes everything that starts before `until` seconds. */
  feed(until: number): Promise<void>;
  close(): Promise<void>;
}

export async function renderCanvasClip({
  get,
  size,
  lengthS,
  fps = 30,
  name,
  beforeFrame,
  audio,
  onProgress,
}: {
  get: () => RootState;
  size: ClipSize;
  lengthS: number;
  fps?: number;
  /** File name without the extension. */
  name: string;
  /** Prepares anything the frame at `t` seconds needs, such as the matching video frame. */
  beforeFrame?: (t: number) => Promise<void>;
  audio?: ClipAudio;
  onProgress: (pct: number) => void;
}): Promise<File> {
  const state = get();
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width: size.width, height: size.height });
  if (!codec) throw new Error('This browser cannot encode video. Use a recent Chrome, Edge, Safari or Firefox.');
  const mp4 = codec === 'avc';
  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const video = new CanvasSource(state.gl.domElement, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });
  const withAudio = audio ? await audio.attach(output, mp4 ? 'mp4' : 'webm').catch(() => false) : false;

  const restore = takeOver(get, size);
  state.clock.elapsedTime = 0;
  try {
    await output.start();
    const frames = Math.round(lengthS * fps);
    for (let i = 0; i < frames; i++) {
      const t = i / fps;
      await beforeFrame?.(t);
      if (withAudio) await audio!.feed(t + 1 / fps);
      advance(t, true, get());
      await video.add(t, 1 / fps);
      if (i % 5 === 0) onProgress((i / frames) * 100);
    }
    if (withAudio) await audio!.feed(lengthS);
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  } finally {
    restore();
    await audio?.close().catch(() => undefined);
  }
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('The clip came out empty.');
  const type = mp4 ? 'video/mp4' : 'video/webm';
  return new File([buffer], `${name}.${mp4 ? 'mp4' : 'webm'}`, { type });
}

/**
 * Fallback for browsers without WebCodecs: records the live canvas in real time. `start` resets
 * whatever the clip shows to its first frame.
 */
export function recordCanvasClip(get: () => RootState, lengthS: number, name: string, start: () => void, onProgress: (pct: number) => void): Promise<File> {
  const fmt = recorderMime();
  if (!fmt) return Promise.reject(new Error('This browser cannot record video. Try Chrome, Edge or Safari.'));
  const state = get();
  const stream = state.gl.domElement.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 16_000_000 });
  const chunks: Blob[] = [];
  return new Promise((resolve, reject) => {
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onerror = () => reject(new Error('Recording failed.'));
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = fmt.mime.split(';')[0]!;
      resolve(new File([new Blob(chunks, { type })], `${name}.${fmt.ext}`, { type }));
    };
    const began = performance.now();
    state.clock.start();
    start();
    rec.start(250);
    const tick = () => {
      const t = (performance.now() - began) / 1000;
      onProgress(Math.min(100, (t / lengthS) * 100));
      if (t < lengthS) requestAnimationFrame(tick);
      else rec.stop();
    };
    requestAnimationFrame(tick);
  });
}

/** One frame at the export size, as a PNG. */
export async function renderCanvasStill(get: () => RootState, size: ClipSize): Promise<Blob> {
  const state = get();
  const restore = takeOver(get, size);
  try {
    advance(state.clock.elapsedTime, true, get());
    return await canvasBlob(state.gl.domElement, 'image/png');
  } finally {
    restore();
  }
}

/* ------------------------------- Video input ------------------------------ */

/** Exact frames of a video, by time, for a texture inside a rendered clip. Loops past the end. */
export interface VideoFrames {
  texture: THREE.CanvasTexture<HTMLCanvasElement | OffscreenCanvas>;
  /** Width over height. */
  aspect: number;
  seek(t: number): Promise<void>;
  close(): Promise<void>;
}

export async function openVideoFrames(url: string, maxWidth = 1280): Promise<VideoFrames> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('This file has no video to show.');
  if (!(await track.canDecode())) throw new Error('This browser cannot decode this video. Try Chrome or Edge.');
  const duration = await track.computeDuration();
  const sink = new CanvasSink(track, { width: Math.min(maxWidth, track.displayWidth), poolSize: 3 });
  const texture = new THREE.CanvasTexture<HTMLCanvasElement | OffscreenCanvas>(document.createElement('canvas'));
  texture.colorSpace = THREE.SRGBColorSpace;

  let frames: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;
  let current: WrappedCanvas | null = null;
  let next: WrappedCanvas | null = null;
  let last = -1;
  const rewind = async () => {
    await frames?.return(undefined);
    frames = sink.canvases(0);
    current = (await frames.next()).value ?? null;
    next = (await frames.next()).value ?? null;
  };
  await rewind();

  return {
    texture,
    aspect: track.displayWidth / track.displayHeight,
    async seek(t) {
      const local = duration > 0 ? t % duration : 0;
      if (local < last) await rewind();
      last = local;
      while (next && next.timestamp <= local + 1e-4) {
        current = next;
        next = (await frames!.next()).value ?? null;
      }
      if (current) {
        texture.image = current.canvas;
        texture.needsUpdate = true;
      }
    },
    async close() {
      await frames?.return(undefined);
      texture.dispose();
      input.dispose();
    },
  };
}

/** The sound of a video, looped to fill the clip. */
export function videoAudio(url: string, lengthS: number): ClipAudio {
  let input: Input | null = null;
  let sink: AudioSampleSink | null = null;
  let target: AudioSampleSource | null = null;
  let samples: AsyncGenerator<AudioSample, void, unknown> | null = null;
  let pending: AudioSample | null = null;
  let duration = 0;
  let offset = 0;
  let done = false;
  return {
    async attach(output, container) {
      input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) return false;
      const codec = await getFirstEncodableAudioCodec([container === 'mp4' ? 'aac' : 'opus'], { numberOfChannels: track.numberOfChannels, sampleRate: track.sampleRate });
      duration = await track.computeDuration();
      if (!codec || !(duration > 0)) return false;
      target = new AudioSampleSource({ codec, quality: QUALITY_HIGH });
      output.addAudioTrack(target);
      sink = new AudioSampleSink(track);
      samples = sink.samples(0, duration);
      return true;
    },
    async feed(until) {
      while (!done && sink && samples && target) {
        if (!pending) {
          const step = await samples.next();
          if (step.done) {
            offset += duration;
            if (offset >= lengthS) {
              done = true;
              break;
            }
            samples = sink.samples(0, duration);
            continue;
          }
          pending = step.value;
          pending.setTimestamp(pending.timestamp + offset);
        }
        if (pending.timestamp >= lengthS) {
          pending.close();
          pending = null;
          done = true;
          break;
        }
        if (pending.timestamp >= until) break;
        await target.add(pending);
        pending.close();
        pending = null;
      }
    },
    async close() {
      pending?.close();
      await samples?.return(undefined);
      input?.dispose();
    },
  };
}
