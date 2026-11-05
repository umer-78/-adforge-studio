import { providerKey, verifyProviderKey } from '@adforge/core/server';
import { badRequest, route } from '@/lib/server/api';
import { providerParam } from '@/lib/server/providers';

/** Re-checks the key in use (the workspace's own, or the server's). */
export const POST = route({ role: 'admin', limit: ['provider-test', 60, 3600] }, async ({ caller, params }) => {
  const provider = providerParam(params.provider);
  const key = await providerKey(caller.workspaceId, provider);
  if (!key) throw badRequest('There is no key to test. Add one first.');
  return verifyProviderKey(provider, key);
});
