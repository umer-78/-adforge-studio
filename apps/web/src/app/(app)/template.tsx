import type { ReactNode } from 'react';

/** Remounts on every navigation, so each page eases in as you arrive. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter h-full">{children}</div>;
}
