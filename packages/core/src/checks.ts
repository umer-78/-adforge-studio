import { isRecord } from './utils';

/**
 * Ad checks that run before a file goes out: flashing that can trigger seizures, loudness against
 * what feeds play, whether the message survives with the sound off, and wording that ad networks
 * reject. All of them are rule based and free; the networks still make the final call on policy.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'none';

/* --------------------------------- Flashing -------------------------------- */

/** WCAG 2.3.1 general flash and red flash thresholds. */
export const FLASH_RULES = {
  /** A change in relative luminance of 10% or more… */
  minChange: 0.1,
  /** …where the darker state is below 0.80. */
  maxDarker: 0.8,
  /** Saturated red: R / (R + G + B) of 0.8 or more, and a change in (R - G - B) × 320 above 20. */
  redRatio: 0.8,
  redChange: 20,
  /** A flash counts when it covers about a quarter of the screen together. */
  areaFraction: 0.25,
  /** No more than three flashes in any one second. */
  maxFlashesPerSecond: 3,
} as const;

export interface FlashReport {
  status: CheckStatus;
  /** Most flashes in any one-second window (a flash is a pair of opposite changes). */
  maxFlashesPerSecond: number;
  maxRedFlashesPerSecond: number;
  /** Seconds where the limit is passed, merged into ranges. */
  ranges: [number, number][];
  fps: number;
  frames: number;
}

const GRID_W = 16;
const GRID_H = 9;

/** sRGB 0–255 to linear light, by table. */
const LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

interface Tracker {
  ref: Float32Array;
  dir: Int8Array;
  started: boolean;
  /** Area that changed last frame and was not counted yet, so a change spread over two frames counts once. */
  carryUp: number;
  carryDown: number;
  /** Direction of the last counted screen transition; a flash needs opposite ones. */
  last: number;
  events: number[];
}

const tracker = (n: number): Tracker => ({ ref: new Float32Array(n), dir: new Int8Array(n), started: false, carryUp: 0, carryDown: 0, last: 0, events: [] });

/**
 * Feeds frames (packed RGB, any size) and counts flashes the way WCAG describes them: each screen
 * region follows its luminance between turning points, and a screen transition counts when regions
 * covering a quarter of the screen change by 10% the same way at once.
 */
