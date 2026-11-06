import 'server-only';
import { AppError, type Role } from '@adforge/core';
import { sha256Hex, type ServiceClient } from '@adforge/core/server';
import type { InviteView, TeamMemberView } from '@/lib/types';

export const INVITE_TTL_DAYS = 7;
export const INVITABLE_ROLES = ['admin', 'editor', 'viewer'] as const;

export async function teamMembers(sb: ServiceClient, workspaceId: string, me: string): Promise<TeamMemberView[]> {
  const { data: rows, error } = await sb.from('workspace_members').select('user_id, role, created_at').eq('workspace_id', workspaceId).order('created_at');
  if (error) throw new Error(`Could not load the team: ${error.message}`);
  const ids = (rows ?? []).map((r) => r.user_id);
  const [{ data: profiles }, users] = await Promise.all([
    sb.from('profiles').select('id, full_name, avatar_url').in('id', ids),
    Promise.all(ids.map((id) => sb.auth.admin.getUserById(id).then((r) => [id, r.data.user?.email ?? null] as const, () => [id, null] as const))),
  ]);
  const emails = new Map(users);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return (rows ?? []).map((r) => ({
    userId: r.user_id,
    name: byId.get(r.user_id)?.full_name ?? null,
    email: emails.get(r.user_id) ?? null,
    avatarUrl: byId.get(r.user_id)?.avatar_url ?? null,
    role: r.role as Role,
    joinedAt: r.created_at,
    isYou: r.user_id === me,
  }));
}

export async function openInvites(sb: ServiceClient, workspaceId: string): Promise<InviteView[]> {
  const { data, error } = await sb
    .from('workspace_invites')
    .select('id, email, role, expires_at, created_at')
    .eq('workspace_id', workspaceId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load the invites: ${error.message}`);
  return (data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role as InviteView['role'], expiresAt: i.expires_at, createdAt: i.created_at }));
}

/** Who may change whose role: nobody touches the owner, and only the owner manages admins. */
export function canManage(actor: Role, target: Role, newRole?: Role): boolean {
  if (target === 'owner' || newRole === 'owner') return false;
  if (actor === 'owner') return true;
  if (actor !== 'admin') return false;
  return target !== 'admin' && newRole !== 'admin';
}

export interface InviteLookup {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: string;
  state: 'open' | 'expired' | 'used' | 'revoked';
}

export async function findInvite(sb: ServiceClient, token: string): Promise<InviteLookup | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { data: inv } = await sb.from('workspace_invites').select('*').eq('token_hash', sha256Hex(token)).maybeSingle();
  if (!inv) return null;
  const { data: ws } = await sb.from('workspaces').select('name').eq('id', inv.workspace_id).maybeSingle();
  const state = inv.revoked_at ? 'revoked' : inv.accepted_at ? 'used' : new Date(inv.expires_at).getTime() < Date.now() ? 'expired' : 'open';
  return { id: inv.id, workspaceId: inv.workspace_id, workspaceName: ws?.name ?? 'A workspace', email: inv.email, role: inv.role, state };
}

/** Adds the signed-in person to the workspace and makes it the one they open by default. */
export async function acceptInvite(sb: ServiceClient, token: string, user: { id: string; email: string | null }) {
  const inv = await findInvite(sb, token);
  if (!inv) throw new AppError('not_found', 'This invite link is not valid.', 404);
  if (inv.state !== 'open') throw new AppError('invite_closed', inv.state === 'expired' ? 'This invite has expired. Ask for a new one.' : 'This invite was already used or was withdrawn.', 410);
  if (!user.email || user.email.toLowerCase() !== inv.email) throw new AppError('wrong_account', `This invite is for ${inv.email}. Sign in with that email to accept it.`, 403);
  const { data: existing } = await sb.from('workspace_members').select('role').eq('workspace_id', inv.workspaceId).eq('user_id', user.id).maybeSingle();
  if (!existing) {
    const { error } = await sb.from('workspace_members').insert({ workspace_id: inv.workspaceId, user_id: user.id, role: inv.role });
    if (error) throw new Error(`Could not join the workspace: ${error.message}`);
  }
  // Only the first acceptance wins; a second tab gets the "already used" message.
  const { data: claimed } = await sb.from('workspace_invites').update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq('id', inv.id).is('accepted_at', null).select('id').maybeSingle();
  if (!claimed && !existing) throw new AppError('invite_closed', 'This invite was already used.', 410);
  await sb.from('profiles').update({ default_workspace_id: inv.workspaceId }).eq('id', user.id);
  await sb.from('activity').insert({ workspace_id: inv.workspaceId, actor_id: user.id, verb: 'team.joined', object_type: 'workspace', object_id: inv.workspaceId, data: { role: inv.role } as never });
  return { workspaceId: inv.workspaceId };
}
