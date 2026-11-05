/**
 * Beat tracking for music: spectral-flux onsets, tempo from the onset
 * autocorrelation, then the beat phase that best lines up with the onsets.
 */

const FFT_SIZE = 1024;
const HOP = 441; // 20 ms at 22.05 kHz

function fftMagnitudes(frame: Float32Array, re: Float64Array, im: Float64Array, window: Float64Array): Float64Array {
  const n = FFT_SIZE;
  for (let i = 0; i < n; i++) {
    re[i] = (frame[i] ?? 0) * window[i]!;
    im[i] = 0;
  }
  // Iterative radix-2 FFT.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  const mags = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mags[i] = Math.log1p(Math.hypot(re[i]!, im[i]!) * 10);
  return mags;
}

/** Onset strength per hop (spectral flux, half-wave rectified, normalised). */
export function onsetEnvelope(samples: Float32Array): Float64Array {
  const frames = Math.max(0, Math.floor((samples.length - FFT_SIZE) / HOP) + 1);
  const env = new Float64Array(frames);
  const window = new Float64Array(FFT_SIZE).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  let prev: Float64Array | null = null;
  for (let f = 0; f < frames; f++) {
    const mags = fftMagnitudes(samples.subarray(f * HOP, f * HOP + FFT_SIZE), re, im, window);
    if (prev) {
      let flux = 0;
      for (let k = 1; k < mags.length; k++) flux += Math.max(0, mags[k]! - prev[k]!);
      env[f] = flux;
    }
    prev = mags;
  }
  // Remove the slow trend and normalise.
  const w = 16;
  const out = new Float64Array(frames);
  let max = 0;
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(frames - 1, i + w); j++) {
      sum += env[j]!;
      count++;
    }
    out[i] = Math.max(0, env[i]! - sum / count);
    if (out[i]! > max) max = out[i]!;
  }
  if (max > 0) for (let i = 0; i < frames; i++) out[i] = out[i]! / max;
  return out;
}

export interface BeatResult {
  bpm: number | null;
  beats: number[];
  /** 0–1: how strongly the onsets follow the beat grid. */
  confidence: number;
}

export function trackBeats(samples: Float32Array, sampleRate: number): BeatResult {
  const env = onsetEnvelope(samples);
  const hopS = HOP / sampleRate;
  if (env.length < 200) return { bpm: null, beats: [], confidence: 0 };

  // Tempo: autocorrelation over 60–200 BPM, weighted towards ~120 BPM.
  const minLag = Math.round(60 / 200 / hopS);
  const maxLag = Math.round(60 / 60 / hopS);
  let bestLag = 0;
  let bestScore = -Infinity;
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = lag; i < env.length; i++) sum += env[i]! * env[i - lag]!;
    sum /= env.length - lag;
    const bpm = 60 / (lag * hopS);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const score = sum * prior;
    scores.push(score);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (!bestLag || bestScore <= 0) return { bpm: null, beats: [], confidence: 0 };
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Refine the period with parabolic interpolation around the best lag.
  const idx = bestLag - minLag;
  const y0 = scores[idx - 1] ?? bestScore;
  const y2 = scores[idx + 1] ?? bestScore;
  const shift = y0 + y2 - 2 * bestScore !== 0 ? (0.5 * (y0 - y2)) / (y0 + y2 - 2 * bestScore) : 0;
  const period = bestLag + Math.max(-0.5, Math.min(0.5, shift));

  // Phase: the offset whose grid collects the most onset energy.
  let bestPhase = 0;
  let bestPhaseScore = -Infinity;
  for (let phase = 0; phase < period; phase += 0.5) {
    let sum = 0;
    for (let t = phase; t < env.length; t += period) sum += env[Math.round(t)] ?? 0;
    if (sum > bestPhaseScore) {
      bestPhaseScore = sum;
      bestPhase = phase;
    }
  }

  // Snap each grid point to the strongest onset nearby, so beats follow tempo drift.
  const beats: number[] = [];
  const radius = Math.max(1, Math.round(period * 0.12));
  for (let t = bestPhase; t < env.length; t += period) {
    const c = Math.round(t);
    let best = c;
    let bestV = env[c] ?? 0;
    for (let j = c - radius; j <= c + radius; j++) {
      if ((env[j] ?? -1) > bestV) {
        bestV = env[j]!;
        best = j;
      }
    }
    beats.push(Math.round((best * hopS + (FFT_SIZE / 2) / sampleRate) * 1000) / 1000);
  }
  const bpm = Math.round((60 / (period * hopS)) * 10) / 10;
  const confidence = Math.max(0, Math.min(1, (bestScore - mean) / (bestScore || 1)));
  return { bpm, beats, confidence: Math.round(confidence * 100) / 100 };
}
