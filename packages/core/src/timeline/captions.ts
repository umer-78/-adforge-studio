import type { CaptionWord } from './schema';

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  speaker?: string;
}

export interface CaptionGroup {
  start: number;
  end: number;
  words: CaptionWord[];
}

/** Groups words into caption lines by count, punctuation and pauses. */
export function groupCaptionWords(words: readonly CaptionWord[], maxWords: number, maxGap = 0.6): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  let current: CaptionWord[] = [];
  const flush = () => {
    if (!current.length) return;
    groups.push({ start: current[0]!.start, end: current[current.length - 1]!.end, words: current });
    current = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const prev = current[current.length - 1];
    if (prev && (w.start - prev.end > maxGap || current.length >= maxWords || (w.speaker && prev.speaker && w.speaker !== prev.speaker))) flush();
    current.push(w);
    if (/[.!?…]$/.test(w.text)) flush();
  }
  flush();
  return groups;
}

export function activeCaptionGroup(groups: readonly CaptionGroup[], t: number): CaptionGroup | null {
  for (const g of groups) if (t >= g.start && t < g.end + 0.15) return g;
  return null;
}

/** Converts transcript words into caption words relative to a clip that starts at `offset` seconds of the source. */
export function transcriptToCaptionWords(words: readonly TranscriptWord[], offset = 0, until = Infinity): CaptionWord[] {
  return words
    .filter((w) => w.end > offset && w.start < until && w.text.trim())
    .map((w) => ({
      text: w.text.trim(),
      start: Math.max(0, w.start - offset),
      end: Math.max(0, Math.min(w.end, until) - offset),
      ...(w.speaker ? { speaker: w.speaker } : {}),
    }));
}

/** Builds evenly timed caption words for text without timestamps (e.g. a script line). */
export function estimateWordTimings(text: string, durationS: number, startS = 0): CaptionWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const weights = tokens.map((t) => Math.max(1, t.replace(/[^\p{L}\p{N}]/gu, '').length) + (/[,.!?;:]$/.test(t) ? 3 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = startS;
  return tokens.map((t, i) => {
    const d = (weights[i]! / total) * durationS;
    const w = { text: t, start: cursor, end: cursor + d * 0.92 };
    cursor += d;
    return w;
  });
}

/** WebVTT for exports and platform caption uploads. */
export function toVtt(words: readonly CaptionWord[], maxWords = 7, offset = 0): string {
  const fmt = (s: number) => {
    const ms = Math.max(0, Math.round((s + offset) * 1000));
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const sec = Math.floor((ms % 60_000) / 1000);
    const milli = ms % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
  };
  const groups = groupCaptionWords(words, maxWords);
  return ['WEBVTT', '', ...groups.map((g, i) => `${i + 1}\n${fmt(g.start)} --> ${fmt(g.end)}\n${g.words.map((w) => w.text).join(' ')}\n`)].join('\n');
}

export function toSrt(words: readonly CaptionWord[], maxWords = 7): string {
  const fmt = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const sec = Math.floor((ms % 60_000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return groupCaptionWords(words, maxWords)
    .map((g, i) => `${i + 1}\n${fmt(g.start)} --> ${fmt(g.end)}\n${g.words.map((w) => w.text).join(' ')}\n`)
    .join('\n');
}
