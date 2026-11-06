import { serviceClient } from '@adforge/core/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ContactLine, LegalPage, PLATFORM_ACCESS_LINKS, Section } from '@/components/marketing/legal';
import { Notice } from '@/components/ui/misc';

export const metadata: Metadata = {
  title: 'Data deletion',
  description: 'How to delete your files, connected accounts or whole AdForge Studio account, and how Facebook deletion requests work.',
  alternates: { canonical: '/data-deletion' },
};

const SECTIONS = [
  { id: 'account', label: 'Delete your account' },
  { id: 'files', label: 'Delete files' },
  { id: 'accounts', label: 'Disconnect accounts' },
  { id: 'other', label: 'Keys and share links' },
  { id: 'facebook', label: 'Facebook and Instagram' },
  { id: 'platforms', label: 'Other platforms' },
  { id: 'help', label: 'Help' },
];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DataDeletionPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Data deletion"
      sections={SECTIONS}
      intro={<p>You can delete anything you stored in AdForge Studio yourself, at any time. This page explains each way to do it, what it removes, and how to remove the site’s access on the platforms you connected.</p>}
    >
      <Suspense fallback={null}>
        <RequestStatus searchParams={searchParams} />
      </Suspense>

      <Section id="account" title="Delete your account">
        <ol>
          <li>Sign in and open Settings.</li>
          <li>Under Delete account, choose Delete account and type DELETE to confirm.</li>
        </ol>
        <p>This permanently deletes:</p>
        <ul>
          <li>Every workspace you own, and everything in it: uploaded and generated files, edits, scripts, prompts, brand kits, products, competitor tracking, posts and their results, ads and their results, share links, consent records, usage and activity history.</li>
          <li>Every connected social and ad account in those workspaces, with its sign-in tokens, and every AI service key.</li>
          <li>Your profile, your membership in workspaces other people own, and your sign-in.</li>
        </ul>
        <p>Database records are deleted at once. Files are removed from storage by a background job within minutes. Copies in our providers’ backups are removed as those backups expire. A deleted account can’t be restored.</p>
      </Section>

      <Section id="files" title="Delete files">
        <ol>
          <li>In the Library, select the files and choose Trash. They stay in the trash for your workspace’s trash period, 30 days unless you changed it in Settings.</li>
          <li>To delete them sooner, open the trash and choose Empty trash, or select files there and choose Delete forever.</li>
        </ol>
        <p>Deleting a file for good removes the original, every copy made from it (previews, proxies, thumbnails, versions) and its streaming copy.</p>
      </Section>

      <Section id="accounts" title="Disconnect accounts">
        <p>
          In Settings, open Social accounts or Ad accounts and choose Disconnect. The account’s sign-in tokens are deleted right away and posts waiting to go out on it are canceled. If you already published through it, its name and past results stay in your workspace so your history still reads correctly. Deleting your account removes those too.
        </p>
      </Section>

      <Section id="other" title="Keys and share links">
        <ul>
          <li>AI service keys: Settings, AI providers, Remove key. The stored key is deleted.</li>
          <li>Share links: open the file or project, choose Share, and revoke the link. It stops working at once.</li>
        </ul>
      </Section>

      <Section id="facebook" title="Facebook and Instagram">
        <p>
          You can remove AdForge Studio in your{' '}
          <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noopener noreferrer">
            Facebook settings under Business integrations
          </a>
          . If you also ask for your data to be deleted, Facebook tells us, and we delete the Facebook Pages, Instagram accounts and Meta ad accounts that your Facebook login connected, in every workspace, with their tokens, post results and ad results.
        </p>
        <p>Facebook then shows you a confirmation code and a link back to this page, where you can check that the deletion is done.</p>
        <p>If you only remove the app without asking for deletion, those accounts are disconnected: their tokens are deleted and pending posts canceled.</p>
      </Section>

      <Section id="platforms" title="Other platforms">
        <p>Disconnecting in the studio deletes our copy of the tokens. To also remove AdForge Studio from the platform’s list of apps with access to your account:</p>
        <ul>
          {PLATFORM_ACCESS_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            </li>
          ))}
          <li>TikTok, LinkedIn and Pinterest: open the connected apps list in that app’s privacy or security settings.</li>
        </ul>
      </Section>

      <Section id="help" title="Help">
        <ContactLine />
        <p>
          The <Link href="/privacy">privacy policy</Link> explains what is collected and how long it is kept.
        </p>
      </Section>
    </LegalPage>
  );
}

const CODE = /^[A-Za-z0-9]{16,40}$/;

/** Shows the result of a Facebook deletion request (?code=) or of an account deletion (?deleted=1). */
async function RequestStatus({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  if (sp.deleted === '1') {
    return (
      <Notice tone="success" title="Your account was deleted" className="mt-8">
        Your workspaces and sign-in are gone. Your files are being removed from storage now.
      </Notice>
    );
  }
  const code = typeof sp.code === 'string' ? sp.code.trim() : null;
  if (!code) return null;
  if (!CODE.test(code)) {
    return (
      <Notice tone="warning" title="That confirmation code is not valid" className="mt-8">
        Check that you copied the whole code from Facebook.
      </Notice>
    );
  }
  let row: { status: string; accounts_removed: number; created_at: string; completed_at: string | null } | null = null;
  try {
    const { data, error } = await serviceClient().from('data_deletion_requests').select('status, accounts_removed, created_at, completed_at').eq('code', code).maybeSingle();
    if (error) throw error;
    row = data;
  } catch {
    return (
      <Notice tone="warning" title="The status could not be checked right now" className="mt-8">
        Try again in a few minutes.
      </Notice>
    );
  }
  if (!row) {
    return (
      <Notice tone="warning" title="No request with that code" className="mt-8">
        Confirmation codes can be checked for 90 days after the request.
      </Notice>
    );
  }
  const when = new Date(row.completed_at ?? row.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const n = row.accounts_removed;
  return row.status === 'completed' ? (
    <Notice tone="success" title="Deletion completed" className="mt-8">
      Request {code} was completed on {when}. {n === 0 ? 'No connected accounts were stored for your Facebook login.' : `${n} connected account${n === 1 ? ' was' : 's were'} deleted, with ${n === 1 ? 'its' : 'their'} tokens and results.`}
    </Notice>
  ) : (
    <Notice tone="info" title="Deletion in progress" className="mt-8">
      Request {code} was received on {when} and is being processed.
    </Notice>
  );
}
