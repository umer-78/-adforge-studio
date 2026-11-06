import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLine, LegalPage, Section } from '@/components/marketing/legal';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The rules for using AdForge Studio: your content, AI output, consent, licenses, connected platforms and costs.',
  alternates: { canonical: '/terms' },
};

const SECTIONS = [
  { id: 'using', label: 'Using the studio' },
  { id: 'content', label: 'Your content' },
  { id: 'ai', label: 'AI output' },
  { id: 'consent', label: 'Voices and likenesses' },
  { id: 'licenses', label: 'Music and licenses' },
  { id: 'rules', label: 'What is not allowed' },
  { id: 'platforms', label: 'Connected platforms and ads' },
  { id: 'costs', label: 'Costs and budgets' },
  { id: 'sharing', label: 'Share links' },
  { id: 'service', label: 'The service' },
  { id: 'liability', label: 'Liability' },
  { id: 'ending', label: 'Ending' },
  { id: 'changes', label: 'Changes' },
  { id: 'contact', label: 'Contact' },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of service"
      sections={SECTIONS}
      intro={
        <p>
          These terms cover your use of AdForge Studio, a website for making, editing and publishing ad videos and photos. “We” means the operator of this AdForge Studio site. By signing in or using the site you agree to these terms and to the <Link href="/privacy">privacy policy</Link>.
        </p>
      }
    >
      <Section id="using" title="Using the studio">
        <ul>
          <li>You need an account to use the studio. Access can be limited to invited email addresses.</li>
          <li>Keep your sign-in details safe. You are responsible for what happens under your account and under the API keys you create.</li>
          <li>You must be at least 16, and old enough to agree to these terms where you live.</li>
          <li>If you use the studio for a business, you confirm you are allowed to accept these terms for it.</li>
        </ul>
      </Section>

      <Section id="content" title="Your content">
        <p>
          You keep all rights to what you upload and make. You give us permission to store, copy, process and transmit it only as needed to run the features you use, for example to make previews, send a file to the AI service you picked, render an export, or post it to an account you connected. This permission ends when you delete the content, apart from copies in backups until they expire.
        </p>
        <p>You confirm that you have the rights to everything you upload, and that using it in the studio does not break any law or anyone else’s rights.</p>
      </Section>

      <Section id="ai" title="AI output">
        <ul>
          <li>Generated images, video, voice, music and text can be wrong, or can look or sound like existing work. Check output before you publish it.</li>
          <li>You are responsible for how you use the output, including making sure it is accurate and does not infringe anyone’s rights.</li>
          <li>Follow each platform’s rules on labelling AI content. The studio can add a “Made with AI” label for you.</li>
          <li>AI services may refuse a request or flag it as unsafe. The studio also runs its own content checks and may block a request.</li>
        </ul>
      </Section>

      <Section id="consent" title="Voices and likenesses">
        <p>
          Only clone a voice or a face, or dub someone’s speech, with that person’s clear permission. Before these features run on a real person, the studio asks for a consent record. Recording false consent, or cloning someone without it, breaks these terms. We may remove any content that uses a voice or likeness without permission.
        </p>
      </Section>

      <Section id="licenses" title="Music and licenses">
        <ul>
          <li>Use only music, footage, fonts and other material you have a license for.</li>
          <li>The studio checks the license of the audio in an edit and warns you when it is not cleared for ads. That check uses the license information attached to each file. It is a help, not legal advice.</li>
          <li>The sound effects, templates, looks and other assets built into the studio may be used in the ads you make with it.</li>
        </ul>
      </Section>

      <Section id="rules" title="What is not allowed">
        <ul>
          <li>Anything illegal, or ads that break the law or a platform’s advertising policies.</li>
          <li>Deceptive or misleading ads, fake reviews or endorsements, or pretending to be another person or brand.</li>
          <li>Sexual content involving minors, content that sexualizes real people without consent, harassment, hate, or threats.</li>
          <li>Malware, spam, or content meant to collect people’s personal data without their knowledge.</li>
          <li>Trying to get around security, rate limits or budgets, reaching other people’s data, or overloading the service.</li>
          <li>Reselling the service, or scraping it or copying it in bulk.</li>
        </ul>
      </Section>

      <Section id="platforms" title="Connected platforms and ads">
        <ul>
          <li>When you connect an account, you allow the studio to post, schedule, read results, or manage ads on it, within the permissions you granted. You can disconnect at any time.</li>
          <li>New ads are created paused, so nothing spends money until you turn it on yourself. You are responsible for your ad spend and for following each platform’s policies.</li>
          <li>Each platform’s own terms apply to what you publish there. Platforms can change or limit their features, which can change what the studio can do.</li>
          <li>
            The studio uses YouTube API Services. By using its YouTube features you agree to be bound by the{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
              YouTube Terms of Service
            </a>
            .
          </li>
        </ul>
      </Section>

      <Section id="costs" title="Costs and budgets">
        <ul>
          <li>Many AI features are run by outside AI services that charge for each job, often on the API key you added. The studio shows an estimate before a paid job runs.</li>
          <li>Estimates can differ from the provider’s final charge. The provider’s bill is what counts.</li>
          <li>Jobs stop when your workspace reaches the monthly budget you set, unless you turned the hard stop off.</li>
        </ul>
      </Section>

      <Section id="sharing" title="Share links">
        <p>Anyone with a share link can view what it contains, without an account. You choose whether it has a password, an end date, and whether downloads are allowed, and you can turn it off at any time. Only share links with people you trust with the content.</p>
      </Section>

      <Section id="service" title="The service">
        <p>
          We work to keep the studio available and your data safe, but the service is provided “as is”. We do not promise it will always be available, error-free, or fit for a particular purpose. Features can change or be removed. Keep your own copies of files that matter to you.
        </p>
      </Section>

      <Section id="liability" title="Liability">
        <p>
          As far as the law allows, we are not liable for indirect or consequential losses, lost profits or revenue, lost data, or ad spend, and our total liability for any claim about the service is limited to the amount you paid us for it in the twelve months before the claim. Nothing in these terms limits liability that the law does not allow us to limit.
        </p>
        <p>You agree to cover claims brought against us because of content you published or a breach of these terms by you.</p>
      </Section>

      <Section id="ending" title="Ending">
        <p>
          You can stop using the studio and delete your account at any time from Settings. See <Link href="/data-deletion">data deletion</Link>. We may suspend or close an account that breaks these terms, or that puts the service or other people at risk.
        </p>
      </Section>

      <Section id="changes" title="Changes">
        <p>We may update these terms. When we do, this page and the date at the top change. If you keep using the studio after a change, the new terms apply.</p>
      </Section>

      <Section id="contact" title="Contact">
        <ContactLine />
      </Section>
    </LegalPage>
  );
}
