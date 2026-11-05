import { Img } from 'remotion';
import type { RatingStarsProps, SubscribeProps, TestimonialProps } from '@adforge/core';
import { clamp, hexToRgba } from '../../utils';
import { BODY, Center, DISPLAY, enter, exit, fill, Icon, springIn, Star, type MotionProps } from '../kit';

export function RatingStars({ p, frame, duration, fps, u }: MotionProps<RatingStarsProps>) {
  const out = exit(frame, duration, 10);
  const size = 112 * u;
  const count = enter(frame, 30, 14);
  const value = enter(frame, 8, 30, 'easeOutCubic') * p.rating;
  return (
    <Center style={{ flexDirection: 'column', gap: 22 * u, opacity: 1 - out, transform: `translateY(${out * 30 * u}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 * u, padding: `${22 * u}px ${36 * u}px`, borderRadius: 999, background: 'rgba(11,11,18,0.72)', boxShadow: `0 ${16 * u}px ${44 * u}px rgba(0,0,0,0.35)` }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 70 * u, color: '#FFFFFF', minWidth: 120 * u, textAlign: 'center' }}>{value.toFixed(1)}</div>
        <div style={{ display: 'flex', gap: 8 * u }}>
          {Array.from({ length: 5 }, (_, i) => {
            const pop = springIn(frame, fps, i * 4, { damping: 9, stiffness: 240 });
            const fraction = clamp(value - i, 0, 1);
            return (
              <div key={i} style={{ transform: `scale(${pop}) rotate(${(1 - pop) * -60}deg)` }}>
                <Star size={size} fill={p.color} fraction={fraction} />
              </div>
            );
          })}
        </div>
      </div>
      {p.count && (
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 36 * u, color: '#FFFFFF', opacity: count, transform: `translateY(${(1 - count) * 16 * u}px)`, textShadow: `0 ${2 * u}px ${12 * u}px rgba(0,0,0,0.6)` }}>
          {p.count}
        </div>
      )}
    </Center>
  );
}

export function Testimonial({ p, frame, duration, fps, u, width, asset }: MotionProps<TestimonialProps>) {
  const s = springIn(frame, fps, 0, { damping: 15, stiffness: 140 });
  const quote = enter(frame, 10, 18);
  const author = enter(frame, 22, 14);
  const out = exit(frame, duration, 10);
  const avatar = asset(p.avatarAssetId);
  const initials = p.author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <Center style={{ opacity: 1 - out }}>
      <div
        style={{
          width: Math.min(width * 0.86, 900 * u),
          padding: `${48 * u}px ${52 * u}px`,
          borderRadius: 40 * u,
          background: 'rgba(255,255,255,0.96)',
          color: '#0B0B12',
          boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.35)`,
          transform: `translateY(${(1 - s) * 180 * u + out * 60 * u}px) rotate(${(1 - s) * 4}deg)`,
          opacity: clamp(s * 2, 0, 1),
        }}
      >
        <div style={{ display: 'flex', gap: 6 * u, marginBottom: 22 * u }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ transform: `scale(${springIn(frame, fps, 6 + i * 3, { damping: 10, stiffness: 260 })})` }}>
              <Star size={52 * u} fill="#FACC15" outline="rgba(11,11,18,0.12)" fraction={clamp(p.rating - i, 0, 1)} />
            </div>
          ))}
        </div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 50 * u, lineHeight: 1.25, opacity: quote, transform: `translateY(${(1 - quote) * 20 * u}px)` }}>
          <span style={{ color: p.accent, fontFamily: DISPLAY, marginRight: 8 * u }}>“</span>
          {p.quote}
          <span style={{ color: p.accent, fontFamily: DISPLAY, marginLeft: 6 * u }}>”</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 * u, marginTop: 34 * u, opacity: author }}>
          <div style={{ width: 84 * u, height: 84 * u, borderRadius: '50%', overflow: 'hidden', background: p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontFamily: DISPLAY, fontWeight: 800, fontSize: 32 * u, flexShrink: 0 }}>
            {avatar ? <Img src={avatar.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials || <Icon name="user" size={44 * u} color="#FFFFFF" />}
          </div>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 36 * u }}>{p.author}</div>
            {p.role && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 * u, fontFamily: BODY, fontWeight: 600, fontSize: 28 * u, color: 'rgba(11,11,18,0.6)' }}>
                <Icon name="check" size={28 * u} color="#22C55E" />
                {p.role}
              </div>
            )}
          </div>
        </div>
      </div>
    </Center>
  );
}

