/** Shared motion tokens used by the web UI (CSS, Motion, GSAP) and video compositions. */
export const motion = {
  duration: {
    instant: 0.12,
    fast: 0.2,
    base: 0.32,
    slow: 0.5,
    slower: 0.8,
    cinematic: 1.2,
  },
  ease: {
    out: [0.16, 1, 0.3, 1],
    inOut: [0.65, 0, 0.35, 1],
    in: [0.7, 0, 0.84, 0],
    emphasized: [0.2, 0, 0, 1],
    anticipate: [0.36, 0, 0.66, -0.56],
  },
  spring: {
    snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 },
    gentle: { type: 'spring', stiffness: 170, damping: 26, mass: 1 },
    bouncy: { type: 'spring', stiffness: 300, damping: 15, mass: 0.9 },
  },
  stagger: { fast: 0.03, base: 0.06, slow: 0.1 },
  distance: { sm: 8, md: 16, lg: 32, xl: 64 },
} as const;

export type EaseName = keyof typeof motion.ease;

export const cssEase = (name: EaseName) => `cubic-bezier(${motion.ease[name].join(', ')})`;

export const gsapEase: Record<EaseName, string> = {
  out: 'expo.out',
  inOut: 'power3.inOut',
  in: 'power3.in',
  emphasized: 'power4.out',
  anticipate: 'back.in(1.7)',
};
