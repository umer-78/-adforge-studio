import type { ReactNode } from 'react';

/** Bare layout for printable pages (storyboard decks): no app chrome, light paper colours. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-neutral-300 text-neutral-900 print:bg-white">{children}</div>;
}
