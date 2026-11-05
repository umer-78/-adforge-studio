import type { CSSProperties } from 'react';
import type { TextStyle } from '@adforge/core';

export function fontStack(family: string): string {
  const generic = /mono/i.test(family) ? 'ui-monospace, monospace' : /serif|playfair|dm serif/i.test(family) ? 'Georgia, serif' : 'system-ui, sans-serif';
  return `"${family}", ${generic}, "Noto Color Emoji", "Apple Color Emoji"`;
}

/** Font and layout properties shared by every paint layer of a text block. */
export function typeCss(style: TextStyle, u: number): CSSProperties {
  return {
    fontFamily: fontStack(style.fontFamily),
    fontWeight: style.fontWeight,
    fontSize: style.fontSize * u,
    lineHeight: style.lineHeight,
    letterSpacing: `${style.letterSpacing}em`,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    fontStyle: style.italic ? 'italic' : 'normal',
    textAlign: style.align,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    fontKerning: 'normal',
    fontVariantLigatures: 'common-ligatures',
  };
}

/** Whether a back layer (stroke, shadow or background box) is needed. */
export function needsBackLayer(style: TextStyle): boolean {
  return (!!style.strokeColor && style.strokeWidth > 0) || (!!style.shadowColor && (style.shadowBlur > 0 || style.shadowX !== 0 || style.shadowY !== 0)) || !!style.backgroundColor;
}

/** Paint for the back layer: outer stroke, drop shadow and the solid colour under the glyphs. */
export function backPaint(style: TextStyle, u: number): CSSProperties {
  const stroke = style.strokeColor && style.strokeWidth > 0 ? style.strokeWidth * u : 0;
  const solid = style.strokeColor && stroke ? style.strokeColor : style.gradient ? style.gradient[0] : style.color;
  return {
    color: solid,
    WebkitTextStroke: stroke ? `${stroke * 2}px ${style.strokeColor}` : undefined,
    textShadow:
      style.shadowColor && (style.shadowBlur > 0 || style.shadowX !== 0 || style.shadowY !== 0)
        ? `${style.shadowX * u}px ${style.shadowY * u}px ${style.shadowBlur * u}px ${style.shadowColor}`
        : undefined,
  };
}

/** Paint for the front layer: flat colour or gradient fill. */
export function frontPaint(style: TextStyle, color?: string): CSSProperties {
  if (color) return { color };
  if (style.gradient) {
    return {
      color: 'transparent',
      backgroundImage: `linear-gradient(180deg, ${style.gradient[0]}, ${style.gradient[1]})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
    };
  }
  return { color: style.color };
}

/**
 * Background box around each line, on the inline run so wrapped lines get
 * their own box. `highlight` draws a marker that sweeps in from the left.
 * Layers that only need matching layout pass `paint: false`.
 */
export function boxCss(style: TextStyle, highlight?: { color: string; progress: number }, paint = true): CSSProperties {
  const images: string[] = [];
  const sizes: string[] = [];
  if (highlight && highlight.progress > 0) {
    images.push(`linear-gradient(${highlight.color}, ${highlight.color})`);
    sizes.push(`${(highlight.progress * 100).toFixed(2)}% 100%`);
  }
  if (style.backgroundColor) {
    images.push(`linear-gradient(${style.backgroundColor}, ${style.backgroundColor})`);
    sizes.push('100% 100%');
  }
  const pad = style.backgroundPadding;
  const padded = !!style.backgroundColor || !!highlight;
  return {
    padding: padded ? (style.backgroundColor ? `${pad * 0.6}em ${pad}em` : '0.04em 0.18em') : undefined,
    borderRadius: style.backgroundColor ? `${style.backgroundRadius}em` : highlight ? '0.12em' : undefined,
    backgroundImage: paint && images.length ? images.join(', ') : undefined,
    backgroundSize: paint && sizes.length ? sizes.join(', ') : undefined,
    backgroundRepeat: 'no-repeat',
    WebkitBoxDecorationBreak: 'clone',
    boxDecorationBreak: 'clone',
  };
}
