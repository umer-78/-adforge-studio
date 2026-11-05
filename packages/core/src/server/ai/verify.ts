import { env } from '../env';
import type { KeyProvider } from './keys';

export interface KeyCheck {
  /** valid: the provider accepted the key. invalid: it was rejected. unverified: the check could not finish. */
  status: 'valid' | 'invalid' | 'unverified';
  message: string;
  /** Account details the provider returned, for showing which account the key belongs to. */
  account: string | null;
}

interface Probe {
  url: string;
  headers: Record<string, string>;
  account?: (body: unknown) => string | null;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Free, read-only calls that need a valid key. None of them start paid work. */
const PROBES: Record<KeyProvider, (key: string) => Probe> = {
  anthropic: (key) => ({ url: 'https://api.anthropic.com/v1/models?limit=1', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } }),
  openai: (key) => ({ url: 'https://api.openai.com/v1/models', headers: { authorization: `Bearer ${key}` } }),
  fal: (key) => ({ url: 'https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai%2Fflux%2Fdev', headers: { authorization: `Key ${key}` } }),
  replicate: (key) => ({
    url: 'https://api.replicate.com/v1/account',
    headers: { authorization: `Bearer ${key}` },
    account: (b) => str(rec(b).username),
  }),
  agnes: (key) => ({ url: `${env().AGNES_BASE_URL.replace(/\/+$/, '')}/models`, headers: { authorization: `Bearer ${key}` } }),
  elevenlabs: (key) => ({
    url: 'https://api.elevenlabs.io/v1/user',
    headers: { 'xi-api-key': key },
    account: (b) => {
      const sub = rec(rec(b).subscription);
      const tier = str(sub.tier);
      const used = typeof sub.character_count === 'number' ? sub.character_count : null;
      const limit = typeof sub.character_limit === 'number' ? sub.character_limit : null;
      if (!tier) return null;
      return used != null && limit ? `${tier} plan, ${used.toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} characters used` : `${tier} plan`;
    },
  }),
  ayrshare: (key) => ({
    url: 'https://api.ayrshare.com/api/user',
    headers: { authorization: `Bearer ${key}` },
    account: (b) => {
      const active = rec(b).activeSocialAccounts;
      const list = Array.isArray(active) ? active.filter((x): x is string => typeof x === 'string') : [];
      return list.length ? `Linked: ${list.join(', ')}` : 'No social accounts linked in Ayrshare yet';
    },
  }),
};

/** Checks a key with the provider before it is saved, so a typo shows up here and not in the middle of a render. */
export async function verifyProviderKey(provider: KeyProvider, key: string): Promise<KeyCheck> {
  const probe = PROBES[provider](key);
  let res: Response;
  try {
    res = await fetch(probe.url, { headers: probe.headers, signal: AbortSignal.timeout(12_000) });
  } catch (err) {
    const timeout = (err as Error).name === 'TimeoutError';
    return { status: 'unverified', message: timeout ? 'The provider did not answer in time, so the key was not checked.' : 'Could not reach the provider, so the key was not checked.', account: null };
  }
  const text = await res.text().catch(() => '');
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (res.ok) {
    let account: string | null = null;
    try {
      account = probe.account?.(body) ?? null;
    } catch {
      account = null;
    }
    return { status: 'valid', message: 'The provider accepted this key.', account };
  }
  // A restricted ElevenLabs key can be valid without permission to read the account.
  if (provider === 'elevenlabs' && res.status === 401 && /missing_permissions/i.test(text)) {
    return { status: 'valid', message: 'The provider accepted this key. It is a restricted key, so account details are hidden.', account: null };
  }
  if (res.status === 401 || res.status === 403) return { status: 'invalid', message: 'The provider rejected this key. Check that it was copied in full and is still active.', account: null };
  if (res.status === 429) return { status: 'unverified', message: 'The provider is rate limiting requests, so the key was not checked.', account: null };
  return { status: 'unverified', message: `The provider answered with HTTP ${res.status}, so the key could not be checked.`, account: null };
}
