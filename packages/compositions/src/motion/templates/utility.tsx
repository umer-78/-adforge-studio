import { useMemo } from 'react';
import QRCode from 'qrcode';
import type { CountdownProps, ProgressBarProps, QrCardProps } from '@adforge/core';
import { clamp, hexToRgba } from '../../utils';
import { BODY, Center, DISPLAY, enter, exit, fill, springIn, type MotionProps } from '../kit';

export function Countdown({ p, frame, duration, fps, u }: MotionProps<CountdownProps>) {
  const out = exit(frame, duration, 8);
  const label = p.label ? (
    <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40 * u, letterSpacing: '0.1em', textTransform: 'uppercase', color: p.color, opacity: enter(frame, 0, 12), textShadow: `0 ${2 * u}px ${14 * u}px rgba(0,0,0,0.55)` }}>{p.label}</div>
  ) : null;

  if (p.mode === 'timer') {
    const remaining = Math.max(0, Math.ceil(p.seconds - frame / fps));
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    const parts = (p.seconds >= 3600 ? [h, m, s] : [m, s]).map((v) => String(v).padStart(2, '0'));
    const appear = springIn(frame, fps, 0, { damping: 14 });
    return (
      <Center style={{ flexDirection: 'column', gap: 26 * u, opacity: 1 - out }}>
        {label}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, transform: `scale(${0.6 + 0.4 * appear})` }}>
          {parts.map((part, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 * u }}>
              {i > 0 && <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 96 * u, color: p.accent }}>:</div>}
              <div style={{ display: 'flex', gap: 8 * u }}>
                {[...part].map((digit, di) => (
                  <div key={di} style={{ width: 110 * u, height: 150 * u, borderRadius: 24 * u, background: 'rgba(11,11,18,0.78)', border: `${2 * u}px solid ${hexToRgba(p.accent, 0.5)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontWeight: 800, fontSize: 100 * u, color: p.color, fontVariantNumeric: 'tabular-nums' }}>
                    {digit}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Center>
    );
  }

  const n = clamp(Math.round(p.seconds), 1, 10);
  const per = Math.max(1, Math.floor(duration / n));
  const index = Math.min(n - 1, Math.floor(frame / per));
  const local = frame - index * per;
  const pop = springIn(local, fps, 0, { damping: 10, stiffness: 260 });
  const ring = 1 - clamp(local / per, 0, 1);
  const size = 360 * u;
  const r = 46;
  const circ = 2 * Math.PI * r;
  return (
    <Center style={{ flexDirection: 'column', gap: 30 * u, opacity: 1 - out }}>
      {label}
      <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={r} fill="rgba(11,11,18,0.6)" stroke="rgba(255,255,255,0.15)" strokeWidth={4} />
          <circle cx="50" cy="50" r={r} fill="none" stroke={p.accent} strokeWidth={4.5} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - ring)} />
        </svg>
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 210 * u, color: p.color, transform: `scale(${1.5 - 0.5 * pop})`, opacity: clamp(pop * 2, 0, 1) }}>{n - index}</div>
      </div>
    </Center>
  );
}

export function ProgressBar({ p, frame, duration, u }: MotionProps<ProgressBarProps>) {
  const progressValue = clamp((frame + 1) / duration, 0, 1);
  const thickness = p.thickness * u;
  return (
    <div style={{ ...fill }}>
      <div style={{ position: 'absolute', left: 0, right: 0, [p.position]: 0, height: thickness, background: p.track }}>
        <div style={{ width: `${progressValue * 100}%`, height: '100%', background: p.color, boxShadow: `0 0 ${thickness * 1.5}px ${p.color}`, borderRadius: `0 ${thickness}px ${thickness}px 0` }} />
      </div>
    </div>
  );
}

function qrPath(text: string): { size: number; d: string } {
  try {
    const qr = QRCode.create(text || ' ', { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    let d = '';
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) if (qr.modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`;
    return { size, d };
  } catch {
    return { size: 21, d: '' };
  }
}

export function QrCard({ p, frame, duration, fps, u }: MotionProps<QrCardProps>) {
  const qr = useMemo(() => qrPath(p.url), [p.url]);
  const s = springIn(frame, fps, 0, { damping: 12, stiffness: 170 });
  const out = exit(frame, duration, 10);
  const size = 420 * u;
  const quiet = 2;
  return (
    <Center style={{ opacity: 1 - out }}>
      <div style={{ padding: 34 * u, borderRadius: 40 * u, background: p.bg, boxShadow: `0 ${26 * u}px ${70 * u}px rgba(0,0,0,0.4)`, textAlign: 'center', transform: `scale(${s * (1 - out * 0.1)}) rotate(${(1 - s) * 8}deg)` }}>
        <svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${qr.size + quiet * 2} ${qr.size + quiet * 2}`} shapeRendering="crispEdges" style={{ display: 'block' }}>
          <rect x={-quiet} y={-quiet} width={qr.size + quiet * 2} height={qr.size + quiet * 2} fill={p.bg} />
          <path d={qr.d} fill={p.fg} />
        </svg>
        {p.label && <div style={{ marginTop: 22 * u, fontFamily: DISPLAY, fontWeight: 800, fontSize: 44 * u, color: p.fg, opacity: enter(frame, 10, 12) }}>{p.label}</div>}
      </div>
    </Center>
  );
}
