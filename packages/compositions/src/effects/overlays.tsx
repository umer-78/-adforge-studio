import { createContext, useContext, type CSSProperties } from 'react';
import { hexToRgba, smoothNoise } from '../utils';

const fill: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };

/**
 * Opacity multiplier for overlays. Adjustment layers draw overlays without a
 * wrapper (a wrapper with opacity would isolate their blend modes), so the
 * layer opacity reaches them through context instead.
 */
export const OverlayOpacity = createContext(1);
const useAlpha = () => useContext(OverlayOpacity);

export function Vignette({ strength, size, color }: { strength: number; size: number; color: string }) {
  const alpha = useAlpha();
  return (
    <div
      style={{
        ...fill,
        opacity: alpha,
        background: `radial-gradient(ellipse at center, transparent ${Math.round(size * 100 * 0.72)}%, ${hexToRgba(color, Math.min(1, strength * 1.35))} 100%)`,
      }}
    />
  );
}

export function LightLeak({ t, intensity, hue, speed }: { t: number; intensity: number; hue: number; speed: number }) {
  const alpha = useAlpha();
  const s = t * speed;
  const x1 = 15 + 70 * (0.5 + 0.5 * Math.sin(s * 0.37));
  const y1 = 10 + 50 * (0.5 + 0.5 * Math.sin(s * 0.23 + 1.3));
  const x2 = 85 - 60 * (0.5 + 0.5 * Math.sin(s * 0.29 + 2.1));
  const y2 = 90 - 50 * (0.5 + 0.5 * Math.sin(s * 0.41 + 0.4));
  const pulse = 0.65 + 0.35 * Math.sin(s * 0.9 + 0.7);
  return (
    <div
      style={{
        ...fill,
        mixBlendMode: 'screen',
        opacity: Math.min(1, intensity * pulse) * alpha,
        background: [
          `radial-gradient(ellipse 60% 45% at ${x1}% ${y1}%, hsla(${hue}, 100%, 62%, 0.95), transparent 70%)`,
          `radial-gradient(ellipse 45% 60% at ${x2}% ${y2}%, hsla(${(hue + 32) % 360}, 100%, 55%, 0.75), transparent 70%)`,
          `linear-gradient(${110 + 25 * Math.sin(s * 0.2)}deg, hsla(${(hue + 350) % 360}, 100%, 60%, 0.25), transparent 55%)`,
        ].join(', '),
      }}
    />
  );
}

export function Grain({ id, frame, amount, size }: { id: string; frame: number; amount: number; size: number }) {
  const alpha = useAlpha();
  return (
    <svg style={{ ...fill, width: '100%', height: '100%', mixBlendMode: 'overlay', opacity: Math.min(1, amount * 1.6) * alpha }} aria-hidden>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={0.85 / Math.max(0.5, size)} numOctaves={2} seed={(frame % 997) + 1} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

export function Vhs({ id, frame, fps, intensity, u }: { id: string; frame: number; fps: number; intensity: number; u: number }) {
  const alpha = useAlpha();
  const t = frame / fps;
  const line = Math.max(1, Math.round(2 * u));
  const band = ((t * 0.18) % 1.2) - 0.1;
  const jitter = smoothNoise(41, t * 9) * 3 * u * intensity;
  return (
    <>
      <div
        style={{
          ...fill,
          opacity: 0.55 * intensity * alpha,
          background: `repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) ${line}px, transparent ${line}px, transparent ${line * 3}px)`,
          transform: `translateX(${jitter}px)`,
        }}
      />
      <div
        style={{
          ...fill,
          opacity: 0.35 * intensity * alpha,
          mixBlendMode: 'screen',
          background: `linear-gradient(180deg, transparent ${band * 100 - 4}%, rgba(255,255,255,0.5) ${band * 100}%, transparent ${band * 100 + 3}%)`,
        }}
      />
      <Grain id={id} frame={frame} amount={0.22 * intensity} size={1.4} />
    </>
  );
}

export function Letterbox({ ratio, color, box }: { ratio: number; color: string; box: { width: number; height: number } }) {
  const alpha = useAlpha();
  const current = box.width / Math.max(1, box.height);
  if (current < ratio) {
    const bar = Math.max(0, (box.height - box.width / ratio) / 2);
    return (
      <>
        <div style={{ ...fill, bottom: 'auto', height: bar, background: color, opacity: alpha }} />
        <div style={{ ...fill, top: 'auto', height: bar, background: color, opacity: alpha }} />
      </>
    );
  }
  const bar = Math.max(0, (box.width - box.height * ratio) / 2);
  return (
    <>
      <div style={{ ...fill, right: 'auto', width: bar, background: color, opacity: alpha }} />
      <div style={{ ...fill, left: 'auto', width: bar, background: color, opacity: alpha }} />
    </>
  );
}

/** Warm/cool and tint wash for adjustment layers, blended with everything below. */
export function TemperatureWash({ temperature, tint }: { temperature: number; tint: number }) {
  const alpha = useAlpha();
  const warm = temperature >= 0;
  return (
    <>
      {temperature !== 0 && (
        <div style={{ ...fill, mixBlendMode: 'soft-light', background: warm ? 'rgb(255,138,36)' : 'rgb(36,120,255)', opacity: Math.min(1, Math.abs(temperature) * 0.75) * alpha }} />
      )}
      {tint !== 0 && (
        <div style={{ ...fill, mixBlendMode: 'soft-light', background: tint > 0 ? 'rgb(230,40,200)' : 'rgb(40,220,90)', opacity: Math.min(1, Math.abs(tint) * 0.5) * alpha }} />
      )}
    </>
  );
}

export function ColorWash({ color, opacity }: { color: string; opacity: number }) {
  if (opacity <= 0) return null;
  return <div style={{ ...fill, background: color, opacity: Math.min(1, opacity) }} />;
}
