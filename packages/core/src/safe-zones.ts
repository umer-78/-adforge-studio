import { transformAt } from './timeline/animate';
import { CAPTION_STYLES_BY_ID } from './timeline/catalog';
import { groupCaptionWords } from './timeline/captions';
import { textStyleSchema, type CaptionsClip, type Clip, type TextClip, type TextStyle, type TimelineData } from './timeline/schema';

/**
 * Where each platform's own interface sits on top of a full-screen ad, and where it recommends
 * keeping text and logos. Measured from the platforms' published ad templates, so treat them as
 * close guides rather than exact pixels: the apps move buttons between versions and devices.
 */

/** A rectangle in fractions of the frame, from the top-left corner. */
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SafeZoneId = 'reels' | 'stories' | 'tiktok' | 'shorts' | 'feed' | 'landscape';

export interface SafeZone {
  id: SafeZoneId;
  label: string;
  /** A short name for lists, such as "Reels". */
  short: string;
  /** Width over height of the frames it applies to. */
  aspects: number[];
  /** The area the platform recommends for text and logos. */
  safe: FrameRect;
  /** Parts of the frame the app's interface covers, and what sits there. */
  covered: { rect: FrameRect; label: string }[];
  source: string;
}

const rect = (x: number, y: number, w: number, h: number): FrameRect => ({ x, y, w, h });
/** The recommended area from insets measured at each edge. */
const inset = (top: number, right: number, bottom: number, left: number) => rect(left, top, 1 - left - right, 1 - top - bottom);

export const SAFE_ZONES: SafeZone[] = [
  {
    id: 'reels',
    label: 'Instagram and Facebook Reels',
    short: 'Reels',
    aspects: [9 / 16],
    safe: inset(0.14, 0.06, 0.35, 0.06),
    covered: [
      { rect: rect(0, 0, 1, 0.08), label: 'Reels header and camera' },
      { rect: rect(0.86, 0.46, 0.14, 0.54), label: 'Like, comment, share and audio buttons' },
      { rect: rect(0, 0.68, 0.86, 0.32), label: 'Name, caption and call-to-action button' },
    ],
    source: 'Meta Ads Guide: Reels safe zone (keep 14% top, 35% bottom and 6% at the sides clear)',
  },
  {
    id: 'stories',
    label: 'Instagram and Facebook Stories',
    short: 'Stories',
    aspects: [9 / 16],
    safe: inset(0.14, 0.06, 0.14, 0.06),
    covered: [
      { rect: rect(0, 0, 1, 0.11), label: 'Progress bar and account name' },
      { rect: rect(0, 0.86, 1, 0.14), label: 'Call-to-action and reply bar' },
    ],
    source: 'Meta Ads Guide: Stories safe zone (keep 14%, about 250 px, clear at the top and bottom)',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    short: 'TikTok',
    aspects: [9 / 16],
    safe: inset(0.125, 0.11, 0.344, 0.11),
    covered: [
      { rect: rect(0, 0, 1, 0.09), label: 'Following and For You tabs' },
      { rect: rect(0.86, 0.42, 0.14, 0.58), label: 'Profile, like, comment and share buttons' },
      { rect: rect(0, 0.7, 0.86, 0.3), label: 'Name, caption, sound and ad button' },
    ],
    source: 'TikTok Ads In-Feed safe zone template, 1080×1920 (240 px top, 660 px bottom, 120 px sides)',
  },
  {
    id: 'shorts',
    label: 'YouTube Shorts',
    short: 'YouTube Shorts',
    aspects: [9 / 16],
    safe: inset(0.15, 0.178, 0.35, 0.044),
    covered: [
      { rect: rect(0, 0, 1, 0.08), label: 'Search and menu buttons' },
      { rect: rect(0.82, 0.4, 0.18, 0.6), label: 'Like, comment, share and remix buttons' },
      { rect: rect(0, 0.72, 0.82, 0.28), label: 'Channel, title and ad button' },
    ],
    source: 'Google Ads Help: YouTube Shorts ads safe zone (15% top, 35% bottom, 4.4% left, 17.8% right)',
  },
  {
    id: 'feed',
    label: 'Instagram and Facebook feed',
    short: 'the feed',
    aspects: [4 / 5, 1],
    safe: inset(0.05, 0.05, 0.05, 0.05),
    covered: [],
    source: 'Feed posts show the whole frame; a 5% margin keeps text clear of rounded corners and crops',
  },
  {
    id: 'landscape',
    label: 'YouTube and web video',
    short: 'YouTube',
    aspects: [16 / 9],
    safe: inset(0.05, 0.05, 0.16, 0.05),
    covered: [{ rect: rect(0, 0.86, 1, 0.14), label: 'Player controls, ad info and skip button' }],
    source: 'Player controls and in-stream ad labels cover the bottom of the frame; 5% title-safe margins',
  },
];

export const SAFE_ZONES_BY_ID = Object.fromEntries(SAFE_ZONES.map((z) => [z.id, z])) as Record<SafeZoneId, SafeZone>;

