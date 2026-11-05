import type { Page, Route } from '@playwright/test';
import { estimateCost, type Capability } from '@adforge/core';
import * as f from './fixtures';

type Handler = (url: URL, route: Route) => unknown;

const page = <T>(items: T[]) => ({ items, nextCursor: null });

/** GET responses by path. Anything not listed returns an empty page, like a new workspace. */
const GET: [RegExp, Handler][] = [
  [/^\/api\/me$/, () => f.me],
  [/^\/api\/stats$/, () => f.stats],
  [/^\/api\/usage$/, (u) => f.usage(Number(u.searchParams.get('days')) || 30)],
  [/^\/api\/activity$/, () => page(f.activity)],
  [/^\/api\/jobs$/, (u) => page(u.searchParams.get('status') === 'active' || u.searchParams.get('status') === 'running' ? f.jobs : [])],
  [/^\/api\/models$/, (u) => page(f.models(u.searchParams.get('capability') as Capability | null))],
  [/^\/api\/assets$/, (u) => {
    const type = u.searchParams.get('type');
    const ids = u.searchParams.get('ids')?.split(',');
    const items = f.assets.filter((a) => (!type || type === 'all' || a.type === type) && (!ids || ids.includes(a.id)));
    return page(items);
  }],
  [/^\/api\/assets\/[^/]+$/, (u) => {
    const asset = f.assets.find((a) => u.pathname.endsWith(a.id)) ?? f.assets[0];
    return { asset, ...asset };
  }],
  [/^\/api\/generations$/, (u) => {
    const caps = u.searchParams.getAll('capability').flatMap((c) => c.split(','));
    return page(caps.length ? f.generations.filter((g) => caps.includes(g.capability)) : f.generations);
  }],
  [/^\/api\/timelines$/, () => page(f.timelines)],
  [/^\/api\/posts$/, (u) => {
    const status = u.searchParams.get('status');
    return page(status ? f.posts.filter((p) => p.status === status) : f.posts);
  }],
  [/^\/api\/social-accounts$/, () => ({
    accounts: f.socialAccounts,
    connectors: [
      { id: 'youtube', label: 'YouTube', platforms: ['youtube'], configured: true },
      { id: 'tiktok', label: 'TikTok', platforms: ['tiktok'], configured: true },
      { id: 'meta', label: 'Instagram & Facebook', platforms: ['instagram', 'facebook'], configured: true },
      { id: 'linkedin', label: 'LinkedIn', platforms: ['linkedin'], configured: true },
      { id: 'x', label: 'X', platforms: ['x'], configured: false },
      { id: 'pinterest', label: 'Pinterest', platforms: ['pinterest'], configured: true },
    ],
    ayrshare: false,
  })],
  [/^\/api\/providers$/, () => f.providers],
  [/^\/api\/sfx$/, () => f.sfx],
  [/^\/api\/templates$/, () => ({ items: f.templates })],
  [/^\/api\/voices\/usage$/, () => ({ tier: 'creator', characterCount: 41_200, characterLimit: 100_000, resetsAt: new Date(Date.parse(f.NOW_ISO) + 12 * 86_400_000).toISOString() })],
  [/^\/api\/llm\/estimate$/, () => ({ usd: 0.004 })],
  [/^\/api\/ad-accounts$/, () => ({ platforms: [{ id: 'meta', label: 'Meta', configured: true }, { id: 'tiktok', label: 'TikTok', configured: true }], accounts: [], adLibrary: true })],
];

/** POST responses that the screens read back (prices are computed with the real price table). */
const POST: [RegExp, (body: Record<string, unknown>) => unknown][] = [
  [/^\/api\/generate\/estimate$/, (b) => {
    const estimate = estimateCost(String(b.modelId), (b.params ?? {}) as Record<string, unknown>, {}, Number(b.variants) || 1);
    return { estimate, budget: f.me.budget, withinBudget: estimate.usd <= f.me.budget.remainingUsd };
  }],
];

/** Routes the app's API to the sample workspace. Other writes succeed with an empty object. */
export async function mockApi(target: Page, overrides: [RegExp, Handler][] = []) {
  const table = [...overrides, ...GET];
  await target.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') {
      const post = POST.find(([re]) => re.test(url.pathname));
      let body: unknown = {};
      if (post) {
        try {
          body = post[1]((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
        } catch (err) {
          return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: (err as Error).message } }) });
        }
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    const hit = table.find(([re]) => re.test(url.pathname));
    const body = hit ? await hit[1](url, route) : page([]);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(body) });
  });
}
