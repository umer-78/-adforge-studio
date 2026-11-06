import { describe, expect, it } from 'vitest';
import { checkAdPolicy, FlashDetector, loudnessReport, policyStatus, soundOffReport } from './checks';

const W = 32;
const H = 18;
function frame(color: [number, number, number], area = 1, base: [number, number, number] = [0, 0, 0]) {
  const f = new Uint8Array(W * H * 3);
  const cols = Math.round(W * area);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = x < cols ? color : base;
      f.set(c, (y * W + x) * 3);
    }
  return f;
}
function run(fps: number, seconds: number, period: number, a: Uint8Array, b: Uint8Array) {
  const d = new FlashDetector(W, H, fps);
  for (let i = 0; i < fps * seconds; i++) d.push(Math.floor(i / period) % 2 ? b : a);
  return d.result();
}

describe('flash detector', () => {
  const black = frame([0, 0, 0]);
  const white = frame([255, 255, 255]);
  it('fails full-screen strobing', () => {
    const r = run(30, 2, 1, black, white);
    expect(r.status).toBe('fail');
    expect(r.maxFlashesPerSecond).toBeGreaterThan(10);
    expect(r.ranges.length).toBeGreaterThan(0);
  });
  it('passes slow changes', () => {
    expect(run(30, 3, 10, black, white).status).toBe('pass');
  });
  it('fails just over three flashes a second', () => {
    expect(run(30, 3, 4, black, white).status).toBe('fail');
  });
  it('ignores flashing in a small area', () => {
    expect(run(30, 2, 1, black, frame([255, 255, 255], 0.1)).status).toBe('pass');
  });
  it('catches saturated red flashes with no luminance change', () => {
    const r = run(30, 2, 3, frame([255, 0, 0]), frame([128, 128, 128]));
    expect(r.maxFlashesPerSecond).toBe(0);
    expect(r.maxRedFlashesPerSecond).toBeGreaterThan(3);
    expect(r.status).toBe('fail');
  });
  it('ignores flicker between two bright states', () => {
    expect(run(30, 2, 1, frame([235, 235, 235]), white).status).toBe('pass');
  });
});

describe('ad policy wording', () => {
  it('flags risky copy', () => {
    const f = checkAdPolicy('Are you depressed? This miracle fix cures anxiety, guaranteed!!!');
    const ids = f.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['personal-attributes', 'miracle', 'health-claim', 'guaranteed', 'punctuation']));
    expect(policyStatus(f)).toBe('fail');
    expect(f[0]!.severity).toBe('high');
  });
  it('passes plain product copy', () => {
    const f = checkAdPolicy('Our new bottle keeps drinks cold for 24 hours. Free shipping this week.');
    expect(f).toEqual([]);
    expect(policyStatus(f)).toBe('pass');
  });
});

describe('loudness and sound off', () => {
  it('rates loudness against feeds', () => {
    expect(loudnessReport(-8).status).toBe('fail');
    expect(loudnessReport(-14.2, -2).status).toBe('pass');
    expect(loudnessReport(-23).status).toBe('warn');
    expect(loudnessReport(-14, -0.4).status).toBe('warn');
    expect(loudnessReport(null, null, false).status).toBe('none');
  });
  it('asks for captions when speech carries the ad', () => {
    const segments = [{ start: 0, end: 6 }, { start: 7, end: 12 }];
    expect(soundOffReport({ hasAudio: true, durationS: 15, segments, captions: null }).status).toBe('warn');
    expect(soundOffReport({ hasAudio: true, durationS: 15, segments, captions: true }).status).toBe('pass');
    expect(soundOffReport({ hasAudio: true, durationS: 60, segments: [{ start: 0, end: 2 }], captions: false }).status).toBe('pass');
    expect(soundOffReport({ hasAudio: true, durationS: 15, segments: null, captions: null }).status).toBe('none');
  });
});
