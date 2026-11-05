import { apiKeyCreateSchema } from '@adforge/core';
import { generateApiKey } from '@adforge/core/server';
import { badRequest, check, hasRole, json, logActivity, route } from '@/lib/server/api';
import { API_KEY_COLUMNS, requireSession, toApiKeyView } from '@/lib/server/providers';

const MAX_ACTIVE = 25;

/** Admins see every key in the workspace; others see their own. */
export const GET = route({}, async ({ sb, caller }) => {
  requireSession(caller, 'API keys');
  let q = sb.from('api_keys').select(API_KEY_COLUMNS).eq('workspace_id', caller.workspaceId).order('created_at', { ascending: false }).limit(200);
  if (!hasRole(caller, 'admin')) q = q.eq('user_id', caller.userId);
  const rows = check(await q, 'Could not load API keys');
  return { items: rows.map((r) => toApiKeyView(r, caller)), nextCursor: null };
});

/** The full key is returned once, here. Only its hash is stored. */
export const POST = route({ body: apiKeyCreateSchema, role: 'editor', limit: ['api-keys', 20, 3600] }, async ({ sb, caller, body }) => {
  requireSession(caller, 'API keys');
  const { count } = await sb.from('api_keys').select('id', { count: 'exact', head: true }).eq('workspace_id', caller.workspaceId).is('revoked_at', null);
  if ((count ?? 0) >= MAX_ACTIVE) throw badRequest(`This workspace already has ${MAX_ACTIVE} active keys. Revoke one first.`);
  const { key, prefix, hash } = generateApiKey();
  const expiresAt = body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString() : null;
  const row = check(
    await sb
      .from('api_keys')
      .insert({ workspace_id: caller.workspaceId, user_id: caller.userId, name: body.name.trim(), prefix, key_hash: hash, scopes: [...new Set(body.scopes)], expires_at: expiresAt })
      .select(API_KEY_COLUMNS)
      .single(),
    'Could not create the key',
  );
  await logActivity(sb, caller, 'api_key.created', 'api_key', row.id, { name: row.name, scopes: row.scopes, expiresAt });
  return json({ key, apiKey: toApiKeyView(row, caller) }, 201);
});
