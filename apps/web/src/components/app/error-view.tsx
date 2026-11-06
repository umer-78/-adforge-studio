'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The digest matches the server log entry of an error thrown while rendering on the server. */
function digestOf(error: unknown): string | null {
  return error instanceof Error && 'digest' in error && typeof error.digest === 'string' ? error.digest : null;
}

/** Fallback for a page that threw: what happened, a retry, and a way out. */
export function ErrorView({ error, retry, home = '/', homeLabel = 'Go to the home page', className }: { error: unknown; retry: () => void; home?: string; homeLabel?: string; className?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = digestOf(error);
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-4 py-16 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" />
      </div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">This page hit an error. Your work is saved; try again, and if it keeps happening, reload the page.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw />
          Try again
        </Button>
        <Link href={home} className={buttonVariants({ variant: 'secondary' })}>
          {homeLabel}
        </Link>
      </div>
      {digest && <p className="mt-6 font-mono text-[11px] text-muted-foreground">Error reference {digest}</p>}
    </div>
  );
}