/** The zones that apply to a frame of this shape. */
export function safeZonesFor(width: number, height: number): SafeZone[] {
  const aspect = width / height;
  return SAFE_ZONES.filter((z) => z.aspects.some((a) => Math.abs(a - aspect) / a < 0.03));
}

/* ------------------------------------------------------------------ Text extent */

const MAX_CAPTION_WIDTH = 0.88;

/** Average advance of one character, in ems: wide display faces and capitals run wider. */
function charWidthEm(style: TextStyle): number {
  const wide = /unbounded|anton|bebas|archivo black|syne/i.test(style.fontFamily) ? 0.08 : 0;
  return (style.uppercase ? 0.7 : 0.56) + wide + style.letterSpacing;
}

interface Extent {
  width: number;
  height: number;
}

/** How much room a block of text takes when wrapped to `maxWidth` pixels. */
function measure(lines: string[], style: TextStyle, fontPx: number, maxWidth: number): Extent {
  const charPx = Math.max(1, charWidthEm(style) * fontPx);
  const perLine = Math.max(1, Math.floor(maxWidth / charPx));
  let rows = 0;
  let widest = 0;
  for (const line of lines) {
    const chars = [...line].length;
    rows += Math.max(1, Math.ceil(chars / perLine));
    widest = Math.max(widest, Math.min(maxWidth, chars * charPx));
  }
  return { width: widest, height: rows * fontPx * Math.max(style.lineHeight, 1) };
}

/** Pixel unit the compositions use: 1 at a 1080 px short side. */
const unit = (tl: Pick<TimelineData, 'width' | 'height'>) => Math.min(tl.width, tl.height) / 1080;

/** The layer box at a moment of the clip, scaled around its anchor, in pixels. */
function layerBox(clip: Clip, localFrame: number, tl: Pick<TimelineData, 'width' | 'height'>) {
  const t = transformAt(clip, localFrame);
  const w = t.width * tl.width;
  const h = t.height * tl.height;
  const left = tl.width / 2 + t.x * tl.width - w / 2;
  const top = tl.height / 2 + t.y * tl.height - h / 2;
  const ax = left + t.anchorX * w;
  const ay = top + t.anchorY * h;
  const s = Math.abs(t.scale);
  return { left: ax - t.anchorX * w * s, top: ay - t.anchorY * h * s, width: w * s, height: h * s, scale: s, visible: t.opacity > 0.05 && s > 0.01 };
}

/**
 * Space between word-timed captions and the edge they sit at, as a fraction of their box height.
 * On tall frames bottom captions stay above the bottom 35%, where Reels, TikTok and Shorts put the
 * caption, name and buttons.
 */
export function captionPositionPadding(position: CaptionsClip['position'], aspect: number): number {
  const vertical = aspect < 0.7;
  if (position === 'bottom') return vertical ? 0.35 : 0.16;
  if (position === 'top') return vertical ? 0.16 : 0.08;
  return 0;
}

/** Where the words of a text or caption layer land, in fractions of the frame, at a local frame. */
export function textRect(clip: TextClip | CaptionsClip, localFrame: number, tl: Pick<TimelineData, 'width' | 'height' | 'fps'>): FrameRect | null {
  const box = layerBox(clip, localFrame, tl);
  if (!box.visible) return null;
  const u = unit(tl) * box.scale;
  let width: number;
  let height: number;
  let left: number;
  let top: number;
  if (clip.type === 'text') {
    if (!clip.text.trim()) return null;
    const style = clip.style;
    const lines = (style.uppercase ? clip.text.toUpperCase() : clip.text).split('\n');
    ({ width, height } = measure(lines, style, style.fontSize * u, box.width));
    left = style.align === 'left' ? box.left : style.align === 'right' ? box.left + box.width - width : box.left + (box.width - width) / 2;
    top = box.top + (box.height - height) / 2;
  } else {
    const def = CAPTION_STYLES_BY_ID[clip.styleId] ?? CAPTION_STYLES_BY_ID.pop!;
    const overrides = Object.fromEntries(Object.entries(clip.overrides).filter(([k, v]) => k in textStyleSchema.shape && v !== null));
    const style = textStyleSchema.parse({ ...def.style, ...overrides });
    const groups = groupCaptionWords(clip.words, clip.maxWordsPerLine);
    if (!groups.length) return null;
    const maxWidth = box.width * MAX_CAPTION_WIDTH;
    // The widest group decides how much room captions need over the whole clip.
    const sizes = groups.map((g) => measure([g.words.map((w) => (style.uppercase ? w.text.toUpperCase() : w.text)).join(' ')], { ...style, lineHeight: Math.max(style.lineHeight, 1.25) }, style.fontSize * u, maxWidth));
    width = Math.max(...sizes.map((s) => s.width));
    height = Math.max(...sizes.map((s) => s.height));
    left = box.left + (box.width - width) / 2;
    const pad = captionPositionPadding(clip.position, box.width / box.height) * box.height;
    top = clip.position === 'top' ? box.top + pad : clip.position === 'bottom' ? box.top + box.height - pad - height : box.top + (box.height - height) / 2;
  }
  return { x: left / tl.width, y: top / tl.height, w: width / tl.width, h: height / tl.height };
}