const PLATFORM_ICON = { tiktok: 'note', instagram: 'camera', youtube: 'play', x: 'x', generic: 'bell' } as const;

export function Subscribe({ p, frame, duration, fps, u, height }: MotionProps<SubscribeProps>) {
  const s = springIn(frame, fps, 0, { damping: 13, stiffness: 170 });
  const out = exit(frame, duration, 10);
  const clickAt = Math.round(duration * 0.45);
  const cursorIn = enter(frame, clickAt - 16, 14, 'easeInOutCubic');
  const pressed = frame >= clickAt && frame < clickAt + 5;
  const followed = frame >= clickAt;
  const label = p.platform === 'youtube' ? (followed ? 'Subscribed' : 'Subscribe') : followed ? 'Following' : 'Follow';
  return (
    <div style={{ ...fill, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: height * 0.18 }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 22 * u,
          padding: `${18 * u}px ${18 * u}px ${18 * u}px ${20 * u}px`,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.97)',
          boxShadow: `0 ${20 * u}px ${54 * u}px rgba(0,0,0,0.35)`,
          transform: `translateY(${(1 - s) * 220 * u + out * 220 * u}px)`,
          opacity: 1 - out,
        }}
      >
        <div style={{ width: 92 * u, height: 92 * u, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={PLATFORM_ICON[p.platform]} size={52 * u} color="#FFFFFF" />
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40 * u, color: '#0B0B12', paddingRight: 8 * u }}>{p.handle}</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10 * u,
            padding: `${20 * u}px ${34 * u}px`,
            borderRadius: 999,
            background: followed ? 'rgba(11,11,18,0.1)' : p.color,
            color: followed ? '#0B0B12' : '#FFFFFF',
            fontFamily: BODY,
            fontWeight: 700,
            fontSize: 34 * u,
            transform: `scale(${pressed ? 0.9 : 1})`,
          }}
        >
          {followed && <Icon name="check" size={34 * u} color="#0B0B12" />}
          {label}
        </div>
        <svg
          width={70 * u}
          height={70 * u}
          viewBox="0 0 24 24"
          style={{
            position: 'absolute',
            right: 40 * u,
            bottom: -46 * u,
            transform: `translate(${(1 - cursorIn) * 160 * u}px, ${(1 - cursorIn) * 120 * u}px) scale(${pressed ? 0.85 : 1})`,
            opacity: cursorIn * (frame > clickAt + 18 ? Math.max(0, 1 - (frame - clickAt - 18) / 8) : 1),
            filter: `drop-shadow(0 ${4 * u}px ${8 * u}px rgba(0,0,0,0.4))`,
          }}
        >
          <path d="M5 2.5l13 8.2-5.6 1.4 3.4 6.6-2.6 1.3-3.3-6.6L5.6 17z" fill="#FFFFFF" stroke="#0B0B12" strokeWidth={1.4} strokeLinejoin="round" />
        </svg>
        {pressed && <div style={{ position: 'absolute', right: 70 * u, top: '50%', width: 30 * u, height: 30 * u, marginTop: -15 * u, borderRadius: '50%', border: `${3 * u}px solid ${hexToRgba(p.color, 0.8)}`, transform: `scale(${1 + (frame - clickAt) * 0.5})` }} />}
      </div>
    </div>
  );
}
