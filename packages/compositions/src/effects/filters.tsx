import { parseColor, seededRandom } from '../utils';

/** SVG filter primitives used by effects and transitions. All work in sRGB so colours match CSS. */

export function DuotoneFilter({ id, shadows, highlights }: { id: string; shadows: string; highlights: string }) {
  const s = parseColor(shadows);
  const h = parseColor(highlights);
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={`${s[0]} ${h[0]}`} />
        <feFuncG type="table" tableValues={`${s[1]} ${h[1]}`} />
        <feFuncB type="table" tableValues={`${s[2]} ${h[2]}`} />
      </feComponentTransfer>
    </filter>
  );
}

export function SharpenFilter({ id, amount }: { id: string; amount: number }) {
  const a = Math.max(0, amount);
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feConvolveMatrix order={3} kernelMatrix={`0 ${-a} 0 ${-a} ${1 + 4 * a} ${-a} 0 ${-a} 0`} preserveAlpha="true" />
    </filter>
  );
}

const CHANNELS = {
  r: '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0',
  g: '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0',
  b: '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0',
};

/** RGB split: red shifted left, blue right. */
export function ChromaticFilter({ id, offset }: { id: string; offset: number }) {
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
      <ChromaticPrimitives input="SourceGraphic" offset={offset} />
    </filter>
  );
}

function ChromaticPrimitives({ input, offset, dy = 0 }: { input: string; offset: number; dy?: number }) {
  return (
    <>
      <feColorMatrix in={input} type="matrix" values={CHANNELS.r} result="cr" />
      <feOffset in="cr" dx={-offset} dy={-dy} result="cr2" />
      <feColorMatrix in={input} type="matrix" values={CHANNELS.g} result="cg" />
      <feColorMatrix in={input} type="matrix" values={CHANNELS.b} result="cb" />
      <feOffset in="cb" dx={offset} dy={dy} result="cb2" />
      <feBlend in="cr2" in2="cg" mode="screen" result="crg" />
      <feBlend in="crg" in2="cb2" mode="screen" />
    </>
  );
}

/** Bloom: bright areas are tinted, blurred and screened back over the source. */
export function GlowFilter({ id, radius, intensity, color }: { id: string; radius: number; intensity: number; color: string }) {
  return (
    <filter id={id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.34 1.14 0.12 0 -0.35" result="bright" />
      <feFlood floodColor={color} floodOpacity={Math.min(1, intensity)} />
      <feComposite in2="bright" operator="in" result="tint" />
      <feGaussianBlur in="tint" stdDeviation={Math.max(0.1, radius / 2)} result="bloom" />
      <feBlend in="SourceGraphic" in2="bloom" mode="screen" />
    </filter>
  );
}

/** White balance shift for a single layer. Positive temperature warms, positive tint adds magenta. */
export function TemperatureFilter({ id, temperature, tint }: { id: string; temperature: number; tint: number }) {
  const t = temperature;
  const m = tint;
  const r = 1 + 0.14 * t + 0.05 * m;
  const g = 1 - 0.1 * m;
  const b = 1 - 0.16 * t + 0.05 * m;
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values={`${r} 0 0 0 ${0.015 * t} 0 ${g} 0 0 0 0 0 ${b} 0 ${-0.015 * t} 0 0 0 1 0`} />
    </filter>
  );
}

/** Horizontal-only blur for whip pans. */
export function MotionBlurFilter({ id, amount }: { id: string; amount: number }) {
  return (
    <filter id={id} x="-20%" y="0" width="140%" height="100%" colorInterpolationFilters="sRGB">
      <feGaussianBlur stdDeviation={`${Math.max(0, amount)} 0`} edgeMode="duplicate" />
    </filter>
  );
}

/**
 * Digital glitch: horizontal bands displaced sideways plus an RGB split.
 * `seed` should change every few frames so the slicing jumps.
 */
export function GlitchFilter({ id, intensity, seed, u }: { id: string; intensity: number; seed: number; u: number }) {
  const r = seededRandom(seed);
  const bands = 0.012 + r * 0.06;
  const scale = (30 + 90 * seededRandom(seed + 7)) * intensity * u;
  const split = (2 + 10 * seededRandom(seed + 13)) * intensity * u;
  return (
    <filter id={id} x="-10%" y="-2%" width="120%" height="104%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={`0.00001 ${bands}`} numOctaves={1} seed={Math.floor(seed) % 1000} result="noise" />
      <feColorMatrix in="noise" type="matrix" values="9 0 0 0 -4 0 0 0 0 0.5 0 0 0 0 0 0 0 0 0 1" result="steps" />
      <feDisplacementMap in="SourceGraphic" in2="steps" scale={scale} xChannelSelector="R" yChannelSelector="G" result="shifted" />
      <ChromaticPrimitives input="shifted" offset={split} dy={split * 0.15} />
    </filter>
  );
}