/* ----------------------------------------------------------------------- Checks */

export interface SafeZoneIssue {
  zone: SafeZoneId;
  clipId: string;
  /** A short quote of the text, or "Captions". */
  name: string;
  /** What covers the text, or null when it only sits outside the recommended area. */
  coveredBy: string | null;
}

const overlap = (a: FrameRect, b: FrameRect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const EDGE_TOLERANCE = 0.005;
const inside = (a: FrameRect, b: FrameRect) => a.x >= b.x - EDGE_TOLERANCE && a.y >= b.y - EDGE_TOLERANCE && a.x + a.w <= b.x + b.w + EDGE_TOLERANCE && a.y + a.h <= b.y + b.h + EDGE_TOLERANCE;

const quote = (clip: TextClip | CaptionsClip) => {
  if (clip.type === 'captions') return 'Captions';
  const text = clip.text.replace(/\s+/g, ' ').trim();
  if (text.length <= 28) return text;
  // Cut at a word boundary when one is near, so the quote never ends mid-word.
  const cut = text.slice(0, 27);
  const space = cut.lastIndexOf(' ');
  return `${(space > 15 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

const isText = (clip: Clip): clip is TextClip | CaptionsClip => clip.type === 'text' || clip.type === 'captions';

/** What covers more than 10% of the words, if anything. */
function coverOf(r: FrameRect, zone: SafeZone): string | null {
  return zone.covered.find((c) => overlap(r, c.rect) > 0.1 * r.w * r.h)?.label ?? null;
}

export interface TextPlacement {
  clipId: string;
  rect: FrameRect;
  coveredBy: string | null;
  /** Outside the area the platform recommends for text. */
  outside: boolean;
}

/** Where the words of every text and caption layer on screen at `frame` land, checked against a zone. */
export function textPlacementsAt(tl: TimelineData, zone: SafeZone, frame: number): TextPlacement[] {
  const out: TextPlacement[] = [];
  for (const track of tl.tracks) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      if (!isText(clip) || frame < clip.start || frame >= clip.start + clip.duration) continue;
      const rect = textRect(clip, frame - clip.start, tl);
      if (!rect || rect.w <= 0 || rect.h <= 0) continue;
      out.push({ clipId: clip.id, rect, coveredBy: coverOf(rect, zone), outside: !inside(rect, zone.safe) });
    }
  }
  return out;
}

/**
 * Text and caption layers that a platform's interface would cover (more than 10% of the words'
 * area at the start, middle or end of the clip), or that sit outside its recommended area.
 */
export function safeZoneIssues(tl: TimelineData, zones: readonly SafeZone[]): SafeZoneIssue[] {
  const issues: SafeZoneIssue[] = [];
  for (const track of tl.tracks) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      if (!isText(clip)) continue;
      const rects = [0, Math.floor(clip.duration / 2), Math.max(0, clip.duration - 1)]
        .map((f) => textRect(clip, f, tl))
        .filter((r): r is FrameRect => !!r && r.w > 0 && r.h > 0);
      if (!rects.length) continue;
      for (const zone of zones) {
        const coveredBy = rects.map((r) => coverOf(r, zone)).find((c) => c) ?? null;
        if (coveredBy || rects.some((r) => !inside(r, zone.safe))) issues.push({ zone: zone.id, clipId: clip.id, name: quote(clip), coveredBy });
      }
    }
  }
  return issues;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** One plain sentence per text layer for the export check, most serious first, then a count of the rest. */
export function safeZoneIssueMessages(issues: readonly SafeZoneIssue[], limit = 3): string[] {
  const byClip = new Map<string, { name: string; covered: { zone: string; by: string }[]; edge: string[] }>();
  for (const issue of issues) {
    const entry = byClip.get(issue.clipId) ?? { name: issue.name, covered: [], edge: [] };
    const zone = SAFE_ZONES_BY_ID[issue.zone].short;
    if (issue.coveredBy) entry.covered.push({ zone, by: issue.coveredBy });
    else entry.edge.push(zone);
    byClip.set(issue.clipId, entry);
  }
  const entries = [...byClip.values()].sort((a, b) => b.covered.length - a.covered.length);
  const lines = entries.map(({ name, covered, edge }) => {
    if (covered.length === 1) return `“${name}” sits under the ${lowerFirst(covered[0]!.by)} on ${covered[0]!.zone}.`;
    if (covered.length > 1) return `“${name}” sits under the app's buttons or captions on ${listOf(covered.map((c) => c.zone))}.`;
    return `“${name}” runs outside the recommended text area on ${listOf(edge)}.`;
  });
  if (lines.length <= limit) return lines;
  const rest = lines.length - limit;
  return [...lines.slice(0, limit), `${rest} more text layer${rest > 1 ? 's have' : ' has'} the same problem.`];
}
