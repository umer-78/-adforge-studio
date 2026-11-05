/**
 * Captures screenshots of the main screens against the sample workspace, for reviews and docs.
 *   BASE_URL=http://localhost:3000 OUT=./preview pnpm --filter @adforge/web exec tsx e2e/preview.ts
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { mockApi } from './mock-api';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve(process.env.OUT ?? 'preview');
const ONLY = process.env.ONLY?.split(',');

export const SCREENS: { name: string; path: string; wait?: string; width?: number; height?: number; full?: boolean }[] = [
  { name: 'landing', path: '/', full: true },
  { name: 'login', path: '/login' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'library', path: '/library' },
  { name: 'generate', path: '/generate' },
  { name: 'photo', path: '/photo' },
  { name: 'editor', path: '/editor' },
  { name: 'templates', path: '/templates' },
  { name: 'voice', path: '/voice' },
  { name: 'music', path: '/music' },
  { name: 'motion', path: '/motion' },
  { name: 'publish', path: '/publish' },
  { name: 'analytics', path: '/analytics' },
  { name: 'settings-providers', path: '/settings/providers' },
  { name: 'settings-usage', path: '/settings/usage' },
  { name: 'mobile-library', path: '/library', width: 390, height: 844 },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  for (const screen of SCREENS) {
    if (ONLY && !ONLY.includes(screen.name)) continue;
    const context = await browser.newContext({ viewport: { width: screen.width ?? 1440, height: screen.height ?? 900 }, deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: 'no-preference' });
    // Returning visitors skip the preloader; screenshots show the page itself.
    await context.addInitScript(() => sessionStorage.setItem('af-preloaded', '1'));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    await mockApi(page);
    await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle', timeout: 120_000 });
    // The dev-server badge is not part of the app.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `${screen.name}.png`), fullPage: !!screen.full });
    console.log(`${screen.name}${errors.length ? `  errors: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }
  await browser.close();
}

void main();
