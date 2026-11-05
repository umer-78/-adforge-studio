import { check, forbidden, hasRole, logActivity, owned, route } from '@/lib/server/api';
import { API_KEY_COLUMNS, requireSession, toApiKeyView } from '@/lib/server/providers';

/** Revokes the key. It stops working on the next request. */
export const DELETE = route({ role: 'editor' }, async ({ sb, caller, params }) => {
  requireSession(caller, 'API keys');
  const row = await owned(sb, 'api_keys', params.id!, caller, 'This API key');
  if (row.user_id !== caller.userId && !hasRole(caller, 'admin')) throw forbidden('Only the person who made this key or an admin can revoke it.');
  if (row.revoked_at) return toApiKeyView(row, caller);
  const saved = check(await sb.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', row.id).select(API_KEY_COLUMNS).single(), 'Could not revoke the key');
  await logActivity(sb, caller, 'api_key.revoked', 'api_key', row.id, { name: row.name });
  return toApiKeyView(saved, caller);
});
