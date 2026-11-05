import { Img } from 'remotion';
import type { CtaButtonProps, PriceTagProps, ProductShowcaseProps, SaleBadgeProps } from '@adforge/core';
import { clamp, hexToRgba } from '../../utils';
import { BODY, Center, DISPLAY, enter, exit, fill, Icon, springIn, type MotionProps } from '../kit';

export function PriceTag({ p, frame, duration, fps, u }: MotionProps<PriceTagProps>) {
  const card = springIn(frame, fps, 0, { damping: 13 });
  const strike = enter(frame, 14, 10, 'easeInOutCubic');
  const price = springIn(frame, fps, 22, { damping: 9, stiffness: 210 });
  const out = exit(frame, duration, 10);
  const big = 150 * u;
  return (
    <Center style={{ opacity: 1 - out }}>
      <div
        style={{
          position: 'relative',
          transform: `rotate(${(1 - card) * -12 - 3}deg) scale(${(0.5 + 0.5 * card) * (1 - out * 0.15)})`,
          background: p.accent,
          color: '#FFFFFF',
          borderRadius: 36 * u,
          padding: `${34 * u}px ${56 * u}px ${30 * u}px`,
          boxShadow: `0 ${24 * u}px ${70 * u}px ${hexToRgba(p.accent, 0.45)}`,
          textAlign: 'center',
          minWidth: 380 * u,
        }}
      >
        <div style={{ position: 'absolute', top: 26 * u, left: 26 * u, width: 22 * u, height: 22 * u, borderRadius: '50%', background: 'rgba(0,0,0,0.25)' }} />
        {p.label && <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 32 * u, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.92 }}>{p.label}</div>}
        {p.oldPrice && (
          <div style={{ position: 'relative', display: 'inline-block', fontFamily: DISPLAY, fontWeight: 700, fontSize: 56 * u, opacity: 0.75, marginTop: 6 * u }}>
            {p.currency}
            {p.oldPrice}
            <span style={{ position: 'absolute', left: '-6%', right: '-6%', top: '52%', height: 7 * u, background: '#FFFFFF', borderRadius: 7 * u, transform: `scaleX(${strike}) rotate(-8deg)`, transformOrigin: 'left' }} />
          </div>
        )}
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: big, lineHeight: 1, transform: `scale(${0.3 + 0.7 * price})`, opacity: clamp(price * 3, 0, 1) }}>
          <span style={{ fontSize: big * 0.45, verticalAlign: 'top', marginRight: 6 * u }}>{p.currency}</span>
          {p.price}
        </div>
      </div>
    </Center>
  );
}

