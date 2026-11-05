import type { BulletListProps, ComparisonProps } from '@adforge/core';
import { clamp, hexToRgba } from '../../utils';
import { BODY, DISPLAY, enter, exit, fill, Icon, springIn, type MotionProps } from '../kit';

export function BulletList({ p, frame, duration, fps, u, width }: MotionProps<BulletListProps>) {
  const out = exit(frame, duration, 10);
  const title = enter(frame, 0, 14);
  const items = p.items.filter((i) => i.trim()).slice(0, 8);
  const gap = Math.max(8, Math.min(18, Math.floor((duration - 30) / Math.max(1, items.length))));
  return (
    <div style={{ ...fill, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 1 - out }}>
      <div style={{ width: Math.min(width * 0.84, 920 * u), display: 'flex', flexDirection: 'column', gap: 26 * u }}>
        {p.title && (
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 64 * u, color: '#FFFFFF', lineHeight: 1.1, textShadow: `0 ${4 * u}px ${20 * u}px rgba(0,0,0,0.5)`, opacity: title, transform: `translateY(${(1 - title) * 30 * u}px)` }}>
            {p.title}
          </div>
        )}
        {items.map((item, i) => {
          const s = springIn(frame, fps, 10 + i * gap, { damping: 14, stiffness: 180 });
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24 * u,
                padding: `${20 * u}px ${28 * u}px`,
                borderRadius: 26 * u,
                background: 'rgba(11,11,18,0.72)',
                border: `${2 * u}px solid ${hexToRgba(p.accent, 0.35)}`,
                transform: `translateX(${(1 - s) * -width * 0.5}px)`,
                opacity: clamp(s * 2, 0, 1),
              }}
            >
              <div style={{ width: 64 * u, height: 64 * u, borderRadius: '50%', flexShrink: 0, background: p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontWeight: 800, fontSize: 32 * u, color: '#0B0B12' }}>
                {p.icon === 'check' ? <Icon name="check" size={40 * u} color="#0B0B12" /> : p.icon === 'number' ? i + 1 : <div style={{ width: 20 * u, height: 20 * u, borderRadius: '50%', background: '#0B0B12' }} />}
              </div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 46 * u, color: '#FFFFFF', lineHeight: 1.2 }}>{item}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Comparison({ p, frame, duration, fps, u, width, height }: MotionProps<ComparisonProps>) {
  const out = exit(frame, duration, 10);
  const rows = Math.max(p.leftItems.length, p.rightItems.length);
  const step = Math.max(6, Math.min(16, Math.floor((duration - 40) / Math.max(1, rows * 2))));
  const vs = springIn(frame, fps, 6, { damping: 9, stiffness: 220 });
  const colW = Math.min(width * 0.43, 470 * u);
  const column = (side: 'left' | 'right') => {
    const good = side === 'right';
    const items = good ? p.rightItems : p.leftItems;
    const head = springIn(frame, fps, good ? 8 : 0, { damping: 14 });
    return (
      <div
        style={{
          width: colW,
          padding: `${34 * u}px ${26 * u}px`,
          borderRadius: 36 * u,
          background: good ? hexToRgba(p.accent, 0.16) : 'rgba(255,255,255,0.06)',
          border: `${3 * u}px solid ${good ? p.accent : 'rgba(255,255,255,0.14)'}`,
          boxShadow: good ? `0 0 ${60 * u}px ${hexToRgba(p.accent, 0.35)}` : undefined,
          transform: `translateY(${(1 - head) * 80 * u}px)`,
          opacity: clamp(head * 2, 0, 1),
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 50 * u, color: good ? p.accent : 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 26 * u }}>{good ? p.rightTitle : p.leftTitle}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 * u }}>
          {items.map((item, i) => {
            const s = enter(frame, 24 + (i * 2 + (good ? 1 : 0)) * step, 12);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 * u, opacity: s, transform: `translateX(${(1 - s) * (good ? 40 : -40) * u}px)` }}>
                <div style={{ width: 46 * u, height: 46 * u, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: good ? p.accent : 'rgba(244,63,94,0.85)' }}>
                  <Icon name={good ? 'check' : 'cross'} size={30 * u} color={good ? '#0B0B12' : '#FFFFFF'} />
                </div>
                <div style={{ fontFamily: BODY, fontWeight: good ? 700 : 500, fontSize: 36 * u, lineHeight: 1.2, color: good ? '#FFFFFF' : 'rgba(255,255,255,0.65)' }}>{item}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div style={{ ...fill, background: 'linear-gradient(180deg, #0B0B12, #13131F)', opacity: 1 - out }}>
      <div style={{ ...fill, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: width * 0.04 }}>
        {column('left')}
        {column('right')}
      </div>
      <div
        style={{
          position: 'absolute',
          left: width / 2 - 56 * u,
          top: height / 2 - 56 * u,
          width: 112 * u,
          height: 112 * u,
          borderRadius: '50%',
          background: '#FFFFFF',
          color: '#0B0B12',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 40 * u,
          transform: `scale(${vs}) rotate(${(1 - vs) * 180}deg)`,
          boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.4)`,
        }}
      >
        VS
      </div>
    </div>
  );
}