export class FlashDetector {
  private readonly cells = GRID_W * GRID_H;
  private readonly lum = new Float32Array(this.cells);
  private readonly red = new Float32Array(this.cells);
  private readonly cellOf: Uint16Array;
  private readonly area = new Float32Array(this.cells);
  private readonly general = tracker(this.cells);
  private readonly redTrack = tracker(this.cells);
  frames = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    readonly fps: number,
  ) {
    this.cellOf = new Uint16Array(width * height);
    for (let y = 0; y < height; y++) {
      const cy = Math.min(GRID_H - 1, Math.floor((y * GRID_H) / height));
      for (let x = 0; x < width; x++) {
        const cell = cy * GRID_W + Math.min(GRID_W - 1, Math.floor((x * GRID_W) / width));
        this.cellOf[y * width + x] = cell;
        this.area[cell]! += 1 / (width * height);
      }
    }
  }

  push(rgb: Uint8Array): void {
    const { lum, red, area, cellOf } = this;
    lum.fill(0);
    red.fill(0);
    const n = this.width * this.height;
    for (let p = 0; p < n; p++) {
      const i = p * 3;
      const r = LINEAR[rgb[i]!]!;
      const g = LINEAR[rgb[i + 1]!]!;
      const b = LINEAR[rgb[i + 2]!]!;
      const cell = cellOf[p]!;
      lum[cell]! += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sum = r + g + b;
      if (sum > 0 && r / sum >= FLASH_RULES.redRatio) red[cell]! += Math.max(0, r - g - b) * 320;
    }
    for (let c = 0; c < this.cells; c++) {
      const px = area[c]! * n || 1;
      lum[c]! /= px;
      red[c]! /= px;
    }
    this.step(this.general, lum, FLASH_RULES.minChange, true);
    this.step(this.redTrack, red, FLASH_RULES.redChange, false);
    this.frames++;
  }

  /** Moves each region to its next turning point and records the frame's screen transition (+1, -1 or 0). */
  private step(t: Tracker, values: Float32Array, minChange: number, darkerRule: boolean): void {
    if (!t.started) {
      t.ref.set(values);
      t.started = true;
      t.events.push(0);
      return;
    }
    let up = 0;
    let down = 0;
    for (let c = 0; c < this.cells; c++) {
      const v = values[c]!;
      const ref = t.ref[c]!;
      const dir = t.dir[c]!;
      const darkerOk = !darkerRule || Math.min(v, ref) < FLASH_RULES.maxDarker;
      if (dir >= 0 && ref - v >= minChange && darkerOk) {
        down += this.area[c]!;
        t.dir[c] = -1;
        t.ref[c] = v;
      } else if (dir <= 0 && v - ref >= minChange && darkerOk) {
        up += this.area[c]!;
        t.dir[c] = 1;
        t.ref[c] = v;
      } else if ((dir === 1 && v > ref) || (dir === -1 && v < ref)) {
        t.ref[c] = v;
      }
    }
    const A = FLASH_RULES.areaFraction;
    const totalUp = up + t.carryUp;
    const totalDown = down + t.carryDown;
    const canUp = up > 0 && totalUp >= A;
    const canDown = down > 0 && totalDown >= A;
    let event = canUp && (!canDown || totalUp >= totalDown) ? 1 : canDown ? -1 : 0;
    t.carryUp = event === 1 ? 0 : up;
    t.carryDown = event === -1 ? 0 : down;
    if (event !== 0 && event === t.last) event = 0;
    else if (event !== 0) t.last = event;
    t.events.push(event);
  }

  result(): FlashReport {
    const win = Math.max(1, Math.round(this.fps));
    const scan = (events: number[]) => {
      let max = 0;
      let count = 0;
      const bad: number[] = [];
      for (let i = 0; i < events.length; i++) {
        if (events[i]) count++;
        if (i >= win && events[i - win]) count--;
        const flashes = count / 2;
        if (flashes > max) max = flashes;
        if (flashes > FLASH_RULES.maxFlashesPerSecond) bad.push(i);
      }
      return { max, bad };
    };
    const g = scan(this.general.events);
    const r = scan(this.redTrack.events);
    const ranges = mergeRanges([...g.bad, ...r.bad].sort((a, b) => a - b).map((i) => [Math.max(0, (i - win + 1) / this.fps), (i + 1) / this.fps] as [number, number]));
    const worst = Math.max(g.max, r.max);
    return {
      status: worst > FLASH_RULES.maxFlashesPerSecond ? 'fail' : worst >= 2.5 ? 'warn' : 'pass',
      maxFlashesPerSecond: round(g.max),
      maxRedFlashesPerSecond: round(r.max),
      ranges: ranges.slice(0, 20),
      fps: this.fps,
      frames: this.frames,
    };
  }
}

function mergeRanges(list: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of list) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 0.05) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out.map(([a, b]) => [round(a), round(b)]);
}

const round = (n: number) => Math.round(n * 100) / 100;

/* --------------------------------- Loudness -------------------------------- */

/** What TikTok, Instagram, Facebook and YouTube normalize playback to, roughly. */
export const FEED_LOUDNESS_LUFS = -14;

export interface LoudnessReport {
  status: CheckStatus;
  lufs: number | null;
  truePeakDb: number | null;
  message: string;
}