function burstPath(points: number, inner: number): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? 50 : 50 * inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    return `${i === 0 ? 'M' : 'L'}${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ') + 'Z';
}

export function SaleBadge({ p, frame, duration, fps, u }: MotionProps<SaleBadgeProps>) {
  const s = springIn(frame, fps, 0, { damping: 10, stiffness: 190 });
  const out = exit(frame, duration, 10);
  const spin = (frame / fps) * 22;
  const size = 460 * u;
  const text = (
    <div style={{ position: 'relative', textAlign: 'center', color: p.textColor, lineHeight: 1 }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: (p.shape === 'pill' ? 84 : 92) * u, letterSpacing: '-0.02em' }}>{p.text}</div>
      {p.subtext && <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 34 * u, marginTop: 12 * u, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{p.subtext}</div>}
    </div>
  );
  const appear = { transform: `scale(${s * (1 - out * 0.4)}) rotate(${(1 - s) * -40}deg)`, opacity: clamp(s * 2, 0, 1) * (1 - out) };
  if (p.shape === 'pill') {
    return (
      <Center>
        <div style={{ ...appear, background: p.color, borderRadius: 999, padding: `${30 * u}px ${64 * u}px`, boxShadow: `0 ${18 * u}px ${50 * u}px ${hexToRgba(p.color, 0.5)}` }}>{text}</div>
      </Center>
    );
  }
  return (
    <Center>
      <div style={{ ...appear, position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, transform: `rotate(${p.shape === 'burst' ? spin : 0}deg)`, filter: `drop-shadow(0 ${10 * u}px ${24 * u}px ${hexToRgba(p.color, 0.55)})` }}>
          {p.shape === 'burst' ? <path d={burstPath(18, 0.84)} fill={p.color} /> : <circle cx="50" cy="50" r="48" fill={p.color} />}
          <circle cx="50" cy="50" r={p.shape === 'burst' ? 36 : 42} fill="none" stroke={p.textColor} strokeOpacity={0.25} strokeWidth={0.8} strokeDasharray="2 2.4" />
        </svg>
        {text}
      </div>
    </Center>
  );
}

export function CtaButton({ p, frame, duration, fps, u, height }: MotionProps<CtaButtonProps>) {
  const s = springIn(frame, fps, 0, { damping: 12, stiffness: 180 });
  const out = exit(frame, duration, 10);
  const t = frame / fps;
  const pulse = p.pulse ? 1 + 0.045 * Math.sin(t * Math.PI * 2 * 1.3) : 1;
  const ring = p.pulse ? (t * 1.3) % 1 : 0;
  const fontSize = 52 * u;
  return (
    <div style={{ ...fill, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: height * 0.16 }}>
      <div style={{ position: 'relative', transform: `translateY(${(1 - s) * 160 * u + out * 120 * u}px) scale(${pulse})`, opacity: clamp(s * 2, 0, 1) * (1 - out) }}>
        {p.pulse && (
          <div style={{ position: 'absolute', inset: 0, borderRadius: 999, border: `${4 * u}px solid ${p.color}`, transform: `scale(${1 + ring * 0.35})`, opacity: (1 - ring) * 0.8 }} />
        )}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 18 * u,
            padding: `${30 * u}px ${58 * u}px`,
            borderRadius: 999,
            background: p.color,
            color: p.textColor,
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize,
            boxShadow: `0 ${18 * u}px ${48 * u}px ${hexToRgba(p.color, 0.55)}, inset 0 ${2 * u}px 0 rgba(255,255,255,0.25)`,
            whiteSpace: 'nowrap',
          }}
        >
          {p.icon === 'cart' && <Icon name="cart" size={fontSize * 1.1} color={p.textColor} />}
          {p.icon === 'download' && <Icon name="download" size={fontSize * 1.1} color={p.textColor} />}
          <span>{p.text}</span>
          {p.icon === 'arrow' && (
            <span style={{ display: 'inline-flex', transform: `translateX(${Math.sin(t * Math.PI * 2 * 1.3) * 6 * u}px)` }}>
              <Icon name="arrow" size={fontSize * 1.1} color={p.textColor} />
            </span>
          )}
        </div>
      </div>
      {p.subtext && (
        <div style={{ marginTop: 22 * u, fontFamily: BODY, fontWeight: 600, fontSize: 32 * u, color: '#FFFFFF', textShadow: `0 ${2 * u}px ${12 * u}px rgba(0,0,0,0.6)`, opacity: enter(frame, 10, 12) * (1 - out) }}>
          {p.subtext}
        </div>
      )}
    </div>
  );
}

export function ProductShowcase({ p, frame, duration, fps, u, width, height, asset }: MotionProps<ProductShowcaseProps>) {
  const image = asset(p.imageAssetId);
  const s = springIn(frame, fps, 0, { damping: 15, stiffness: 120 });
  const t = frame / fps;
  const float = Math.sin(t * Math.PI * 2 * 0.35) * 14 * u;
  const out = exit(frame, duration, 10);
  const title = enter(frame, 18, 16);
  const sub = enter(frame, 26, 16);
  const price = springIn(frame, fps, 34, { damping: 10, stiffness: 200 });
  const imgSize = Math.min(width * 0.78, height * 0.5);
  return (
    <div style={{ ...fill, background: p.background, overflow: 'hidden', opacity: 1 - out }}>
      <div style={{ ...fill, background: `radial-gradient(ellipse 60% 40% at 50% 38%, ${hexToRgba(p.accent, 0.55)}, transparent 70%)` }} />
      <div style={{ ...fill, background: `radial-gradient(ellipse 80% 30% at 50% 100%, ${hexToRgba(p.accent, 0.25)}, transparent 70%)` }} />
      <div style={{ position: 'absolute', left: (width - imgSize) / 2, top: height * 0.1, width: imgSize, height: imgSize, transform: `translateY(${float + (1 - s) * 120 * u}px) scale(${0.6 + 0.4 * s}) rotate(${(1 - s) * -10}deg)`, opacity: clamp(s * 1.5, 0, 1) }}>
        {image ? (
          <Img src={image.src} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 ${30 * u}px ${40 * u}px rgba(0,0,0,0.5))` }} />
        ) : (
          <div style={{ width: '100%', height: '100%', borderRadius: 48 * u, background: `linear-gradient(145deg, ${hexToRgba(p.accent, 0.9)}, ${hexToRgba(p.accent, 0.3)})`, boxShadow: `0 ${30 * u}px ${60 * u}px rgba(0,0,0,0.45)` }} />
        )}
      </div>
      <div style={{ position: 'absolute', left: (width - imgSize * 0.7) / 2, top: height * 0.1 + imgSize * 1.02, width: imgSize * 0.7, height: 34 * u, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', filter: `blur(${16 * u}px)`, transform: `scaleX(${0.85 + 0.15 * Math.cos(t * Math.PI * 2 * 0.35)})` }} />
      <div style={{ position: 'absolute', left: width * 0.08, right: width * 0.08, top: height * 0.66, textAlign: 'center', color: '#FFFFFF' }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 76 * u, lineHeight: 1.05, opacity: title, transform: `translateY(${(1 - title) * 40 * u}px)` }}>{p.title}</div>
        {p.subtitle && <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: 40 * u, marginTop: 16 * u, opacity: sub * 0.85, transform: `translateY(${(1 - sub) * 30 * u}px)` }}>{p.subtitle}</div>}
        {p.price && (
          <div style={{ display: 'inline-block', marginTop: 34 * u, padding: `${14 * u}px ${40 * u}px`, borderRadius: 999, background: p.accent, fontFamily: DISPLAY, fontWeight: 800, fontSize: 54 * u, transform: `scale(${price})` }}>{p.price}</div>
        )}
      </div>
    </div>
  );
}
