import { describe, expect, it } from 'vitest';
import { captionPositionPadding, safeZoneIssueMessages, safeZoneIssues, safeZonesFor, SAFE_ZONES, SAFE_ZONES_BY_ID, textPlacementsAt, textRect } from './safe-zones';
import { createTimeline, makeClip } from './timeline/ops';
import type { Clip, TimelineData } from './timeline/schema';

function withClips(clips: Clip[], size = { width: 1080, height: 1920 }): TimelineData {
  const tl = createTimeline(size);
  const text = tl.tracks.find((t) => t.kind === 'text')!;
  text.clips.push(...clips);
  return tl;
}

const text = (value: string, transform: Record<string, number> = {}) =>
  makeClip({ type: 'text', start: 0, duration: 90, text: value, transform: { width: 0.9, height: 0.2, ...transform } } as never);

describe('safe zone data', () => {
  it('keeps every rectangle inside the frame', () => {
    for (const zone of SAFE_ZONES) {
      for (const r of [zone.safe, ...zone.covered.map((c) => c.rect)]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('matches the published insets', () => {
    const tiktok = SAFE_ZONES_BY_ID.tiktok.safe;
    expect(tiktok.y * 1920).toBeCloseTo(240, 0);
    expect((1 - tiktok.y - tiktok.h) * 1920).toBeCloseTo(660, 0);
    const shorts = SAFE_ZONES_BY_ID.shorts.safe;
    expect(1 - shorts.x - shorts.w).toBeCloseTo(0.178, 3);
  });

  it('picks the zones for a frame shape', () => {
    expect(safeZonesFor(1080, 1920).map((z) => z.id)).toEqual(['reels', 'stories', 'tiktok', 'shorts']);
    expect(safeZonesFor(1080, 1350).map((z) => z.id)).toEqual(['feed']);
    expect(safeZonesFor(1080, 1080).map((z) => z.id)).toEqual(['feed']);
    expect(safeZonesFor(1920, 1080).map((z) => z.id)).toEqual(['landscape']);
    expect(safeZonesFor(1000, 600)).toEqual([]);
  });
});

describe('textRect', () => {
  it('centres short text in its box', () => {
    const r = textRect(text('Hello') as never, 0, { width: 1080, height: 1920, fps: 30 })!;
    expect(r.x + r.w / 2).toBeCloseTo(0.5, 3);
    expect(r.y + r.h / 2).toBeCloseTo(0.5, 3);
    expect(r.w).toBeLessThan(0.5);
  });

  it('wraps long text to the box width', () => {
    const r = textRect(text('A headline that is far too long to sit on one line of a phone screen') as never, 0, { width: 1080, height: 1920, fps: 30 })!;
    expect(r.w).toBeCloseTo(0.9, 2);
    expect(r.h).toBeGreaterThan((72 * 1.1 * 2) / 1920);
  });

  it('keeps bottom captions above the bottom 35% of tall frames', () => {
    expect(captionPositionPadding('bottom', 9 / 16)).toBe(0.35);
    expect(captionPositionPadding('bottom', 16 / 9)).toBe(0.16);
    const captions = makeClip({ type: 'captions', start: 0, duration: 60, words: [{ text: 'Shop', start: 0, end: 0.5 }, { text: 'now', start: 0.5, end: 1 }] } as never);
    const r = textRect(captions as never, 0, { width: 1080, height: 1920, fps: 30 })!;
    expect(r.y + r.h).toBeCloseTo(0.65, 3);
  });
});

describe('safeZoneIssues', () => {
  it('passes text in the middle of a tall frame', () => {
    expect(safeZoneIssues(withClips([text('Summer sale')]), safeZonesFor(1080, 1920))).toEqual([]);
  });

  it('flags text the platform buttons and captions would cover', () => {
    const issues = safeZoneIssues(withClips([text('Shop now', { y: 0.4 })]), safeZonesFor(1080, 1920));
    const byZone = Object.fromEntries(issues.map((i) => [i.zone, i]));
    expect(byZone.tiktok?.coveredBy).toBe('Name, caption, sound and ad button');
    expect(byZone.reels?.coveredBy).toBe('Name, caption and call-to-action button');
    expect(byZone.shorts?.name).toBe('Shop now');
    expect(byZone.stories?.coveredBy).toBe('Call-to-action and reply bar');
  });

  it('flags text that only crosses the recommended margin', () => {
    const wide = text('A headline that is far too long to sit on one line of a phone screen', { width: 1, y: -0.2 });
    const issues = safeZoneIssues(withClips([wide]), [SAFE_ZONES_BY_ID.tiktok]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.coveredBy).toBeNull();
  });

  it('skips hidden tracks and empty text', () => {
    const tl = withClips([text('Shop now', { y: 0.4 }), text('   ')]);
    tl.tracks.find((t) => t.kind === 'text')!.hidden = true;
    expect(safeZoneIssues(tl, safeZonesFor(1080, 1920))).toEqual([]);
  });

  it('allows text near the edges of a feed post only inside the margin', () => {
    const feed = withClips([text('Edge', { x: -0.47, width: 0.05 })], { width: 1080, height: 1350 });
    expect(safeZoneIssues(feed, safeZonesFor(1080, 1350))).toHaveLength(1);
  });
});

describe('textPlacementsAt', () => {
  it('marks only the layers on screen at that frame', () => {
    const late = makeClip({ type: 'text', start: 120, duration: 30, text: 'Later', transform: { width: 0.9, height: 0.2 } } as never);
    const tl = withClips([text('Shop now', { y: 0.4 }), late]);
    const now = textPlacementsAt(tl, SAFE_ZONES_BY_ID.tiktok, 10);
    expect(now).toHaveLength(1);
    expect(now[0]!.coveredBy).toBe('Name, caption, sound and ad button');
    expect(now[0]!.outside).toBe(true);
    expect(textPlacementsAt(tl, SAFE_ZONES_BY_ID.tiktok, 130).map((p) => p.outside)).toEqual([false]);
  });
});

describe('safeZoneIssueMessages', () => {
  const wide = () => text('A headline that is far too long to sit on one line of a phone screen', { width: 1, y: -0.2 });

  it('names what covers a layer on one platform', () => {
    const issues = safeZoneIssues(withClips([text('Shop now', { y: 0.4 })]), [SAFE_ZONES_BY_ID.tiktok]);
    expect(safeZoneIssueMessages(issues)).toEqual(['“Shop now” sits under the name, caption, sound and ad button on TikTok.']);
  });

  it('quotes long text up to a whole word', () => {
    const issues = safeZoneIssues(withClips([text('Free shipping on every order this week only', { y: 0.4 })]), [SAFE_ZONES_BY_ID.tiktok]);
    expect(issues[0]!.name).toBe('Free shipping on every…');
  });

  it('lists every platform that covers a layer', () => {
    const issues = safeZoneIssues(withClips([text('Shop now', { y: 0.4 })]), safeZonesFor(1080, 1920));
    expect(safeZoneIssueMessages(issues)).toEqual(["“Shop now” sits under the app's buttons or captions on Reels, Stories, TikTok and YouTube Shorts."]);
  });

  it('puts covered text first and counts the rest', () => {
    const issues = safeZoneIssues(withClips([wide(), text('Shop now', { y: 0.4 })]), [SAFE_ZONES_BY_ID.tiktok]);
    expect(safeZoneIssueMessages(issues)).toEqual([
      '“Shop now” sits under the name, caption, sound and ad button on TikTok.',
      '“A headline that is far too…” runs outside the recommended text area on TikTok.',
    ]);
    expect(safeZoneIssueMessages(issues, 1)).toEqual(['“Shop now” sits under the name, caption, sound and ad button on TikTok.', '1 more text layer has the same problem.']);
  });
});
