import Link from 'next/link';
import type { ReactNode } from 'react';
import { LEGAL_UPDATED } from '@/lib/site';

const updated = LEGAL_UPDATED.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Public contact address for privacy and legal questions, set at build time. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

/** Long-form page with readable type: privacy, terms and data deletion. */
export function LegalPage({ eyebrow, title, intro, sections, children }: { eyebrow: string; title: string; intro: ReactNode; sections: { id: string; label: string }[]; children: ReactNode }) {
  return (
    <main className="mx-auto grid max-w-6xl gap-12 px-4 pt-32 pb-24 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-28 space-y-1 text-sm">
          <p className="pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">On this page</p>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block rounded-md py-1 text-muted-foreground transition-colors hover:text-foreground">
              {s.label}
            </a>
          ))}
        </div>
      </nav>
      <article className="min-w-0 max-w-3xl">
        <header className="space-y-4 border-b pb-8">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">{eyebrow}</p>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Last updated <time dateTime={LEGAL_UPDATED.toISOString().slice(0, 10)}>{updated}</time>
          </p>
          <div className="text-[15px] leading-relaxed text-muted-foreground">{intro}</div>
        </header>
        <div className="text-[15px] leading-relaxed text-foreground/85 [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
      </article>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 pt-10">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** How to reach the operator: the configured address, or the self-serve tools when none is set. */
export function ContactLine() {
  return CONTACT_EMAIL ? (
    <p>
      Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We answer privacy requests within 30 days.
    </p>
  ) : (
    <p>
      You can see, download and delete your data yourself from inside the studio. The <Link href="/data-deletion">data deletion page</Link> explains each step.
    </p>
  );
}

/** Third-party pages where people remove an app's access from their own account. */
export const PLATFORM_ACCESS_LINKS = [
  { label: 'Google and YouTube', href: 'https://myaccount.google.com/permissions' },
  { label: 'Facebook and Instagram (through Facebook)', href: 'https://www.facebook.com/settings?tab=business_tools' },
  { label: 'X', href: 'https://x.com/settings/connected_apps' },
] as const;
