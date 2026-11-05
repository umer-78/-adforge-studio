import 'server-only';
import { AppError, KEY_PROVIDERS, PROVIDER_INFO, type KeyProvider } from '@adforge/core';
import { encryptSecret, features, forgetProviderKey, hasServerKey, keyHint, type ServiceClient } from '@adforge/core/server';
import type { ApiKeyView, ProviderView } from '@/lib/types';
import { check, forbidden, notFound, type Caller } from './api';

export function providerParam(value: string | undefined): KeyProvider {
  if (!value || !(KEY_PROVIDERS as readonly string[]).includes(value)) throw notFound('This provider');
  return value as KeyProvider;
}

/** Secrets and keys are managed from the signed-in app only, never with an API key. */
export function requireSession(caller: Caller, what: string) {
  if (caller.via !== 'session') throw forbidden(`${what} can only be changed from the app while signed in, not with an API key.`);
}

export async function providerViews(sb: ServiceClient, workspaceId: string): Promise<ProviderView[]> {
  const rows = check(await sb.from('provider_credentials').select('provider, label, key_hint, updated_at').eq('workspace_id', workspaceId), 'Could not load provider keys');
  const own = new Map(rows.map((r) => [r.provider, r]));
  return KEY_PROVIDERS.map((id) => {
    const row = own.get(id);
    const serverKey = hasServerKey(id);
    return { id, source: row ? 'workspace' : serverKey ? 'server' : 'none', keyHint: row?.key_hint ?? null, label: row?.label ?? null, updatedAt: row?.updated_at ?? null, serverKey };
  });
}

/** Stores a workspace's key encrypted. The plaintext is never returned or logged. */
export async function saveProviderKey(sb: ServiceClient, caller: Caller, provider: KeyProvider, key: string, label: string | null) {
  if (!features().encryption) throw new AppError('encryption_not_configured', 'Set APP_ENCRYPTION_KEY on the server before saving keys.', 400);
  const secret = encryptSecret(key);
  const meta = { label, key_hint: keyHint(key), created_by: caller.userId };
  const existing = check(await sb.from('provider_credentials').select('id').eq('workspace_id', caller.workspaceId).eq('provider', provider).maybeSingle(), 'Could not save the key');
  if (existing) {
    check(await sb.from('provider_secrets').upsert({ credential_id: existing.id, secret_enc: secret, key_version: 1 }, { onConflict: 'credential_id' }), 'Could not save the key');
    check(await sb.from('provider_credentials').update(meta).eq('id', existing.id), 'Could not save the key');
  } else {
    const created = check(await sb.from('provider_credentials').insert({ workspace_id: caller.workspaceId, provider, ...meta }).select('id').single(), 'Could not save the key');
    const stored = await sb.from('provider_secrets').insert({ credential_id: created.id, secret_enc: secret, key_version: 1 });
    if (stored.error) {
      // No half-saved key that shows as connected but has nothing behind it.
      await sb.from('provider_credentials').delete().eq('id', created.id);
      throw new AppError('db_error', `Could not save the key: ${stored.error.message}`, 500);
    }
  }
  forgetProviderKey(caller.workspaceId, provider);
}

export async function removeProviderKey(sb: ServiceClient, caller: Caller, provider: KeyProvider) {
  check(await sb.from('provider_credentials').delete().eq('workspace_id', caller.workspaceId).eq('provider', provider), 'Could not remove the key');
  forgetProviderKey(caller.workspaceId, provider);
}

export const providerLabel = (id: KeyProvider) => PROVIDER_INFO[id].label;

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  user_id: string;
}

export const API_KEY_COLUMNS = 'id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at, user_id';

export function toApiKeyView(row: ApiKeyRow, caller: Pick<Caller, 'userId'>): ApiKeyView {
  const expired = !!row.expires_at && new Date(row.expires_at).getTime() < Date.now();
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes ?? [],
    status: row.revoked_at ? 'revoked' : expired ? 'expired' : 'active',
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    mine: row.user_id === caller.userId,
  };
}
