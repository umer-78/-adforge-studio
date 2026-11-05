import type { KineticTitleProps as KineticTitle, LowerThirdProps as LowerThird, UgcHookProps as UgcHook } from '@adforge/core';
import { fontStack } from '../../text/style';
import { clamp, seededRandom } from '../../utils';
import { BODY, Center, DISPLAY, enter, exit, fill, Outlined, springIn, type MotionProps } from '../kit';

export function KineticTitle({ p, frame, duration, fps, u, width, height }: MotionProps<KineticTitle>) {
  const lines = p.text.split('\n').filter((l) => l.trim());
  const longest = Math.max(1, ...lines.map((l) => [...l].length));
  // Wide display faces such as Unbounded run close to 0.9em per uppercase letter; sizing for that
  // keeps the longest line inside the frame in any of the offered fonts.
  const size = clamp(Math.min((width * 0.9) / (longest * 0.92), (height * 0.8) / (lines.length * 1.05)), 28 * u, 190 * u);
  const out = exit(frame, duration, 10);
  const font = fontStack(p.font || 'Unbounded');
  const base = { fontFamily: font, fontWeight: 900, fontSize: size, lineHeight: 1.02, textTransform: 'uppercase' as const, letterSpacing: '-0.01em' };

  const body = (() => {
    if (p.style === 'slam') {
      const words = lines.flatMap((l, li) => l.split(/\s+/).filter(Boolean).map((w) => ({ w, li })));
      const landed = words.map((_, i) => springIn(frame, fps, i * 6, { damping: 11, stiffness: 220 }));
      const lastLand = (words.length - 1) * 6;
      const shake = frame >= lastLand && frame < lastLand + 10 ? (seededRandom(frame) - 0.5) * 18 * u * (1 - (frame - lastLand) / 10) : 0;
      return (
        <div style={{ ...base, textAlign: 'center', transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
          {lines.map((_, li) => (
            <div key={li}>
              {words.map((wd, i) =>
                wd.li !== li ? null : (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      margin: `0 ${size * 0.14}px`,
                      color: i === words.length - 1 ? p.accent : p.color,
                      transform: `scale(${3 - 2 * landed[i]!})`,
                      opacity: frame >= i * 6 ? clamp(landed[i]! * 2.5, 0, 1) : 0,
                    }}
                  >
                    {wd.w}
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div style={{ ...base, textAlign: 'center' }}>
        {lines.map((line, i) => {
          const delay = i * 5;
          const prog = enter(frame, delay, 16, 'easeOutCubic');
          const accentLine = i === lines.length - 1 && lines.length > 1;
          const color = accentLine ? p.accent : p.color;
          if (p.style === 'reveal') {
            const wipe = enter(frame, delay, 12, 'easeInOutCubic');
            const unwipe = enter(frame, delay + 12, 12, 'easeInOutCubic');
            return (
              <div key={i} style={{ position: 'relative', display: 'table', margin: '0 auto' }}>
                <span style={{ color, opacity: frame >= delay + 12 ? 1 : 0 }}>{line}</span>
                <span
                  style={{
                    position: 'absolute',
                    top: '6%',
                    bottom: '6%',
                    left: `${unwipe * 100}%`,
                    right: `${(1 - wipe) * 100}%`,
                    background: p.accent,
                  }}
                />
              </div>
            );
          }
          if (p.style === 'split') {
            const dir = i % 2 ? 1 : -1;
            return (
              <div key={i} style={{ color, transform: `translateX(${dir * (1 - prog) * width * 0.7}px) skewX(${dir * (1 - prog) * -18}deg)`, opacity: prog }}>
                {line}
              </div>
            );
          }
          return (
            <div key={i} style={{ overflow: 'hidden', paddingBottom: size * 0.04 }}>
              <div style={{ color, transform: `translateY(${(1 - prog) * 110}%)` }}>{line}</div>
            </div>
          );
        })}
        {p.style === 'stack' && (
          <div style={{ height: size * 0.12, width: `${enter(frame, lines.length * 5 + 4, 14) * 38}%`, margin: `${size * 0.18}px auto 0`, background: p.accent, borderRadius: size }} />
        )}
      </div>
    );
  })();

  return (
    <div style={{ ...fill, background: p.background ?? undefined }}>
      <Center style={{ opacity: 1 - out, transform: `translateY(${-out * 8 * u}px) scale(${1 - out * 0.04})` }}>{body}</Center>
    </div>
  );
}

export function LowerThird({ p, frame, duration, u, width, height }: MotionProps<LowerThird>) {
  const bar = enter(frame, 0, 12, 'easeOutCubic');
  const title = enter(frame, 6, 16, 'easeOutCubic');
  const sub = enter(frame, 14, 14, 'easeOutCubic');
  const out = exit(frame, duration, 12);
  const right = p.align === 'right';
  const titleSize = 58 * u;
  return (
    <div style={{ ...fill }}>
      <div
        style={{
          position: 'absolute',
          bottom: height * 0.15,
          [right ? 'right' : 'left']: width * 0.07,
          display: 'flex',
          flexDirection: right ? 'row-reverse' : 'row',
          alignItems: 'stretch',
          gap: 18 * u,
          opacity: 1 - out,
          transform: `translateX(${(right ? 1 : -1) * out * 60 * u}px)`,
        }}
      >
        <div style={{ width: 10 * u, borderRadius: 10 * u, background: p.accent, transform: `scaleY(${bar})`, transformOrigin: 'bottom', boxShadow: `0 0 ${24 * u}px ${p.accent}` }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start', gap: 8 * u }}>
          <div style={{ overflow: 'hidden' }}>
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: titleSize,
                color: '#FFFFFF',
                padding: `${10 * u}px ${22 * u}px`,
                background: 'rgba(11,11,18,0.78)',
                borderRadius: 14 * u,
                transform: `translateX(${(right ? 1 : -1) * (1 - title) * 105}%)`,
                whiteSpace: 'nowrap',
              }}
            >
              {p.title}
            </div>
          </div>
          {p.subtitle && (
            <div
              style={{
                fontFamily: BODY,
                fontWeight: 600,
                fontSize: 34 * u,
                color: '#0B0B12',
                background: p.accent,
                padding: `${6 * u}px ${18 * u}px`,
                borderRadius: 10 * u,
                opacity: sub,
                transform: `translateY(${(1 - sub) * 20 * u}px)`,
                whiteSpace: 'nowrap',
              }}
            >
              {p.subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function UgcHookTemplate({ p, frame, duration, fps, u, width, height }: MotionProps<UgcHook>) {
  const s = springIn(frame, fps, 0, { damping: 12, stiffness: 200 });
  const out = exit(frame, duration, 8);
  const size = 54 * u;
  const wobble = Math.sin((frame / fps) * Math.PI * 2 * 1.2) * 8;
  const emoji = p.emoji ? (
    <span style={{ display: 'inline-block', marginLeft: size * 0.25, transform: `rotate(${wobble}deg) scale(${springIn(frame, fps, 8)})`, fontSize: size * 1.15 }}>{p.emoji}</span>
  ) : null;
  const wrap = { position: 'absolute' as const, left: width * 0.08, right: width * 0.08, top: height * 0.2, display: 'flex', justifyContent: 'center', textAlign: 'center' as const };
  const appear = { transform: `scale(${(0.6 + 0.4 * s) * (1 - out * 0.2)})`, opacity: clamp(s * 2, 0, 1) * (1 - out) };

  if (p.style === 'bubble') {
    return (
      <div style={wrap}>
        <div style={{ position: 'relative', ...appear, transformOrigin: '20% 100%' }}>
          <div style={{ background: '#FFFFFF', color: '#0B0B12', fontFamily: BODY, fontWeight: 700, fontSize: size, lineHeight: 1.18, padding: `${24 * u}px ${34 * u}px`, borderRadius: 44 * u, boxShadow: `0 ${14 * u}px ${40 * u}px rgba(0,0,0,0.35)` }}>
            {p.text}
            {emoji}
          </div>
          <svg width={60 * u} height={44 * u} viewBox="0 0 60 44" style={{ position: 'absolute', left: 54 * u, bottom: -34 * u }}>
            <path d="M0 0 H60 L8 44 Z" fill="#FFFFFF" />
          </svg>
        </div>
      </div>
    );
  }
  if (p.style === 'outline') {
    return (
      <div style={wrap}>
        <div style={{ ...appear, fontFamily: DISPLAY, fontWeight: 800, fontSize: size * 1.1, lineHeight: 1.12, color: '#FFFFFF', textTransform: 'uppercase' }}>
          <Outlined stroke="#000000" width={7 * u}>
            {p.text}
          </Outlined>
          {emoji}
        </div>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <div style={{ ...appear, fontFamily: BODY, fontWeight: 700, fontSize: size, lineHeight: 1.5, color: '#0B0B12' }}>
        <span style={{ background: '#FFFFFF', padding: `${6 * u}px ${18 * u}px`, borderRadius: 14 * u, WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}>
          {p.text}
          {emoji}
        </span>
      </div>
    </div>
  );
}
