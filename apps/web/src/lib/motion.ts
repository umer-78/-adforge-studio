import { useSyncExternalStore } from 'react';

/**
 * Shared timing and easing for every animation in the app, so CSS, GSAP and motion all move the
 * same way. CSS reads the same values from globals.css (--ease-out-expo, --duration-*).
 */
export const DURATION = { fast: 0.15, base: 0.24, slow: 0.4, reveal: 0.8 } as const;

export const EASE = {
  outExpo: [0.16, 1, 0.3, 1],
  spring: [0.34, 1.56, 0.64, 1],
  inOut: [0.45, 0, 0.55, 1],
} as const;

/** GSAP names for the same curves. */
export const GSAP_EASE = { out: 'expo.out', inOut: 'power2.inOut', spring: 'back.out(1.6)', none: 'none' } as const;

const REDUCE = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** True when the visitor asked the system to reduce motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}

/**
 * Low-power devices (few cores, little memory, data saver on) get the light version of heavy
 * effects: no smooth-scroll engine, no custom cursor, fewer moving layers.
 */
export function isLowPowerDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || nav.connection?.saveData === true;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(REDUCE).matches;
}
