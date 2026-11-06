/**
 * Best times to post, learned from how the workspace's own posts did, with common starting points
 * per network until there is enough history. Times are worked out in the viewer's time zone.
 */

export interface PostResult {
  platform: string;
  accountId: string;
  publishedAt: string;
  metrics: Record<string, unknown>;
}

export interface TimeSlot {
  /** 0 = Sunday … 6 = Saturday, in the chosen time zone. */
  weekday: number;
  hour: number;
  /** Relative performance; 1 is the account's typical post. */
  score: number;
  posts: number;
}

export interface BestTimes {
  source: 'yours' | 'general';
  posts: number;
  slots: TimeSlot[];
}

/** Posts with results needed before your own history replaces the general starting points. */
export const MIN_POSTS_FOR_OWN_TIMES = 8;

/**
 * Common starting points from published industry studies of when audiences are active. They are
 * averages across many accounts, which is why the workspace's own results replace them.
 */
export const GENERAL_BEST_TIMES: Record<string, { days: number[]; hours: number[] }> = {
  instagram: { days: [2, 3, 4], hours: [11, 12, 19] },
  tiktok: { days: [2, 3, 4], hours: [18, 19, 20] },
  facebook: { days: [2, 3, 4], hours: [9, 10, 12] },
  linkedin: { days: [2, 3, 4], hours: [8, 9, 12] },
  youtube: { days: [4, 5, 6], hours: [15, 16, 17] },
  x: { days: [1, 2, 3, 4, 5], hours: [9, 10] },
  pinterest: { days: [5, 6, 0], hours: [20, 21] },
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Engagement weighted toward actions that mean more than a view. */
export function engagementOf(m: Record<string, unknown>): number {
  return num(m.likes) + 2 * num(m.comments) + 3 * num(m.shares) + 2 * num(m.saves) + num(m.views) / 100;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : 0;
};

/** Weekday (0–6) and hour (0–23) of a moment in a time zone. */
export function zonedWeekHour(date: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  return { weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd), hour };
}

export function bestTimes(results: readonly PostResult[], opts: { platforms: string[]; timeZone: string; limit?: number }): BestTimes {
  const limit = opts.limit ?? 5;
  const wanted = new Set(opts.platforms);
  const rows = results.filter((r) => (!wanted.size || wanted.has(r.platform)) && engagementOf(r.metrics) > 0 && !Number.isNaN(Date.parse(r.publishedAt)));
  if (rows.length < MIN_POSTS_FOR_OWN_TIMES) return { source: 'general', posts: rows.length, slots: generalSlots(opts.platforms, limit) };

  // Compare each post with its own account's typical post, so big accounts don't drown out small ones.
  const byAccount = new Map<string, number[]>();
  for (const r of rows) byAccount.set(r.accountId, [...(byAccount.get(r.accountId) ?? []), engagementOf(r.metrics)]);
  const typical = new Map([...byAccount].map(([k, v]) => [k, median(v) || 1]));
  const sum = new Float64Array(7 * 24);
  const count = new Uint16Array(7 * 24);
  for (const r of rows) {
    const { weekday, hour } = zonedWeekHour(new Date(r.publishedAt), opts.timeZone);
    const perf = engagementOf(r.metrics) / typical.get(r.accountId)!;
    sum[weekday * 24 + hour]! += Math.min(perf, 10);
    count[weekday * 24 + hour]! += 1;
  }
  // Neighbouring hours share half their weight, so one lucky post doesn't decide a slot.
  const slots: TimeSlot[] = [];
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 24; h++) {
      let s = 0;
      let w = 0;
      let n = 0;
      for (const dh of [-1, 0, 1]) {
        const i = d * 24 + ((h + dh + 24) % 24);
        const weight = dh === 0 ? 1 : 0.5;
        s += sum[i]! * weight;
        w += count[i]! * weight;
        n += dh === 0 ? count[i]! : 0;
      }
      if (n > 0 && w > 0) slots.push({ weekday: d, hour: h, score: Math.round((s / w) * 100) / 100, posts: n });
    }
  slots.sort((a, b) => b.score - a.score || b.posts - a.posts);
  return { source: 'yours', posts: rows.length, slots: slots.slice(0, limit) };
}

function generalSlots(platforms: string[], limit: number): TimeSlot[] {
  const list = (platforms.length ? platforms : ['instagram', 'tiktok']).map((p) => GENERAL_BEST_TIMES[p]).filter((x): x is { days: number[]; hours: number[] } => !!x);
  const votes = new Map<number, number>();
  for (const g of list) for (const d of g.days) for (const h of g.hours) votes.set(d * 24 + h, (votes.get(d * 24 + h) ?? 0) + 1);
  return [...votes]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([i, v]) => ({ weekday: Math.floor(i / 24), hour: i % 24, score: v / Math.max(1, list.length), posts: 0 }));
}

/** The next moments (on the hour) that fall in the given slots, at least `leadMs` from `from`. */
export function nextSlotTimes(slots: readonly Pick<TimeSlot, 'weekday' | 'hour'>[], from: Date, timeZone: string, count = 3, leadMs = 30 * 60_000): Date[] {
  const want = new Set(slots.map((s) => s.weekday * 24 + s.hour));
  const out: Date[] = [];
  let t = Math.ceil((from.getTime() + leadMs) / 3_600_000) * 3_600_000;
  for (let i = 0; i < 24 * 15 && out.length < count; i++, t += 3_600_000) {
    const d = new Date(t);
    const { weekday, hour } = zonedWeekHour(d, timeZone);
    if (want.has(weekday * 24 + hour)) out.push(d);
  }
  return out;
}
