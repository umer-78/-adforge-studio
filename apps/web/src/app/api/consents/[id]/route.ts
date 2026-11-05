import { logActivity, owned, route } from '@/lib/server/api';

/** Revoking stops new generations that rely on this consent; cloned voices are removed separately. */
export const DELETE = route({ role: 'editor' }, async ({ sb, caller, params }) => {
  await owned(sb, 'consents', params.id!, caller, 'Consent');
  await sb.from('consents').update({ revoked_at: new Date().toISOString() }).eq('id', params.id!).eq('workspace_id', caller.workspaceId);
  await logActivity(sb, caller, 'consent.revoked', 'consent', params.id!);
});
