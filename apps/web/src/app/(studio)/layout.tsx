import type { ReactNode } from 'react';

/** Full-screen workspaces (the video editor) without the app sidebar and header. */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return <div className="h-dvh overflow-hidden bg-background">{children}</div>;
}
