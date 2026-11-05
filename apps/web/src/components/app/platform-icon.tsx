import { cn } from '@/lib/utils';

export const PLATFORM_META: Record<string, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: '#FF0033' },
  tiktok: { label: 'TikTok', color: '#111111' },
  instagram: { label: 'Instagram', color: '#E1306C' },
  facebook: { label: 'Facebook', color: '#1877F2' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2' },
  x: { label: 'X', color: '#111111' },
  pinterest: { label: 'Pinterest', color: '#E60023' },
  meta: { label: 'Meta', color: '#0866FF' },
  ayrshare: { label: 'Ayrshare', color: '#5B5BD6' },
  other: { label: 'Other', color: '#6B7280' },
};

/** Simple platform glyphs on a brand-colored tile (nominative use, not official logos). */
export function PlatformIcon({ platform, className, plain }: { platform: string; className?: string; plain?: boolean }) {
  const meta = PLATFORM_META[platform] ?? PLATFORM_META.other!;
  const glyph = (() => {
    switch (platform) {
      case 'youtube':
        return <path d="M6 9.5c0-1.4 1.1-2.5 2.5-2.5h7c1.4 0 2.5 1.1 2.5 2.5v5c0 1.4-1.1 2.5-2.5 2.5h-7C7.1 17 6 15.9 6 14.5v-5Zm4.5.3v4.4l3.8-2.2-3.8-2.2Z" fill="currentColor" />;
      case 'tiktok':
        return <path d="M13.6 5.5h2.2c.2 1.5 1.3 2.7 2.7 2.9v2.2c-1-.1-1.9-.4-2.7-.9v4.6a3.9 3.9 0 1 1-3.9-3.9h.4v2.3a1.7 1.7 0 1 0 1.3 1.6V5.5Z" fill="currentColor" />;
      case 'instagram':
        return (
          <g fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="6" y="6" width="12" height="12" rx="3.6" />
            <circle cx="12" cy="12" r="2.8" />
            <circle cx="15.6" cy="8.4" r=".5" fill="currentColor" />
          </g>
        );
      case 'facebook':
        return <path d="M13.2 18v-5.2h1.8l.3-2.1h-2.1V9.4c0-.6.2-1 1-1h1.1V6.5c-.2 0-.9-.1-1.6-.1-1.6 0-2.7 1-2.7 2.8v1.5H9.2v2.1H11V18h2.2Z" fill="currentColor" />;
      case 'linkedin':
        return <path d="M7.2 9.6h2.2V17H7.2V9.6Zm1.1-3.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM10.8 9.6h2.1v1c.3-.6 1.1-1.2 2.2-1.2 2.3 0 2.7 1.5 2.7 3.5V17h-2.2v-3.6c0-.9 0-2-1.2-2s-1.4.9-1.4 1.9V17h-2.2V9.6Z" fill="currentColor" />;
      case 'x':
        return <path d="M6.5 6.5h3.3l2.6 3.6 3.1-3.6h1.4l-3.9 4.5 4.5 6.5h-3.3l-2.8-4-3.5 4H6.5l4.2-4.9-4.2-6.1Zm1.9 1 6.4 9h1l-6.4-9h-1Z" fill="currentColor" />;
      case 'pinterest':
        return <path d="M12.2 5.8c-3.6 0-5.4 2.6-5.4 4.7 0 1.3.5 2.4 1.5 2.8.2.1.3 0 .4-.2l.2-.6c0-.2 0-.3-.1-.4-.3-.4-.5-.9-.5-1.6 0-2.1 1.5-3.9 4-3.9 2.2 0 3.4 1.3 3.4 3.1 0 2.4-1 4.3-2.6 4.3-.9 0-1.5-.7-1.3-1.6.2-1 .7-2.2.7-2.9 0-.7-.4-1.2-1.1-1.2-.9 0-1.6.9-1.6 2.2 0 .8.3 1.3.3 1.3l-1.1 4.5c-.3 1.3 0 2.9 0 3.1 0 .1.1.1.2 0 .1-.1 1.1-1.3 1.4-2.5l.5-2.1c.3.5 1 1 1.9 1 2.5 0 4.2-2.3 4.2-5.3 0-2.3-1.9-4.4-5-4.4Z" fill="currentColor" />;
      case 'meta':
        return <path d="M5.5 14.2c0 1.5.8 2.5 2 2.5 1 0 1.7-.4 3.1-2.6l1.3-2.1.6.9 1.2 2c1.1 1.7 1.9 1.8 2.8 1.8 1.4 0 2.1-1.2 2.1-3.2 0-3-1.5-5.6-3.6-5.6-1.2 0-2.1.8-3 2.1-.9-1.4-1.8-2.1-3-2.1-2 0-3.5 2.6-3.5 6.3Zm2-.2c0-2.1.9-4.2 2-4.2.7 0 1.2.5 2.1 1.9l-1.2 1.9c-1 1.6-1.4 2-2 2-.6 0-.9-.5-.9-1.6Zm6.4-.6-.8-1.3c.6-1 1.2-1.7 1.9-1.7 1.2 0 2.1 1.9 2.1 4.1 0 .9-.3 1.4-.9 1.4-.6 0-.9-.4-2.3-2.5Z" fill="currentColor" />;
      default:
        return <circle cx="12" cy="12" r="4" fill="currentColor" />;
    }
  })();
  if (plain) {
    return (
      <svg viewBox="4 4 16 16" className={cn('size-4', className)} aria-label={meta.label} role="img">
        {glyph}
      </svg>
    );
  }
  return (
    <span className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-md text-white', className)} style={{ background: meta.color }} title={meta.label}>
      <svg viewBox="4 4 16 16" className="size-[70%]" aria-label={meta.label} role="img">
        {glyph}
      </svg>
    </span>
  );
}