export function loudnessReport(lufs: number | null | undefined, truePeakDb?: number | null, hasAudio = true): LoudnessReport {
  const l = lufs != null && Number.isFinite(lufs) ? round(lufs) : null;
  const tp = truePeakDb != null && Number.isFinite(truePeakDb) ? round(truePeakDb) : null;
  if (!hasAudio) return { status: 'none', lufs: null, truePeakDb: null, message: 'No sound in this file.' };
  if (l == null || l < -60) return { status: 'none', lufs: l, truePeakDb: tp, message: 'Silent or too quiet to measure.' };
  if (l > -9) return { status: 'fail', lufs: l, truePeakDb: tp, message: `Much louder than feeds play (${FEED_LOUDNESS_LUFS} LUFS). Apps turn it down, and it can sound crushed or distorted.` };
  if (l > -12) return { status: 'warn', lufs: l, truePeakDb: tp, message: `Louder than feeds play. Apps turn it down to about ${FEED_LOUDNESS_LUFS} LUFS, which can flatten the mix.` };
  if (l < -20) return { status: 'warn', lufs: l, truePeakDb: tp, message: 'Quieter than the posts around it, so it will sound weak next to them.' };
  if (tp != null && tp > -1) return { status: 'warn', lufs: l, truePeakDb: tp, message: 'Peaks above -1 dBTP can distort once the app re-encodes the sound.' };
  return { status: 'pass', lufs: l, truePeakDb: tp, message: `Close to the ${FEED_LOUDNESS_LUFS} LUFS that feeds play at.` };
}

/* --------------------------------- Sound off ------------------------------- */

export interface SoundOffReport {
  status: CheckStatus;
  /** Share of the running time with speech, 0–1, when a transcript exists. */
  speechShare: number | null;
  /** Whether the edit has captions or on-screen text, when it was made in the editor. */
  captions: boolean | null;
  message: string;
}

export function soundOffReport(input: { hasAudio: boolean; durationS: number | null; segments: { start: number; end: number }[] | null; captions: boolean | null }): SoundOffReport {
  if (!input.hasAudio) return { status: 'pass', speechShare: null, captions: input.captions, message: 'No sound, so it plays the same muted.' };
  if (!input.segments) return { status: 'none', speechShare: null, captions: input.captions, message: 'Transcribe the file to check whether the message depends on speech.' };
  const spoken = input.segments.reduce((s, seg) => s + Math.max(0, seg.end - seg.start), 0);
  const share = input.durationS ? Math.min(1, spoken / input.durationS) : spoken > 0 ? 1 : 0;
  const speechShare = round(share);
  if (share < 0.15) return { status: 'pass', speechShare, captions: input.captions, message: 'Little speech, so the message carries without sound.' };
  if (input.captions === true) return { status: 'pass', speechShare, captions: true, message: 'Speech is captioned, so people watching muted can follow it.' };
  if (input.captions === false) return { status: 'warn', speechShare, captions: false, message: 'Most people watch feeds muted, and the speech here has no captions. Add captions in the editor.' };
  return { status: 'warn', speechShare, captions: null, message: 'Most people watch feeds muted. Unless captions are burned in, add them in the editor.' };
}

/* ------------------------------- Ad policy text ----------------------------- */

export interface PolicyFinding {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  /** The words that matched, as written. */
  match: string;
}

interface PolicyRule {
  id: string;
  severity: PolicyFinding['severity'];
  title: string;
  detail: string;
  test: RegExp;
}

const SENSITIVE = 'depressed|depression|anxious|anxiety|overweight|fat|obese|diabetic|diabetes|bald|balding|gay|lesbian|bisexual|transgender|christian|muslim|jewish|hindu|atheist|pregnant|infertile|in debt|broke|bankrupt|divorced|lonely|disabled|an addict|addicted|alcoholic|adhd|autistic|cancer|hiv|acne|wrinkles';

