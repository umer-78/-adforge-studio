import { serviceClient } from '@adforge/core/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AcceptInvite } from '@/components/team/accept-invite';
import { Button } from '@/components/ui/button';
import { sessionClient } from '@/lib/server/supabase';
import { findInvite } from '@/lib/server/team';

export const metadata: Metadata = { title: 'Join a workspace', robots: { index: false, follow: false }, referrer: 'no-referrer' };

type Params = { params: Promise<{ token: string }> };

export default function InvitePage({ params }: Params) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
          <Invite params={params} />
        </Suspense>
      </div>
    </main>
  );
}

const ROLE_TEXT: Record<string, string> = {
  admin: 'an admin, who can manage the team and approve posts',
  editor: 'an editor, who can create, edit and publish',
  viewer: 'a viewer, who can see the work and results',
};

async function Invite({ params }: Params) {
  const { token } = await params;
  const invite = await findInvite(serviceClient(), token).catch(() => null);
  if (!invite) return <Message title="This invite link does not work" body="Check that the whole link was copied, or ask for a new one." />;
  if (invite.state !== 'open') {
    const body = invite.state === 'expired' ? 'Invite links last 7 days. Ask the person who invited you for a new one.' : invite.state === 'used' ? 'It was already used. If that was you, open the studio.' : 'It was withdrawn. Ask for a new one if you still need access.';
    return <Message title={invite.state === 'expired' ? 'This invite has expired' : 'This invite is closed'} body={body} action={invite.state === 'used' ? { href: '/dashboard', label: 'Open the studio' } : undefined} />;
  }
  const session = await sessionClient();
  const { data } = await session.auth.getClaims();
  const email = (data?.claims?.email as string | undefined)?.toLowerCase() ?? null;
  const intro = (
    <>
      <p className="text-sm text-muted-foreground">You are invited to</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words">{invite.workspaceName}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        as {ROLE_TEXT[invite.role] ?? invite.role}. The invite is for <span className="font-medium text-foreground">{invite.email}</span>.
      </p>
    </>
  );
  if (!data?.claims) {
    return (
      <div className="space-y-6">
        <div>{intro}</div>
        <Button size="lg" className="w-full" asChild>
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in or create an account</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">Use {invite.email}. You come back here to join.</p>
      </div>
    );
  }
  if (email !== invite.email) {
    return (
      <div className="space-y-6">
        <div>{intro}</div>
        <p className="rounded-xl border border-warning/40 p-3 text-sm">
          You are signed in as <span className="font-medium">{email ?? 'another account'}</span>. Sign out, then sign in with {invite.email} to accept.
        </p>
        <form action="/auth/signout" method="post">
          <input type="hidden" name="next" value={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} />
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>{intro}</div>
      <AcceptInvite token={token} workspace={invite.workspaceName} />
    </div>
  );
}

function Message({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="space-y-3 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action && (
        <Button asChild variant="outline">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
