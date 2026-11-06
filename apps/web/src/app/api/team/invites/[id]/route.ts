import { logActivity, owned, route } from '@/lib/server/api';

/** Withdraws an invite so its link stops working. */
export const DELETE = route({ role: 'admin' }, async ({ sb, caller, params }) => {
  const invite = await owned(sb, 'workspace_invites', params.id!, caller, 'The invite');
  await sb.from('workspace_invites').update({ revoked_at: new Date().toISOString() }).eq('id', invite.id).is('accepted_at', null);
  await logActivity(sb, caller, 'team.invite_revoked', 'workspace', caller.workspaceId, { email: invite.email });
});
