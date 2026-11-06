import { type Role } from '@adforge/core';
import { randomToken, sha256Hex } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, conflict, forbidden, logActivity, route } from '@/lib/server/api';
import { requireSession } from '@/lib/server/providers';
import { canManage, INVITABLE_ROLES, INVITE_TTL_DAYS } from '@/lib/server/team';

const body = z.object({ email: z.string().trim().toLowerCase().email().max(320), role: z.enum(INVITABLE_ROLES) });

/** Makes a one-time invite link for an email address. The admin shares the link themselves. */
export const POST = route({ body, role: 'admin', limit: ['team.invite', 30, 3600] }, async ({ req, sb, caller, body: b }) => {
  requireSession(caller, 'Team invites');
  if (!canManage(caller.role, 'viewer', b.role as Role)) throw forbidden('Only the owner can invite admins.');
  if (caller.email && caller.email.toLowerCase() === b.email) throw badRequest('You are already in this workspace.');
  const { data: members } = await sb.from('workspace_members').select('user_id').eq('workspace_id', caller.workspaceId);
  for (const m of members ?? []) {
    const { data } = await sb.auth.admin.getUserById(m.user_id);
    if (data.user?.email?.toLowerCase() === b.email) throw conflict(`${b.email} is already a member.`);
  }
  // One open invite per address: a new one replaces the old link.
  await sb.from('workspace_invites').update({ revoked_at: new Date().toISOString() }).eq('workspace_id', caller.workspaceId).eq('email', b.email).is('accepted_at', null).is('revoked_at', null);
  const token = randomToken(32);
  const { data: invite, error } = await sb
    .from('workspace_invites')
    .insert({ workspace_id: caller.workspaceId, email: b.email, role: b.role, token_hash: sha256Hex(token), invited_by: caller.userId, expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString() })
    .select('id, email, role, expires_at, created_at')
    .single();
  if (error || !invite) throw new Error(`Could not create the invite: ${error?.message}`);
  await logActivity(sb, caller, 'team.invited', 'workspace', caller.workspaceId, { email: b.email, role: b.role });
  return {
    invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expires_at, createdAt: invite.created_at },
    url: `${req.nextUrl.origin}/invite/${token}`,
  };
});
