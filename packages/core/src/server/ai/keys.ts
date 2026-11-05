import { KEY_PROVIDERS, type KeyProvider } from '../../providers';
import { decryptSecret } from '../crypto';
import { env } from '../env';
import { serviceClient } from '../supabase';

export { KEY_PROVIDERS, type KeyProvider };

const ENV_KEYS: Record<KeyProvider, () => string | undefined> = {
  anthropic: () => env().ANTHROPIC_API_KEY,
  openai: () => env().OPENAI_API_KEY,
  fal: () => env().FAL_KEY,
  replicate: () => env().REPLICATE_API_TOKEN,
  agnes: () => env().AGNES_API_KEY,
  elevenlabs: () => env().ELEVENLABS_API_KEY,
  ayrshare: () => env().AYRSHARE_API_KEY,
};

const cache = new Map<string, { value: string | null; at: number }>();
const TTL = 60_000;

/** A workspace's own key (stored encrypted) wins over the server-wide env key. */
export async function providerKey(workspaceId: string | null | undefined, provider: KeyProvider): Promise<string | null> {
  if (workspaceId) {
    const cacheKey = `${workspaceId}:${provider}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL) return hit.value ?? ENV_KEYS[provider]() ?? null;
    const sb = serviceClient();
    const { data } = await sb
      .from('provider_credentials')
      .select('id, provider_secrets(secret_enc)')
      .eq('workspace_id', workspaceId)
      .eq('provider', provider)
      .maybeSingle();
    const enc = (data?.provider_secrets as { secret_enc: string } | { secret_enc: string }[] | null | undefined) ?? null;
    const secret = Array.isArray(enc) ? enc[0]?.secret_enc : enc?.secret_enc;
    let value: string | null = null;
    if (secret) {
      try {
        value = decryptSecret(secret);
      } catch {
        value = null;
      }
    }
    cache.set(cacheKey, { value, at: Date.now() });
    if (value) return value;
  }
  return ENV_KEYS[provider]() ?? null;
}

export async function requireProviderKey(workspaceId: string | null | undefined, provider: KeyProvider): Promise<string> {
  const key = await providerKey(workspaceId, provider);
  if (!key) throw new ProviderNotConfiguredError(provider);
  return key;
}

export function forgetProviderKey(workspaceId: string, provider: KeyProvider) {
  cache.delete(`${workspaceId}:${provider}`);
}

/** True when the server itself has a key for the provider (used when a workspace has none). */
export const hasServerKey = (provider: KeyProvider) => !!ENV_KEYS[provider]();

export class ProviderNotConfiguredError extends Error {
  readonly code = 'provider_not_configured';
  constructor(public readonly provider: string) {
    super(`${provider} is not connected. Add an API key in Settings → Providers.`);
    this.name = 'ProviderNotConfiguredError';
  }
}
