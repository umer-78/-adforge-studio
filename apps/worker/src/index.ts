import { createServer } from 'node:http';
import { JOB_POOLS } from '@adforge/core';
import { env, serviceClient } from '@adforge/core/server';
import { HANDLERS } from './handlers';
import { userMessage } from './lib/errors';
import { log } from './lib/log';
import { Pool } from './runner';
import { Scheduler } from './scheduler';

const SHUTDOWN_GRACE_MS = 25_000;
/** A claim loop silent this long is hung (a busy pool still loops every few seconds). */
const STUCK_MS = 10 * 60_000;

async function main() {
  const e = env();
  const sb = serviceClient();
  // WORKER_POOLS="render" runs only the render pool, e.g. on a bigger machine; empty runs all pools.
  const wanted = e.WORKER_POOLS.split(',').map((s) => s.trim()).filter(Boolean);
  const defs = wanted.length ? JOB_POOLS.filter((p) => wanted.includes(p.name)) : JOB_POOLS;
  if (!defs.length) throw new Error(`WORKER_POOLS matched no pools (have: ${JOB_POOLS.map((p) => p.name).join(', ')})`);

  const pools = defs.map((def) => new Pool(def, HANDLERS, sb, log, e.WORKER_ID));
  for (const pool of pools) pool.start();
  const scheduler = new Scheduler(sb, log);
  scheduler.start();
  const startedAt = Date.now();

  // Hosts such as Railway restart a process that exits but do not watch its health endpoint, so a
  // hung claim loop ends the process and the host starts a fresh one. Leased jobs are re-claimed.
  const watchdog = setInterval(() => {
    const stuck = pools.find((p) => p.lastLoopAt && Date.now() - new Date(p.lastLoopAt).getTime() > STUCK_MS);
    if (!stuck) return;
    log.fatal({ pool: stuck.def.name, lastLoopAt: stuck.lastLoopAt }, 'claim loop stuck, exiting so the host restarts the worker');
    process.exit(1);
  }, 60_000);
  watchdog.unref();
  log.info({ pools: defs.map((d) => `${d.name}×${d.concurrency}`), workerId: e.WORKER_ID }, 'worker started');

  const server = createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/') {
      // A claim loop that has not run for two minutes is stuck (busy pools still loop).
      const stale = pools.some((p) => !p.lastLoopAt || Date.now() - new Date(p.lastLoopAt).getTime() > 120_000);
      const healthy = !stale || Date.now() - startedAt < 60_000;
      res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: healthy, uptimeS: Math.round((Date.now() - startedAt) / 1000), pools: pools.map((p) => p.status()) }));
      return;
    }
    res.writeHead(404).end();
  });
  // Railway and similar hosts pass the port to listen on in PORT.
  const port = e.PORT || e.WORKER_PORT;
  server.listen(port, () => log.info({ port }, 'health endpoint listening'));

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'shutting down');
    clearInterval(watchdog);
    scheduler.stop();
    await Promise.all(pools.map((p) => p.stop(SHUTDOWN_GRACE_MS)));
    server.close();
    log.info('worker stopped');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => log.error({ err: userMessage(err) }, 'unhandled rejection'));
}

main().catch((err) => {
  log.fatal({ err: userMessage(err), stack: err instanceof Error ? err.stack : undefined }, 'worker failed to start');
  process.exit(1);
});
