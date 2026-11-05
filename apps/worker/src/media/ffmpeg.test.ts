import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ffmpegArgs } from './ffmpeg';

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
