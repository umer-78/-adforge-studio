import { readableOn, type BioTheme } from '@adforge/core';
import type { CSSProperties } from 'react';
import type { BioPageView } from '@/lib/types';
import { cn } from '@/lib/utils';

const MODES = {
  light: { bg: '#fafafa', fg: '#0a0a0a', muted: '#52525b' },
  dark: { bg: '#09090b', fg: '#fafafa', muted: '#a1a1aa' },
} as const;

const RADIUS: Record<BioTheme['buttons'], string> = { rounded: '14px', pill: '9999px', square: '4px' };

export function bioColors(theme: BioTheme) {
  if (theme.mode === 'brand') {
    const fg = readableOn(theme.accent);
    return { bg: theme.accent, fg, muted: fg === '#ffffff' ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.72)', button: fg, buttonText: theme.accent };
  }
  const m = MODES[theme.mode];
  return { bg: m.bg, fg: m.fg, muted: m.muted, button: theme.accent, buttonText: readableOn(theme.accent) };
}

/**
 * The public link page. In preview the buttons open the destination directly so testing a link
 * does not count as a click.
 */
export function BioPage({ page, preview = false, className }: { page: Pick<BioPageView, 'slug' | 'title' | 'bio' | 'avatarUrl' | 'theme' | 'links'>; preview?: boolean; className?: string }) {
  const c = bioColors(page.theme);
  const links = page.links.filter((l) => l.enabled);
  const name = page.title || `@${page.slug}`;
  return (
    <div className={cn('flex min-h-full flex-col items-center px-5 py-12', className)} style={{ background: c.bg, color: c.fg } as CSSProperties}>
      <main className="flex w-full max-w-md flex-1 flex-col items-center text-center">
        {page.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.avatarUrl} alt="" width={96} height={96} className="size-24 rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${c.bg}, 0 0 0 5px ${c.button}` }} />
        ) : (
          <div aria-hidden className="grid size-24 place-items-center rounded-full text-3xl font-semibold" style={{ background: c.button, color: c.buttonText }}>
            {name.replace(/^@/, '').slice(0, 1).toUpperCase()}
          </div>
        )}
        <h1 className="mt-4 text-xl font-semibold break-words">{name}</h1>
        {page.bio && (
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line" style={{ color: c.muted }}>
            {page.bio}
          </p>
        )}
        <ul className="mt-8 w-full space-y-3">
          {links.map((l) => (
            <li key={l.id}>
              <a
                href={preview ? l.url : `/api/bio/go/${l.id}`}
                {...(preview ? { target: '_blank' } : {})}
                rel="nofollow noopener noreferrer"
                className="flex min-h-14 w-full items-center justify-center px-5 py-3 text-[15px] font-medium break-words transition-transform outline-none hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-offset-2 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:scale-100"
                style={{ background: c.button, color: c.buttonText, borderRadius: RADIUS[page.theme.buttons], ['--tw-ring-color' as string]: c.fg, ['--tw-ring-offset-color' as string]: c.bg }}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        {!links.length && (
          <p className="mt-8 text-sm" style={{ color: c.muted }}>
            No links yet.
          </p>
        )}
      </main>
      <footer className="mt-12 text-xs" style={{ color: c.muted }}>
        Made with AdForge Studio
      </footer>
    </div>
  );
}
