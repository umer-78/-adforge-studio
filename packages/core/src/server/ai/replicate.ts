import Replicate from 'replicate';

const clients = new Map<string, Replicate>();
function client(apiKey: string) {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Replicate({ auth: apiKey });
    clients.set(apiKey, c);
  }
  return c;
}

const versionCache = new Map<string, { id: string; at: number }>();

async function latestVersion(apiKey: string, model: string): Promise<string> {
  const hit = versionCache.get(model);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.id;
  const [owner, name] = model.split('/');
  if (!owner || !name) throw new Error(`Invalid Replicate model ${model}`);
  const m = await client(apiKey).models.get(owner, name);
  const id = m.latest_version?.id;
  if (!id) throw new Error(`Replicate model ${model} has no published version`);
  versionCache.set(model, { id, at: Date.now() });
  return id;
}

export async function replicateCreate(apiKey: string, model: string, input: Record<string, unknown>, webhook?: string | null): Promise<{ id: string }> {
  const version = model.includes(':') ? model.split(':')[1]! : await latestVersion(apiKey, model);
  const p = await client(apiKey).predictions.create({ version, input, ...(webhook ? { webhook, webhook_events_filter: ['completed'] } : {}) });
  return { id: p.id };
}

export async function replicateGet(apiKey: string, id: string): Promise<{ status: string; output: unknown; error: unknown; metrics?: { predict_time?: number } }> {
  const p = await client(apiKey).predictions.get(id);
  return { status: p.status, output: p.output, error: p.error, ...(p.metrics ? { metrics: p.metrics as { predict_time?: number } } : {}) };
}

export async function replicateCancel(apiKey: string, id: string) {
  await client(apiKey)
    .predictions.cancel(id)
    .catch(() => undefined);
}
