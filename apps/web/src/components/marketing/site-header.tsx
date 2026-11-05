'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { Logo } from '@/components/app/logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Magnetic } from './magnetic';

const NAV = [
  { hash: 'studio', label: 'Studio' },
  { hash: 'workflow', label: 'How it works' },
  { hash: 'safety', label: 'Safety & cost' },
];

function onScroll(cb: () => void) {
  window.addEventListener('scroll', cb, { passive: true });
  return () => window.removeEventListener('scroll', cb);
}

/** Floating header: clear over the hero, frosted once the page scrolls. */
export function SiteHeader() {
  const home = usePathname() === '/';
  const scrolled = useSyncExternalStore(onScroll, () => window.scrollY > 12, () => false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6">
      <div
        className={cn(
          'mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 rounded-2xl border px-3 transition-[background-color,border-color,box-shadow] duration-500 sm:px-4',
          scrolled ? 'glass border-border shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)]' : 'border-transparent',
        )}
      >
        <Link href="/" aria-label="AdForge Studio home">
          <Logo />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <a key={n.hash} href={home ? `#${n.hash}` : `/#${n.hash}`} className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}>
            Sign in
          </Link>
          <Magnetic>
            <Link href="/dashboard" className={buttonVariants({ variant: 'brand', size: 'sm' })}>
              Open the studio
            </Link>
          </Magnetic>
        </div>
      </div>
    </header>
  );
}
