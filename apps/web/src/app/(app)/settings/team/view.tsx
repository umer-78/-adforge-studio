'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, UserMinus, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsSection, SwitchRow } from '@/components/settings/shared';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Field, Notice, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/hooks/use-me';
import type { InviteView, TeamMemberView } from '@/lib/types';
import { copyText, timeAgo } from '@/lib/utils';

type Assignable = 'admin' | 'editor' | 'viewer';
const ROLE_INFO: Record<TeamMemberView['role'], string> = {
  owner: 'Everything, including billing limits and removing the workspace',
  admin: 'Everything except managing other admins; approves posts',
  editor: 'Creates, edits and publishes; posts may need approval',
  viewer: 'Sees the work and results; cannot change anything',
};

interface Team {
  members: TeamMemberView[];
  invites: InviteView[];
  canManage: boolean;
}

export function TeamView() {
  const qc = useQueryClient();
  const router = useRouter();
  const me = useMe();
  const team = useQuery({ queryKey: ['team'], queryFn: () => api.get<Team>('/team') });
  const myRole = me.data?.workspace.role;
  const isOwner = myRole === 'owner';
  const approvals = me.data?.workspace.settings.requirePostApproval === true;

  const setApprovals = useMutation({
    mutationFn: (on: boolean) => api.patch('/workspace', { settings: { requirePostApproval: on } }),
    onSuccess: (data, on) => {
      qc.setQueryData(['me'], data);
      toast.success(on ? 'Editors’ posts now wait for approval.' : 'Posts go out without approval.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Assignable }) => api.patch(`/team/members/${userId}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/team/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      toast.success('Removed from the workspace.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/team/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (team.isLoading) return <Skeleton className="h-[60vh] rounded-2xl" />;
  if (team.isError) return <Notice tone="error" title="Could not load the team">{errorMessage(team.error)}</Notice>;
  const { members, invites, canManage } = team.data!;
  const manageable = (m: TeamMemberView) => canManage && !m.isYou && m.role !== 'owner' && (isOwner || m.role !== 'admin');

  return (
    <div className="space-y-6">
      {canManage && <InviteForm isOwner={isOwner} />}

      <SettingsSection title="Members" description="Everyone in this workspace and what they can do.">
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar src={m.avatarUrl} name={m.name ?? m.email ?? '?'} className="size-9" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.name ?? m.email ?? 'Member'} {m.isYou && <span className="text-muted-foreground">(you)</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.email} · joined {timeAgo(m.joinedAt)}
                </div>
              </div>
              {manageable(m) ? (
                <Select
                  aria-label={`Role for ${m.name ?? m.email ?? 'member'}`}
                  value={m.role}
                  onValueChange={(role) => changeRole.mutate({ userId: m.userId, role: role as Assignable })}
                  options={(isOwner ? ['admin', 'editor', 'viewer'] : ['editor', 'viewer']).map((r) => ({ value: r, label: r[0]!.toUpperCase() + r.slice(1), hint: ROLE_INFO[r as Assignable] }))}
                  className="w-32"
                />
              ) : (
                <Badge variant={m.role === 'owner' ? 'default' : 'secondary'} className="capitalize" title={ROLE_INFO[m.role]}>
                  {m.role}
                </Badge>
              )}
              {(manageable(m) || (m.isYou && m.role !== 'owner')) && (
                <Confirm
                  title={m.isYou ? 'Leave this workspace?' : `Remove ${m.name ?? m.email}?`}
                  description={m.isYou ? 'You lose access to its files and posts until someone invites you again.' : 'They lose access right away. Their files and posts stay in the workspace.'}
                  confirmLabel={m.isYou ? 'Leave' : 'Remove'}
                  destructive
                  onConfirm={async () => {
                    await removeMember.mutateAsync(m.userId);
                    if (m.isYou) {
                      qc.clear();
                      router.push('/dashboard');
                    }
                  }}
                >
                  <Button size="icon-sm" variant="ghost" aria-label={m.isYou ? 'Leave workspace' : 'Remove member'}>
                    <UserMinus />
                  </Button>
                </Confirm>
              )}
            </li>
          ))}
        </ul>
      </SettingsSection>

      {canManage && invites.length > 0 && (
        <SettingsSection title="Waiting to join" description="Invite links not used yet. Each works once, for the email it was made for.">
          <ul className="divide-y">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{i.email}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="capitalize">{i.role}</span> · expires {new Date(i.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === i.id} onClick={() => revoke.mutate(i.id)}>
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}

      {canManage && (
        <SettingsSection title="Post approval" description="Have an admin check posts before they go out.">
          <SwitchRow
            label="Editors’ posts need approval"
            description="Posts and schedule changes by editors wait under Publish → Needs approval until an admin or the owner approves them. Admins’ own posts go out as usual."
            checked={approvals}
            disabled={setApprovals.isPending || !me.data}
            onCheckedChange={(v) => setApprovals.mutate(v)}
          />
        </SettingsSection>
      )}
    </div>
  );
}

function InviteForm({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Assignable>('editor');
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const invite = useMutation({
    mutationFn: () => api.post<{ invite: InviteView; url: string }>('/team/invites', { email, role }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['team'] });
      setLink({ email: r.invite.email, url: r.url });
      setEmail('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const copy = async (url: string) => {
    if (await copyText(url)) toast.success('Invite link copied.');
    else toast.error('Could not copy. Select the link and copy it.');
  };
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <SettingsSection title="Invite someone" description="Make an invite link and send it to them yourself, by chat or email. It works once, for that email address, for 7 days.">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (validEmail) invite.mutate();
        }}
      >
        <Field label="Email" htmlFor="invite-email" className="min-w-56 flex-1">
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" autoComplete="off" />
        </Field>
        <Field label="Role" className="w-40">
          <Select
            aria-label="Role"
            value={role}
            onValueChange={(v) => setRole(v as Assignable)}
            options={(isOwner ? ['admin', 'editor', 'viewer'] : ['editor', 'viewer']).map((r) => ({ value: r, label: r[0]!.toUpperCase() + r.slice(1), hint: ROLE_INFO[r as Assignable] }))}
          />
        </Field>
        <Button type="submit" loading={invite.isPending} disabled={!validEmail}>
          <UserPlus /> Make invite link
        </Button>
      </form>
      {link && (
        <Notice tone="success" title={`Invite link for ${link.email}`} className="mt-4" action={<Button size="xs" variant="outline" onClick={() => copy(link.url)}><Copy /> Copy</Button>}>
          <span className="flex items-center gap-1.5 break-all">
            <Link2 className="size-3.5 shrink-0" /> {link.url}
          </span>
          <span className="mt-1 block text-xs">Shown once. If it gets lost, make a new one; the old link stops working.</span>
        </Notice>
      )}
    </SettingsSection>
  );
}
