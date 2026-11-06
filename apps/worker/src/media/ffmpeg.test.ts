import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FlashDetector } from '@adforge/core';
import { ffmpegArgs, probe, streamFrames, toPublishMp4 } from './ffmpeg';

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('ffmpegArgs', () => {
  it('sizes decoder threads before every input and encoder threads before the output', () => {
    const args = ffmpegArgs(['-ss', '2', '-i', 'a.mp4', '-i', 'b.wav', '-c:v', 'libx264', 'out.mp4'], false, 2);
    expect(args).toEqual(['-hide_banner', '-nostdin', '-y', '-filter_threads', '2', '-filter_complex_threads', '2', '-ss', '2', '-threads', '2', '-i', 'a.mp4', '-threads', '2', '-i', 'b.wav', '-c:v', 'libx264', '-threads', '2', 'out.mp4']);
  });

  it('adds progress output when asked', () => {
    const args = ffmpegArgs(['-i', 'in.mp4', '-f', 'null', '-'], true, 1);
    expect(args.slice(7, 10)).toEqual(['-progress', 'pipe:1', '-nostats']);
    expect(args.slice(-3)).toEqual(['-threads', '1', '-']);
  });

  it.skipIf(!hasFfmpeg)('produces arguments FFmpeg accepts', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ffargs-'));
    try {
      const out = path.join(dir, 'out.mp4');
      execFileSync('ffmpeg', ffmpegArgs(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=10:d=1', '-vf', 'scale=160:-2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out], false, 2), { stdio: 'pipe' });
      expect(statSync(out).size).toBeGreaterThan(0);
      execFileSync('ffmpeg', ffmpegArgs(['-f', 'lavfi', '-i', 'sine=d=1', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], false, 2), { stdio: 'pipe' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!hasFfmpeg)('toPublishMp4', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
  });

  it('turns a browser-made VP9 and Opus WebM into H.264 and AAC in an MP4', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'publish-'));
    try {
      const input = path.join(dir, 'clip.webm');
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=180x320:r=30:d=1', '-f', 'lavfi', '-i', 'sine=d=1', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-c:a', 'libopus', '-shortest', input], { stdio: 'pipe' });
      const out = path.join(dir, 'publish.mp4');
      await toPublishMp4(input, out, await probe(input));
      const p = await probe(out);
      expect(p.formatName).toContain('mp4');
      expect(p.videoCodec).toBe('h264');
      expect(p.audioCodec).toBe('aac');
      expect(p.width).toBe(180);
      expect(p.height).toBe(320);
      expect(p.durationS).toBeGreaterThan(0.9);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('copies H.264 video as it is and leaves out sound that is not there', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'publish-'));
    try {
      const input = path.join(dir, 'clip.mkv');
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=25:d=1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', input], { stdio: 'pipe' });
      const out = path.join(dir, 'publish.mp4');
      await toPublishMp4(input, out, await probe(input));
      const p = await probe(out);
      expect(p.videoCodec).toBe('h264');
      expect(p.hasAudio).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe.skipIf(!hasFfmpeg)('flash check on real video', () => {
  let dir = '';
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
    dir = mkdtempSync(path.join(os.tmpdir(), 'flash-'));
    // Full-screen black and white swapping every two frames: 7.5 flashes a second.
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=2', '-vf', "geq=lum='if(lt(mod(N,4),2),235,16)':cb=128:cr=128", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'strobe.mp4')]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'calm.mp4')]);
    return () => rmSync(dir, { recursive: true, force: true });
  });

  const scan = async (name: string) => {
    const d = new FlashDetector(64, 36, 30);
    await streamFrames(path.join(dir, name), { width: 64, height: 36, fps: 30, onFrame: (f) => d.push(f) });
    return d.result();
  };

  it('fails strobing and passes ordinary motion', async () => {
    const strobe = await scan('strobe.mp4');
    expect(strobe.frames).toBe(60);
    expect(strobe.status).toBe('fail');
    expect(strobe.maxFlashesPerSecond).toBeGreaterThan(5);
    const calm = await scan('calm.mp4');
    expect(calm.status).toBe('pass');
  });
});
