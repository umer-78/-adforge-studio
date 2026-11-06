'use client';

import { useEffect, type CSSProperties } from 'react';

// Inline styles on purpose: this page replaces the root layout, and importing the global stylesheet
// into this client file puts it in the client graph, which makes the dev server reload in a loop.
const font = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const s = {
  body: { margin: 0, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px', textAlign: 'center', background: '#07070b', color: '#ecedee', fontFamily: font, WebkitFontSmoothing: 'antialiased' },
  title: { margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' },
  text: { margin: '8px 0 0', maxWidth: 384, fontSize: 14, lineHeight: 1.5, color: '#8a8f98' },
  row: { marginTop: 24, display: 'flex', gap: 8 },
  button: { height: 36, padding: '0 16px', border: 0, borderRadius: 8, background: '#7c5cff', color: '#ffffff', fontSize: 14, fontWeight: 500, fontFamily: font, cursor: 'pointer' },
  link: { display: 'flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.12)', color: '#ecedee', fontSize: 14, fontWeight: 500, textDecoration: 'none', boxSizing: 'border-box' },
  digest: { marginTop: 24, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: '#8a8f98' },
} satisfies Record<string, CSSProperties>;

/** Last-resort fallback when the root layout itself fails; it renders its own document. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && 'digest' in error && typeof error.digest === 'string' ? error.digest : null;
  return (
    <html lang="en" style={{ colorScheme: 'dark' }}>
      <body style={s.body}>
        <title>Something went wrong · AdForge Studio</title>
        <h1 style={s.title}>Something went wrong</h1>
        <p style={s.text}>AdForge Studio could not load. Try again in a moment.</p>
        <div style={s.row}>
          <button type="button" onClick={() => retry()} style={s.button}>
            Try again
          </button>
          {/* A plain link: the app's router may be what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={s.link}>
            Home
          </a>
        </div>
        {digest && <p style={s.digest}>Error reference {digest}</p>}
      </body>
    </html>
  );
}
