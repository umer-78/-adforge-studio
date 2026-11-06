import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/app/logo';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_42%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]" />
      <Link href="/" aria-label="AdForge Studio home" className="absolute top-6 left-4 sm:left-8">
        <Logo />
      </Link>
      <p aria-hidden className="relative font-display text-[clamp(6rem,24vw,13rem)] leading-none tracking-tight text-foreground/90 italic">
        404
      </p>
      <h1 className="relative mt-2 text-xl font-semibold tracking-tight">This page doesn’t exist</h1>
      <p className="relative mt-2 max-w-sm text-sm text-muted-foreground">The link may be old, or the address may have a typo.</p>
      <div className="relative mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
          Go to the home page
        </Link>
        <Link href="/dashboard" className={buttonVariants({ variant: 'brand' })}>
          Open the studio
        </Link>
      </div>
    </main>
  );
}
