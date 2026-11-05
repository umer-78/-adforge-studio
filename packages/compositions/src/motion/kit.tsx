import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { spring, type SpringConfig } from 'remotion';
import { ease, type EasingId, type ResolvedAsset } from '@adforge/core';
import { progress } from '../utils';
import { fontStack } from '../text/style';

export interface MotionProps<P> {
  p: P;
  /** Frame relative to the clip start. */
  frame: number;
  duration: number;
  fps: number;
  /** Pixels per design unit (1080 px short side). */
  u: number;
  /** Layer box size in pixels. */
  width: number;
  height: number;
  asset: (id: string | null | undefined) => ResolvedAsset | null;
}

export type MotionComponent<P> = (props: MotionProps<P>) => ReactElement | null;

export const DISPLAY = fontStack('Unbounded');
export const BODY = fontStack('Geist');

export function springIn(frame: number, fps: number, delay = 0, config: Partial<SpringConfig> = {}): number {
  return spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 170, mass: 0.8, ...config } });
}

/** Eased 0→1 from `delay` over `length` frames. */
export function enter(frame: number, delay: number, length: number, easing: EasingId = 'easeOutCubic'): number {
  return ease(easing, progress(frame, delay, length));
}

/** Eased 0→1 over the last `length` frames of the clip. */
export function exit(frame: number, duration: number, length = 10): number {
  return ease('easeInCubic', progress(frame, duration - length, length));
}

export const fill: CSSProperties = { position: 'absolute', inset: 0 };

export function Center({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...fill, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>{children}</div>;
}

/** Text with an outer stroke drawn under the fill so the stroke never eats into the glyphs. */
export function Outlined({ children, stroke, width, style }: { children: ReactNode; stroke: string; width: number; style?: CSSProperties }) {
  return (
    <span style={{ display: 'inline-grid', ...style }}>
      <span aria-hidden style={{ gridArea: '1 / 1', WebkitTextStroke: `${width * 2}px ${stroke}`, color: stroke }}>
        {children}
      </span>
      <span style={{ gridArea: '1 / 1' }}>{children}</span>
    </span>
  );
}

export function Star({ size, fill: color, outline, fraction = 1 }: { size: number; fill: string; outline?: string; fraction?: number }) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 50 : 21;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
  }).join(' ');
  const id = `star-${Math.round(fraction * 1000)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={100 * Math.max(0, Math.min(1, fraction))} height="100" />
        </clipPath>
      </defs>
      <polygon points={points} fill={outline ?? 'rgba(255,255,255,0.22)'} />
      <polygon points={points} fill={color} clipPath={`url(#${id})`} />
    </svg>
  );
}

export function Icon({ name, size, color }: { name: 'arrow' | 'cart' | 'download' | 'check' | 'cross' | 'bell' | 'play' | 'camera' | 'note' | 'x' | 'user'; size: number; color: string }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<typeof name, ReactNode> = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" {...common} />,
    cart: (
      <>
        <path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" {...common} />
        <circle cx="9.5" cy="19" r="1.4" fill={color} />
        <circle cx="17" cy="19" r="1.4" fill={color} />
      </>
    ),
    download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" {...common} />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" {...common} />,
    cross: <path d="M6 6l12 12M18 6L6 18" {...common} />,
    bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" {...common} />,
    play: <path d="M8 5.5v13l10.5-6.5z" fill={color} stroke="none" />,
    camera: (
      <>
        <rect x="3.5" y="6.5" width="17" height="13" rx="3.5" {...common} />
        <circle cx="12" cy="13" r="3.6" {...common} />
        <path d="M8.5 6.5L10 4h4l1.5 2.5" {...common} />
      </>
    ),
    note: <path d="M9 18.5a2.5 2.5 0 1 1-2.5-2.5H9V5l10-2v12.5a2.5 2.5 0 1 1-2.5-2.5H19" {...common} />,
    x: <path d="M5 4.5l14 15M19 4.5l-14 15" {...common} strokeWidth={2.8} />,
    user: (
      <>
        <circle cx="12" cy="8.5" r="3.8" {...common} />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...common} />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {paths[name]}
    </svg>
  );
}
