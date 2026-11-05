import { AppError } from '@adforge/core';
import { verifyProviderKey } from '@adforge/core/server';
import * as z from 'zod';
import { logActivity, route } from '@/lib/server/api';
import { providerParam, providerViews, removeProviderKey, requireSession, saveProviderKey } from '@/lib/server/providers';

const keySchema = z.object({
  key: z.string().trim().min(8, 'Paste the full key.').max(500).regex(/^\S+$/, 'A key has no spaces or line breaks.'),
  label: z.string().trim().max(80).nullish(),
});

/** Checks the key with the provider, then saves it encrypted. A rejected key is not saved. */
export const PUT = route({ body: keySchema, role: 'admin', limit: ['provider-keys', 30, 3600] }, async ({ sb, caller, params, body }) => {
  const provider = providerParam(params.provider);
  requireSession(caller, 'Provider keys');
  const result = await verifyProviderKey(provider, body.key);
  if (result.status === 'invalid') throw new AppError('provider_auth', result.message, 400);
  await saveProviderKey(sb, caller, provider, body.key, body.label || null);
  await logActivity(sb, caller, 'provider.key_saved', 'provider', null, { provider, check: result.status });
  const views = await providerViews(sb, caller.workspaceId);
  return { provider: views.find((v) => v.id === provider)!, check: result };
});

export const DELETE = route({ role: 'admin' }, async ({ sb, caller, params }) => {
  const provider = providerParam(params.provider);
  requireSession(caller, 'Provider keys');
  await removeProviderKey(sb, caller, provider);
  await logActivity(sb, caller, 'provider.key_removed', 'provider', null, { provider });
  const views = await providerViews(sb, caller.workspaceId);
  return views.find((v) => v.id === provider)!;
});
