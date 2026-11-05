import { publicRoute, json } from '@/lib/server/api';

/** Liveness and database reachability for uptime checks. Reports nothing about the data. */
export const GET = publicRoute({ limit: ['health', 120, 60] }, async ({ sb }) => {
  const started = Date.now();
  const { error } = await sb.from('workspaces').select('id', { head: true, count: 'exact' }).limit(1);
  const db = error ? 'error' : 'ok';
  return json({ ok: db === 'ok', db, latencyMs: Date.now() - started, time: new Date().toISOString() }, db === 'ok' ? 200 : 503);
});
