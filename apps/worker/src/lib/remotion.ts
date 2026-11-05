import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '@adforge/core/server';
import type { ChromiumOptions } from '@remotion/renderer';
import { log } from './log';
import { cpuCount, memoryBytes, tmpRoot } from './util';

/** Composition ids registered by @adforge/compositions. */
export const TIMELINE_COMPOSITION_ID = 'Timeline';
export const MOTION_COMPOSITION_ID = 'MotionTemplate';

let bundling: Promise<string> | null = null;

/** Location of the bundled compositions: REMOTION_SERVE_URL, a pre-built bundle, or a fresh bundle. */
export function serveUrl(): Promise<string> {
  if (bundling) return bundling;
  const configured = env().REMOTION_SERVE_URL;
  if (configured) return (bundling = Promise.resolve(configured));
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.resolve(here, '../.remotion-bundle'), path.resolve(here, '../../.remotion-bundle'), path.resolve(process.cwd(), '.remotion-bundle')]) {
    if (existsSync(path.join(candidate, 'index.html'))) return (bundling = Promise.resolve(candidate));
  }
  bundling = (async () => {
    const started = Date.now();
    const { bundle } = await import('@remotion/bundler');
    const entryPoint = fileURLToPath(import.meta.resolve('@adforge/compositions/entry'));
    const url = await bundle({ entryPoint, outDir: path.join(tmpRoot(), 'remotion-bundle'), onProgress: () => undefined });
    log.info({ ms: Date.now() - started }, 'compositions bundled');
    return url;
  })().catch((err) => {
    bundling = null;
    throw err;
  });
  return bundling;
}

export function browserExecutable(): string | null {
  return env().REMOTION_CHROME_PATH ?? null;
}

export function chromiumOptions(): ChromiumOptions {
  // SwiftShader WebGL works on machines without a GPU, which is what LUTs and keying need.
  return { gl: 'swangle' };
}

const MB = 1024 * 1024;
/** Kept free for Node, FFmpeg and the other job pools. */
const RESERVED_MEMORY = 700 * MB;
/** Roughly what one Chrome tab takes while rendering a 1080p frame. */
const MEMORY_PER_TAB = 350 * MB;

/** Chrome tabs per render: half the CPUs, as many as memory allows, at least one. */
export function renderConcurrency(): number {
  const configured = env().RENDER_CONCURRENCY;
  if (configured > 0) return configured;
  const byMemory = Math.floor((memoryBytes() - RESERVED_MEMORY) / MEMORY_PER_TAB);
  return Math.max(1, Math.min(8, Math.floor(cpuCount() / 2), byMemory));
}

export function licenseKey(): string | null {
  return env().REMOTION_LICENSE_KEY ?? null;
}
