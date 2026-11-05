import { readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { env } from '@adforge/core/server';

export function tmpRoot(): string {
  const dir = env().WORKER_TMP_DIR;
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

export async function makeTmpDir(name: string): Promise<string> {
  const dir = path.join(tmpRoot(), name);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeDir(dir: string) {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Calls fn at most once per interval; the latest call wins and is flushed on demand. */
export function throttle<A extends unknown[]>(fn: (...args: A) => Promise<void> | void, intervalMs: number) {
  let last = 0;
  let pending: A | null = null;
  let timer: NodeJS.Timeout | null = null;
  const fire = async () => {
    timer = null;
    if (!pending) return;
    const args = pending;
    pending = null;
    last = Date.now();
    await fn(...args);
  };
  const call = (...args: A) => {
    pending = args;
    const wait = intervalMs - (Date.now() - last);
    if (wait <= 0) void fire();
    else if (!timer) timer = setTimeout(() => void fire(), wait);
  };
  call.flush = async () => {
    if (timer) clearTimeout(timer);
    await fire();
  };
  return call;
}

/** Runs tasks with a concurrency limit, preserving result order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

const readNumbers = (file: string): number[] | null => {
  try {
    return readFileSync(file, 'utf8')
      .trim()
      .split(/\s+/)
      .map((v) => (v === 'max' ? Infinity : Number(v)));
  } catch {
    return null;
  }
};

/** The container's CPU quota (cgroup v2, then v1), or null when it has none. */
function cpuQuota(): number | null {
  const v2 = readNumbers('/sys/fs/cgroup/cpu.max');
  const [quota, period] = v2 ?? [readNumbers('/sys/fs/cgroup/cpu/cpu.cfs_quota_us')?.[0], readNumbers('/sys/fs/cgroup/cpu/cpu.cfs_period_us')?.[0]];
  return quota && period && Number.isFinite(quota) && quota > 0 && period > 0 ? quota / period : null;
}

let cpus: number | null = null;

/**
 * CPUs this process may use. Containers often see every core of the host, so the container's CPU
 * quota wins when there is one: render tabs and encoder threads are sized from this.
 */
export function cpuCount(): number {
  if (cpus == null) {
    const machine = Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
    const quota = cpuQuota();
    cpus = quota ? Math.max(1, Math.min(machine, Math.round(quota))) : machine;
  }
  return cpus;
}

/** Memory this process may use, in bytes: the container's limit when there is one, else the machine's. */
export function memoryBytes(): number {
  const total = os.totalmem();
  const limit = process.constrainedMemory?.() ?? 0;
  return limit > 0 && limit < total ? limit : total;
}

export const nowIso = () => new Date().toISOString();
export const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