const RULES: PolicyRule[] = [
  {
    id: 'personal-attributes',
    severity: 'high',
    title: 'Implies the viewer’s personal traits',
    detail: 'Meta, TikTok and Google reject ads that assert or imply someone’s health, finances, religion, sexuality or similar traits. Talk about the product, not the viewer’s condition.',
    test: new RegExp(`\\b(?:are you|you're|you are|do you have|do you suffer from|tired of being|struggling with your|meet other)\\b[^.?!\\n]{0,40}?\\b(?:${SENSITIVE})\\b`, 'i'),
  },
  {
    id: 'health-claim',
    severity: 'high',
    title: 'Medical claim',
    detail: 'Claims that a product cures, treats or prevents a condition need proof and are banned for most products.',
    test: /\b(?:cures?|cured|heals?|treats?|prevents?|reverses?|eliminates?)\b[^.?!\n]{0,30}?\b(?:cancer|diabetes|covid|disease|depression|anxiety|acne|hair loss|baldness|arthritis|obesity|infections?|insomnia|eczema|psoriasis)\b/i,
  },
  { id: 'miracle', severity: 'high', title: 'Miracle wording', detail: 'Words like “miracle” or “magic pill” are treated as misleading claims.', test: /\b(?:miracle|magic pill|wonder drug|one weird trick)\b/i },
  {
    id: 'weight-loss',
    severity: 'high',
    title: 'Weight-loss promise',
    detail: 'Specific weight-loss amounts or timeframes are restricted on Meta, TikTok and Google, and only allowed to adults in some places.',
    test: /\b(?:lose|lost|drop|shed|melt|burn)\s+(?:up to\s+)?\d+\s*(?:lbs?|pounds|kgs?|kilos?)\b|\b(?:lose|drop)\s+(?:weight|fat)\s+(?:in|within)\s+\d+\s+(?:days?|weeks?)\b/i,
  },
  { id: 'before-after', severity: 'medium', title: 'Before and after', detail: 'Before-and-after claims for weight, skin or cosmetic results are restricted on Meta and TikTok.', test: /\bbefore\s*(?:and|&|\/|vs\.?)\s*after\b/i },
  {
    id: 'guaranteed',
    severity: 'medium',
    title: 'Guaranteed or instant results',
    detail: 'Promises of guaranteed or instant results are flagged as misleading. Say what is typical instead.',
    test: /\b(?:guaranteed?|100% (?:results|success|effective|safe)|risk[- ]free|instant results|overnight results|works every time)\b/i,
  },
  {
    id: 'income',
    severity: 'high',
    title: 'Income or get-rich claim',
    detail: 'Get-rich-quick and income claims are prohibited on Meta, TikTok and Google.',
    test: /\b(?:get rich|make \$?\d[\d,.]*k?\s*(?:a|per|\/)\s*(?:day|week|month|hour)|passive income|financial freedom|guaranteed (?:returns?|profits?|income)|double your money|quit your (?:day )?job)\b/i,
  },
  {
    id: 'restricted-finance',
    severity: 'medium',
    title: 'Restricted financial product',
    detail: 'Crypto, trading, loans and gambling ads need approval or a license on most networks.',
    test: /\b(?:crypto(?:currency)?|bitcoin|ethereum|nfts?|forex|binary options|day trading|casinos?|betting|gambl\w*|payday loans?|sports? ?book)\b/i,
  },
  {
    id: 'prohibited-product',
    severity: 'high',
    title: 'Prohibited product',
    detail: 'Tobacco, vapes, drugs, weapons and similar products cannot be advertised on most networks.',
    test: /\b(?:cigarettes?|vapes?|vaping|e-?cig\w*|tobacco|nicotine|cannabis|marijuana|weed|thc|firearms?|guns?|ammo|ammunition|explosives?|steroids?|opioids?|prescription drugs?)\b/i,
  },
  { id: 'cbd', severity: 'medium', title: 'CBD or supplements', detail: 'CBD is banned on most networks, and supplement claims need care.', test: /\b(?:cbd|hemp oil|fat burner|diet pills?|testosterone booster)\b/i },
  { id: 'alcohol', severity: 'low', title: 'Alcohol', detail: 'Alcohol ads must target adults of legal drinking age and are banned in some countries.', test: /\b(?:beer|wine|vodka|whisk(?:e)?y|tequila|rum|gin|liquor|alcohol|cocktails?)\b/i },
  { id: 'politics', severity: 'medium', title: 'Politics or social issues', detail: 'Ads about elections, politics or social issues need authorization and a “Paid for by” disclaimer.', test: /\b(?:vote|voting|election|candidate|democrats?|republicans?|referendum|ballot|congress|parliament|senator)\b/i },
  { id: 'clickbait', severity: 'medium', title: 'Clickbait wording', detail: 'Sensational phrasing is rated low quality and gets less reach.', test: /\b(?:you won'?t believe|shocking|doctors hate|what happens next|this one (?:simple )?trick|secret (?:they|that|banks|doctors))\b/i },
  { id: 'engagement-bait', severity: 'low', title: 'Engagement bait', detail: 'Asking for likes, shares, tags or comments is down-ranked on Facebook and Instagram.', test: /\b(?:like (?:this|if)|share (?:this|if)|tag (?:a|your) (?:friend|bestie|someone)|comment (?:below|yes|if))\b/i },
  { id: 'profanity', severity: 'medium', title: 'Profanity', detail: 'Profanity is restricted in ads, even when partly hidden.', test: /\b(?:f+u+c+k\w*|f\*+k|sh[i*]t\w*|b[i*]tch\w*|a[s*]{2}hole|wtf|damn)\b/i },
  { id: 'proof-claims', severity: 'low', title: 'Claim that needs proof', detail: 'Superlatives and scientific claims (“#1”, “clinically proven”, “FDA approved”) must be backed by evidence the network can ask for.', test: /(?:#1\b|\bnumber one\b|\bbest in the world\b|\bclinically proven\b|\bscientifically proven\b|\bfda[- ]approved\b|\bdoctor recommended\b)/i },
  { id: 'fake-urgency', severity: 'low', title: 'Pressure wording', detail: 'Countdown pressure is fine when true; false urgency is treated as misleading.', test: /\b(?:last chance|act now|only today|ends tonight|hurry)\b/i },
];

/** Rule-based wording check for ad copy, transcripts and on-screen text. */
export function checkAdPolicy(text: string): PolicyFinding[] {
  const t = text.slice(0, 20_000);
  if (!t.trim()) return [];
  const out: PolicyFinding[] = [];
  for (const r of RULES) {
    const m = r.test.exec(t);
    if (m) out.push({ id: r.id, severity: r.severity, title: r.title, detail: r.detail, match: m[0].trim().slice(0, 120) });
  }
  const words = t.match(/\b[A-Za-z]{3,}\b/g) ?? [];
  const caps = words.filter((w) => w === w.toUpperCase());
  if (words.length >= 6 && caps.length / words.length > 0.4) out.push({ id: 'all-caps', severity: 'low', title: 'Lots of capital letters', detail: 'Text in all caps reads as shouting and is flagged as low quality.', match: caps.slice(0, 4).join(' ') });
  const punct = /([!?])\1{2,}/.exec(t);
  if (punct) out.push({ id: 'punctuation', severity: 'low', title: 'Repeated punctuation', detail: 'Strings like “!!!” are flagged as low quality by Google and Meta.', match: punct[0] });
  const order = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function policyStatus(findings: readonly PolicyFinding[]): CheckStatus {
  return findings.some((f) => f.severity === 'high') ? 'fail' : findings.some((f) => f.severity === 'medium') ? 'warn' : 'pass';
}

/* ---------------------------------- Stored --------------------------------- */

export interface AdChecks {
  version: 1;
  checkedAt: string;
  flash: FlashReport | null;
  loudness: LoudnessReport;
  soundOff: SoundOffReport;
  policy: { status: CheckStatus; findings: PolicyFinding[]; source: 'transcript' | null };
}

export function adChecksOf(meta: unknown): AdChecks | null {
  const c = isRecord(meta) ? meta.checks : null;
  return isRecord(c) && c.version === 1 ? (c as unknown as AdChecks) : null;
}

/** The worst status of a set of checks, for a one-line summary. */
export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  return statuses.includes('fail') ? 'fail' : statuses.includes('warn') ? 'warn' : statuses.includes('pass') ? 'pass' : 'none';
}
