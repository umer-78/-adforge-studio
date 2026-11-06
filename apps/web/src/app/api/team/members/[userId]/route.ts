import { type Role } from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, forbidden, logActivity, notFound, route } from '@/lib/server/api';
import { requireSession } from '@/lib/server/providers';
import { canManage, INVITABLE_ROLES } from '@/lib/server/team';

async function member(sb: ServiceClient, workspaceId: string, userId: string) {
  if (!z.string().uuid().safeParse(userId).success) throw notFound('That member');
  const { data } = await sb.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (!data) throw notFound('That member');
  return data.role as Role;
}

/** Changes a member's role. */
export const PATCH = route({ body: z.object({ role: z.enum(INVITABLE_ROLES) }), role: 'admin' }, async ({ sb, caller, params, body }) => {
  requireSession(caller, 'Team roles');
  const userId = params.userId!;
  if (userId === caller.userId) throw badRequest('You cannot change your own role.');
  const current = await member(sb, caller.workspaceId, userId);
  if (!canManage(caller.role, current, body.role)) throw forbidden(current === 'owner' ? 'The owner’s role cannot change.' : 'Only the owner can make or change admins.');
  await sb.from('workspace_members').update({ role: body.role }).eq('workspace_id', caller.workspaceId).eq('user_id', userId);
  await logActivity(sb, caller, 'team.role_changed', 'workspace', caller.workspaceId, { userId, from: current, to: body.role });
  return { userId, role: body.role };
});

/** Removes a member, or lets someone leave. The owner stays. */
export const DELETE = route({ role: 'viewer' }, async ({ sb, caller, params }) => {
  requireSession(caller, 'Team members');
  const userId = params.userId!;
  const current = await member(sb, caller.workspaceId, userId);
  const leaving = userId === caller.userId;
  if (current === 'owner') throw badRequest(leaving ? 'The owner cannot leave their own workspace.' : 'The owner cannot be removed.');
  if (!leaving && !canManage(caller.role, current)) throw forbidden('Only the owner can remove admins, and only admins can remove members.');
  await sb.from('workspace_members').delete().eq('workspace_id', caller.workspaceId).eq('user_id', userId);
  await sb.from('profiles').update({ default_workspace_id: null }).eq('id', userId).eq('default_workspace_id', caller.workspaceId);
  await logActivity(sb, caller, leaving ? 'team.left' : 'team.removed', 'workspace', caller.workspaceId, { userId });
});
