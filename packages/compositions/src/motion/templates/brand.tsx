import { Img } from 'remotion';
import type { LogoStingProps } from '@adforge/core';
import { clamp, hexToRgba } from '../../utils';
import { BODY, DISPLAY, enter, fill, springIn, type MotionProps } from '../kit';

export function LogoSting({ p, frame, fps, u, width, height, asset }: MotionProps<LogoStingProps>) {
  const logo = asset(p.logoAssetId);
  const t = frame / fps;
  const box = Math.min(width, height) * 0.42;
  let transform = '';
  let opacity = 1;
  let filter: string | undefined;
  let clip: string | undefined;
  if (p.style === 'bounce') {
    const s = springIn(frame, fps, 0, { damping: 8, stiffness: 140, mass: 1 });
    transform = `translateY(${(1 - s) * -height * 0.6}px) scale(${1 + (1 - s) * 0.1}, ${1 - (1 - s) * 0.1})`;
    opacity = clamp(frame / 4, 0, 1);
  } else if (p.style === 'reveal') {
    const r = enter(frame, 4, 22, 'easeInOutCubic');
    clip = `inset(0 ${(1 - r) * 100}% 0 0)`;
  } else {
    const s = enter(frame, 0, 26, 'easeOutCubic');
    transform = `scale(${0.82 + 0.18 * s})`;
    opacity = s;
    const glow = (0.55 + 0.45 * Math.sin(t * Math.PI * 2 * 0.8)) * s;
    filter = `blur(${(1 - s) * 18 * u}px) drop-shadow(0 0 ${40 * u * glow}px ${hexToRgba(p.color, 0.85)})`;
  }
  const sweep = ((frame - 18) / 26) * 1.6 - 0.3;
  const tagline = enter(frame, 26, 16);
  const line = enter(frame, 20, 18, 'easeInOutCubic');
  return (
    <div style={{ ...fill, background: p.background, overflow: 'hidden' }}>
      <div style={{ ...fill, background: `radial-gradient(circle at 50% 46%, ${hexToRgba(p.color, 0.35)}, transparent 55%)`, opacity: enter(frame, 0, 30) }} />
      <div style={{ ...fill, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34 * u }}>
        <div style={{ position: 'relative', transform, opacity, filter, clipPath: clip }}>
          {logo ? (
            <Img src={logo.src} style={{ display: 'block', maxWidth: box * 1.5, maxHeight: box, objectFit: 'contain' }} />
          ) : (
            <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: Math.min(170 * u, (width * 0.8) / Math.max(3, p.wordmark.length * 0.72)), color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              {p.wordmark}
            </div>
          )}
          {sweep > -0.3 && sweep < 1.3 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(105deg, transparent ${sweep * 100 - 12}%, rgba(255,255,255,0.65) ${sweep * 100}%, transparent ${sweep * 100 + 12}%)`,
                mixBlendMode: 'overlay',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
        <div style={{ width: box * 0.6 * line, height: 6 * u, borderRadius: 6 * u, background: p.color, boxShadow: `0 0 ${18 * u}px ${p.color}` }} />
        {p.tagline && (
          <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 40 * u, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.86)', opacity: tagline, transform: `translateY(${(1 - tagline) * 18 * u}px)` }}>
            {p.tagline}
          </div>
        )}
      </div>
    </div>
  );
}
