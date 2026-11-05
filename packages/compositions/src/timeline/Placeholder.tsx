import { DISPLAY, BODY } from '../motion/kit';

/** Card shown for empty template slots and missing media in previews and template thumbnails. */
export function PlaceholderCard({ label, kind, u, missing = false }: { label: string; kind: 'video' | 'image' | 'audio' | 'media'; u: number; missing?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18 * u,
        background: missing
          ? 'repeating-linear-gradient(135deg, #1A1A26 0 24px, #20202E 24px 48px)'
          : 'radial-gradient(ellipse at 30% 20%, rgba(124,92,255,0.55), transparent 60%), radial-gradient(ellipse at 80% 90%, rgba(34,211,238,0.45), transparent 60%), #0E0E18',
        color: '#FFFFFF',
        textAlign: 'center',
        padding: 40 * u,
      }}
    >
      <svg width={120 * u} height={120 * u} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        {kind === 'image' ? (
          <>
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </>
        ) : kind === 'audio' ? (
          <path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3h3M19 16a3 3 0 1 1-3-3h3" />
        ) : (
          <>
            <rect x="2.5" y="5" width="14" height="14" rx="3" />
            <path d="M16.5 10l5-3v10l-5-3" />
          </>
        )}
      </svg>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40 * u, lineHeight: 1.15 }}>{missing ? 'Media unavailable' : label}</div>
      {!missing && <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: 28 * u, opacity: 0.7 }}>Drop or generate media here</div>}
    </div>
  );
}
