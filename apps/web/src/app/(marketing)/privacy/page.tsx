import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLine, LegalPage, PLATFORM_ACCESS_LINKS, Section } from '@/components/marketing/legal';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What AdForge Studio collects, why, who processes it, how long it is kept and how to delete it.',
  alternates: { canonical: '/privacy' },
};

const SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'collect', label: 'What we collect' },
  { id: 'use', label: 'How we use it' },
  { id: 'share', label: 'Who processes it' },
  { id: 'google', label: 'YouTube and Google' },
  { id: 'cookies', label: 'Cookies and storage' },
  { id: 'retention', label: 'How long we keep it' },
  { id: 'security', label: 'Security' },
  { id: 'rights', label: 'Your choices' },
  { id: 'children', label: 'Children' },
  { id: 'changes', label: 'Changes' },
  { id: 'contact', label: 'Contact' },
];

const PROCESSORS: { name: string; purpose: string; when: string }[] = [
  { name: 'Supabase', purpose: 'Sign-in, the database and file storage', when: 'Always' },
  { name: 'Vercel', purpose: 'Hosts this website', when: 'Always' },
  { name: 'Railway', purpose: 'Runs the background worker that processes files, renders exports and publishes posts', when: 'Always' },
  { name: 'Amazon S3 or Cloudflare R2', purpose: 'File storage, when the site is set up to use it instead of Supabase Storage', when: 'If configured' },
  { name: 'Mux', purpose: 'Video streaming for playback in the studio', when: 'If configured' },
  { name: 'Anthropic', purpose: 'Writing scripts, captions, hooks and prompts, describing and tagging your files, planning agent runs and reviewing ads', when: 'When you use those features' },
  { name: 'OpenAI', purpose: 'Search over your library, content safety checks and speech-to-text', when: 'When you use those features' },
  { name: 'fal, Replicate and Agnes AI', purpose: 'Generating and enhancing images and video', when: 'When you run a generation' },
  { name: 'ElevenLabs', purpose: 'Voiceovers, voice cloning, dubbing, sound effects and speech-to-text', when: 'When you use voice features' },
  { name: 'Ayrshare', purpose: 'Posting to social networks through Ayrshare instead of a direct connection', when: 'If you connect it' },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      sections={SECTIONS}
      intro={
        <p>
          AdForge Studio is a website for making, editing and publishing ad videos and photos. This page explains what it collects, why, who processes it on its behalf, how long it is kept and how you can delete it. “We” means the operator of this AdForge Studio site.
        </p>
      }
    >
      <Section id="summary" title="Summary">
        <ul>
          <li>We collect what the studio needs to work: your sign-in details, the files and text you create, and the accounts you choose to connect.</li>
          <li>We do not sell your data, show you ads, or use your content to train AI models.</li>
          <li>Your content goes to an AI service only when you run a feature that uses it, and to a social or ad platform only when you publish or launch there.</li>
          <li>Sign-in tokens for connected accounts and your AI service keys are stored encrypted.</li>
          <li>
            You can delete files, disconnect accounts, or delete your whole account at any time. See <Link href="/data-deletion">data deletion</Link>.
          </li>
        </ul>
      </Section>

      <Section id="collect" title="What we collect">
        <h3>Your account</h3>
        <p>Your email address, your name, and a profile picture if your sign-in provider (for example Google) shares one. Supabase Auth also records when you sign in.</p>
        <h3>What you create and upload</h3>
        <p>Files you upload, media the studio generates for you, edits and timelines, scripts, prompts, captions, brand kits, product details and pages you import, competitor ads you track, notes and tags. Files keep the metadata they were uploaded with until you delete them.</p>
        <h3>Accounts you connect</h3>
        <p>
          When you connect YouTube, TikTok, Instagram, Facebook, LinkedIn, X or Pinterest, or a Meta or TikTok ad account, we store the account ID, name, handle and picture, the permissions you granted, and the access tokens the platform issues. We also store the posts and ads you create through the studio and the results the platform reports for them, such as views, likes, comments, shares, reach and spend.
        </p>
        <h3>AI service keys</h3>
        <p>If you add your own key for an AI service, we store it encrypted and use it only to run the jobs you start.</p>
        <h3>Consent records</h3>
        <p>Before a voice or face can be cloned, the studio records who gave consent, the statement they agreed to, the time, the IP address and the browser it was given from.</p>
        <h3>Share links</h3>
        <p>The settings of each link you create, how many times it was opened, and a scrambled (hashed) copy of its password if you set one.</p>
        <h3>Technical data</h3>
        <p>Your IP address is used to limit how many requests can be made in a short time. Our hosting providers keep standard server logs, which include IP addresses, for a limited time.</p>
      </Section>

      <Section id="use" title="How we use it">
        <ul>
          <li>To run the features you ask for: storing and processing files, generating media, writing copy, rendering exports and showing analytics.</li>
          <li>To publish posts and create ads on the accounts you connected, only when you publish, schedule or launch them. New ads are created paused.</li>
          <li>To show cost estimates and stop jobs at the monthly budget you set.</li>
          <li>To keep the service secure and working: preventing abuse, fixing errors and enforcing limits.</li>
        </ul>
        <p>We use your data because it is needed to provide the service you asked for, and for our legitimate interest in keeping it secure. We do not use it for advertising or profiling, and we do not sell or rent it.</p>
      </Section>

      <Section id="share" title="Who processes it">
        <p>These services process data on our behalf, only for the purposes listed:</p>
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-surface-2/60 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Service</th>
                <th scope="col" className="px-4 py-2.5 font-medium">What it does</th>
                <th scope="col" className="px-4 py-2.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {PROCESSORS.map((p) => (
                <tr key={p.name}>
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap text-foreground">{p.name}</td>
                  <td className="px-4 py-2.5">{p.purpose}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{p.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          AI services receive only what a job needs: the prompt, text and files you chose for it. Each processes that data under its own API terms. Social and ad platforms receive the posts and ads you publish there, which then fall under their own terms and privacy policies.
        </p>
        <p>We may also disclose data if the law requires it, or to protect the rights and safety of people using the service.</p>
        <p>These services may store data in countries other than yours. They protect it under their own security programs and data processing terms.</p>
      </Section>

      <Section id="google" title="YouTube and Google">
        <p>
          AdForge Studio uses YouTube API Services to upload videos to the channels you connect and to read their performance. Google’s handling of your data is covered by the{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Google Privacy Policy
          </a>
          .
        </p>
        <p>
          AdForge Studio’s use and transfer of information received from Google APIs follows the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements.
        </p>
        <p>
          Besides disconnecting the channel in the studio, you can remove AdForge Studio’s access at any time on{' '}
          <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener noreferrer">
            Google’s security settings page
          </a>
          .
        </p>
      </Section>

      <Section id="cookies" title="Cookies and storage">
        <ul>
          <li>
            <strong>Sign-in cookies.</strong> Supabase Auth sets cookies that keep you signed in. They are needed for the studio to work.
          </li>
          <li>
            <strong>Browser storage.</strong> Your theme, editor layout, the AI model you last picked for each tool and similar preferences are kept in your browser’s local storage. Whether the intro animation has played is kept in session storage.
          </li>
        </ul>
        <p>There are no advertising, tracking or third-party analytics cookies.</p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <ul>
          <li>Your account, files and connected accounts: until you delete them or delete your account.</li>
          <li>Deleted files: kept in the trash for your workspace’s trash period (30 days unless you change it), then deleted permanently. You can empty the trash sooner.</li>
          <li>Sign-in tokens of a disconnected account: deleted when you disconnect it.</li>
          <li>IP addresses used for rate limits: at most one day.</li>
          <li>Records of incoming platform webhooks: 30 days. Background job records: 14 days, or 30 days for failed jobs.</li>
          <li>Confirmation codes of Facebook data deletion requests, with their status: 90 days.</li>
          <li>Copies in our providers’ backups: removed as those backups expire.</li>
        </ul>
      </Section>

      <Section id="security" title="Security">
        <ul>
          <li>Every database table is protected by row-level security, so a workspace’s data can only be read by its members.</li>
          <li>Platform tokens and AI service keys are encrypted with AES-256-GCM before they are stored, and are never sent to your browser.</li>
          <li>Files are private. The browser gets links that are signed and expire after an hour, or 15 minutes for downloads.</li>
          <li>API keys and share-link passwords are stored only as hashes.</li>
          <li>The site is served over HTTPS with a strict Content Security Policy, checks uploaded files and limits request rates.</li>
        </ul>
        <p>No system is perfectly secure. If a breach affects your data, we will tell the people affected as the law requires.</p>
      </Section>

      <Section id="rights" title="Your choices">
        <ul>
          <li>
            <strong>See and download.</strong> Everything you made or uploaded is in your Library, where each file can be downloaded.
          </li>
          <li>
            <strong>Correct.</strong> Change your name and workspace details in Settings.
          </li>
          <li>
            <strong>Disconnect.</strong> Remove a social account, ad account or AI key in Settings at any time.
          </li>
          <li>
            <strong>Delete.</strong> Delete files, or your whole account. The <Link href="/data-deletion">data deletion page</Link> lists every step.
          </li>
        </ul>
        <p>Depending on where you live, you may also have the right to ask for a copy of your data, to object to or restrict how it is used, and to complain to your local data protection authority.</p>
        <p>You can also remove AdForge Studio’s access from the platform side:</p>
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

      <Section id="children" title="Children">
        <p>AdForge Studio is not meant for anyone under 16, and we do not knowingly collect data from children.</p>
      </Section>

      <Section id="changes" title="Changes">
        <p>When this policy changes, this page is updated and so is the date at the top.</p>
      </Section>

      <Section id="contact" title="Contact">
        <ContactLine />
      </Section>
    </LegalPage>
  );
}
