import { describe, expect, it } from 'vitest';
import { bestTimes, nextSlotTimes, zonedWeekHour, type PostResult } from './best-times';

const post = (iso: string, likes: number, accountId = 'a'): PostResult => ({ platform: 'instagram', accountId, publishedAt: iso, metrics: { likes, views: likes * 20 } });

describe('best times', () => {
  it('reads weekday and hour in a time zone', () => {
    expect(zonedWeekHour(new Date('2026-11-04T18:30:00Z'), 'UTC')).toEqual({ weekday: 3, hour: 18 });
    expect(zonedWeekHour(new Date('2026-11-04T18:30:00Z'), 'Asia/Karachi')).toEqual({ weekday: 3, hour: 23 });
  });

  it('falls back to general times with little history', () => {
    const r = bestTimes([post('2026-11-02T10:00:00Z', 5)], { platforms: ['instagram'], timeZone: 'UTC' });
    expect(r.source).toBe('general');
    expect(r.slots.length).toBeGreaterThan(0);
  });

  it('learns the hours that beat the account’s typical post', () => {
    const rows: PostResult[] = [];
    for (let w = 0; w < 6; w++) {
      const day = 2 + w * 7; // Mondays in November 2026
      rows.push(post(`2026-11-${String(day).padStart(2, '0')}T19:00:00Z`, 300));
      rows.push(post(`2026-11-${String(day).padStart(2, '0')}T08:00:00Z`, 50));
    }
    // A much bigger account posting at 08:00 must not win just by size.
    rows.push(post('2026-11-03T08:00:00Z', 5000, 'big'), post('2026-11-10T08:00:00Z', 5000, 'big'));
    const r = bestTimes(rows.filter((x) => x.publishedAt < '2026-12'), { platforms: ['instagram'], timeZone: 'UTC' });
    expect(r.source).toBe('yours');
    expect(r.slots[0]).toMatchObject({ weekday: 1, hour: 19 });
  });

  it('finds the next matching moments', () => {
    const next = nextSlotTimes([{ weekday: 3, hour: 19 }], new Date('2026-11-02T00:00:00Z'), 'UTC', 2);
    expect(next.map((d) => d.toISOString())).toEqual(['2026-11-04T19:00:00.000Z', '2026-11-11T19:00:00.000Z']);
  });
});
