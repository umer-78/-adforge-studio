import { buildTimeMap, needsTimeRemap, sourceTimeAt, type AudioClip, type VideoClip } from '@adforge/core';
import { ffmpeg } from './ffmpeg';

const DENOISE = 'highpass=f=70,afftdn=nr=14:nf=-32:tn=1,lowpass=f=15500';
const FORMAT = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';

/** atempo accepts 0.5–2 per stage reliably, so larger changes are chained. */
export function atempoChain(rate: number): string[] {
  const parts: string[] = [];
  let r = rate;
  while (r > 2) {
    parts.push('atempo=2.0');
    r /= 2;
  }
  while (r < 0.5) {
    parts.push('atempo=0.5');
    r /= 0.5;
  }
  if (Math.abs(r - 1) > 1e-3) parts.push(`atempo=${r.toFixed(5)}`);
  return parts;
}

/** EQ, dynamics, noise reduction and pan from the clip's audio settings. */
export function clipFxChain(clip: AudioClip | VideoClip): string[] {
  const a = clip.audio;
  const fx: string[] = [];
  if (a.denoise) fx.push(DENOISE);
  if (a.eq.low) fx.push(`bass=g=${a.eq.low}:f=120:w=0.7`);
  if (a.eq.mid) fx.push(`equalizer=f=1000:t=q:w=1:g=${a.eq.mid}`);
  if (a.eq.high) fx.push(`treble=g=${a.eq.high}:f=8000:w=0.7`);
  if (a.compressor) fx.push('acompressor=threshold=-18dB:ratio=3:attack=10:release=200:makeup=2');
  if (a.pan) {
    // Constant-power pan; both channels stay at unity in the centre.
    const angle = ((a.pan + 1) * Math.PI) / 4;
    const l = (Math.cos(angle) * Math.SQRT2).toFixed(4);
    const r = (Math.sin(angle) * Math.SQRT2).toFixed(4);
    fx.push(FORMAT, `pan=stereo|c0=${l}*c0|c1=${r}*c1`);
  }
  return fx;
}

export function needsAudioOverride(clip: AudioClip | VideoClip): boolean {
  if (clip.audio.muted) return false;
  if (clip.type === 'video' && clip.freezeAt != null) return false; // a held frame is silent
  return needsTimeRemap(clip) || clipFxChain(clip).length > 0;
}

/**
 * Writes the clip's audio exactly as it should sound from the clip's first frame:
 * trimmed, retimed (speed, ramps, reverse) and filtered. Volume, fades and ducking
 * stay with the renderer.
 */
export async function renderClipAudio(clip: AudioClip | VideoClip, input: string, fps: number, out: string, signal?: AbortSignal) {
  const durationS = clip.duration / fps;
  const fx = clipFxChain(clip);
  const tail = [...fx, FORMAT, `apad=whole_dur=${durationS.toFixed(4)}`, `atrim=0:${durationS.toFixed(4)}`].join(',');
  let graph: string;

  if (clip.type === 'video' && (clip.reverse || clip.speedRamp.length)) {
    // Split into short pieces of constant speed, following the same time map as the picture.
    const map = clip.speedRamp.length ? buildTimeMap(clip, fps) : undefined;
    const pieces = Math.max(1, clip.speedRamp.length ? Math.min(80, Math.ceil(durationS * 6)) : 1);
    const segs: string[] = [];
    const labels: string[] = [];
    const sources: string[] = [];
    for (let i = 0; i < pieces; i++) {
      const f0 = Math.round((i / pieces) * clip.duration);
      const f1 = Math.round(((i + 1) / pieces) * clip.duration);
      if (f1 <= f0) continue;
      const s0 = sourceTimeAt(clip, f0, fps, map);
      const s1 = sourceTimeAt(clip, f1, fps, map);
      const outLen = (f1 - f0) / fps;
      const span = Math.abs(s1 - s0);
      const label = `p${i}`;
      if (span < 1e-3) {
        segs.push(`aevalsrc=0|0:d=${outLen.toFixed(4)}:s=48000:c=stereo,${FORMAT}[${label}]`);
      } else {
        const start = Math.min(s0, s1);
        const parts = [`atrim=start=${start.toFixed(4)}:end=${(start + span).toFixed(4)}`, 'asetpts=PTS-STARTPTS', FORMAT];
        if (s1 < s0) parts.push('areverse');
        parts.push(...atempoChain(span / outLen));
        sources.push(`src${i}`);
        segs.push(`[src${i}]${parts.join(',')}[${label}]`);
      }
      labels.push(label);
    }
    const head = sources.length === 0 ? '' : sources.length === 1 ? `[0:a]anull[${sources[0]}];` : `[0:a]asplit=${sources.length}${sources.map((l) => `[${l}]`).join('')};`;
    graph = `${head}${segs.join(';')};${labels.map((l) => `[${l}]`).join('')}concat=n=${labels.length}:v=0:a=1,${tail}[out]`;
  } else {
    const span = durationS * clip.speed;
    const chain = [`atrim=start=${clip.trimStart.toFixed(4)}:duration=${span.toFixed(4)}`, 'asetpts=PTS-STARTPTS', ...atempoChain(clip.speed), tail];
    graph = `[0:a]${chain.join(',')}[out]`;
  }

  await ffmpeg(['-i', input, '-vn', '-filter_complex', graph, '-map', '[out]', '-c:a', 'pcm_s16le', '-ar', '48000', out], { signal, timeoutMs: 600_000 });
}
