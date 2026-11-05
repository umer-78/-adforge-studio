import type { CSSProperties, ReactNode } from 'react';
import { ease, type TextAnimation, type TextAnimationId, type TextStyle } from '@adforge/core';
import { clamp, seededRandom, smoothNoise } from '../utils';
import { backPaint, boxCss, frontPaint, needsBackLayer, typeCss } from './style';

export interface TextBlockProps {
  text: string;
  style: TextStyle;
  /** Null renders the text statically. */
  animation: TextAnimation | null;
  /** Frame relative to the clip start. */
  frame: number;
  duration: number;
  fps: number;
  u: number;
  /** Changes the glitch pattern between clips. */
  seed?: number;
}

type Split = 'none' | 'words' | 'chars';

interface Look {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  blur: number;
}

const SHOWN: Look = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, blur: 0 };

const SPLIT: Partial<Record<TextAnimationId, Split>> = {
  typewriter: 'chars',
  letterByLetter: 'chars',
  wave: 'chars',
  wordByWord: 'words',
  kinetic: 'words',
};

/** Progress of unit i of n when units start one after another and each takes `span` slots. */
function stagger(p: number, i: number, n: number, span: number): number {
  const slots = n + span - 1;
  return clamp((p * slots - i) / span, 0, 1);
}

interface Token {
  text: string;
  emphasis: boolean;
}

/** Splits text into lines of tokens; *wrapped* words are emphasised in the highlight colour. */
function tokenize(text: string): Token[][] {
  return text.split('\n').map((line) => {
    const out: Token[] = [];
    const re = /\*([^*\n]+)\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push({ text: line.slice(last, m.index), emphasis: false });
      out.push({ text: m[1]!, emphasis: true });
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push({ text: line.slice(last), emphasis: false });
    if (!out.length) out.push({ text: ' ', emphasis: false });
    return out;
  });
}

function blockLook(anim: TextAnimationId, p: number, raw: number, leaving: boolean, em: number, frame: number, seed: number): Look & { split?: number } {
  const look = { ...SHOWN };
  const d = 0.8 * em;
  switch (anim) {
    case 'fade':
      look.opacity = p;
      break;
    case 'slideUp':
      look.y = (leaving ? -1 : 1) * (1 - p) * d;
      look.opacity = p;
      break;
    case 'slideDown':
      look.y = (leaving ? 1 : -1) * (1 - p) * d;
      look.opacity = p;
      break;
    case 'slideLeft':
      look.x = (leaving ? -1 : 1) * (1 - p) * d * 1.5;
      look.opacity = p;
      break;
    case 'slideRight':
      look.x = (leaving ? 1 : -1) * (1 - p) * d * 1.5;
      look.opacity = p;
      break;
    case 'pop':
      look.scale = leaving ? 0.4 + 0.6 * p : 0.4 + 0.6 * ease('easeOutBack', raw);
      look.opacity = clamp(leaving ? p : raw * 3, 0, 1);
      break;
    case 'scaleIn':
      look.scale = 0.8 + 0.2 * p;
      look.opacity = p;
      break;
    case 'blurIn':
      look.blur = (1 - p) * 0.4 * em;
      look.scale = 1.06 - 0.06 * p;
      look.opacity = p;
      break;
    case 'bounce':
      look.y = leaving ? (1 - p) * -d : -(1 - ease('easeOutBounce', raw)) * 1.6 * em;
      look.opacity = clamp(leaving ? p : raw * 4, 0, 1);
      break;
    case 'glitch': {
      const k = 1 - p;
      look.x = (seededRandom(frame * 7.13 + seed) - 0.5) * 0.3 * em * k;
      look.y = (seededRandom(frame * 3.71 + seed) - 0.5) * 0.08 * em * k;
      look.opacity = raw < 0.6 && frame % 3 === 0 ? 0.35 : clamp(raw * 2, 0, 1);
      return { ...look, split: k * 0.09 * em };
    }
    case 'highlight':
      look.opacity = clamp(leaving ? p : raw * 3, 0, 1);
      break;
    default:
      break;
  }
  return look;
}

function unitLook(anim: TextAnimationId, up: number, i: number, em: number): Look {
  const look = { ...SHOWN };
  switch (anim) {
    case 'typewriter':
      look.opacity = up > 0 ? 1 : 0;
      break;
    case 'letterByLetter':
      look.opacity = up;
      look.y = (1 - ease('easeOutCubic', up)) * 0.35 * em;
      break;
    case 'wave':
      look.opacity = clamp(up * 2, 0, 1);
      look.y = (1 - ease('easeOutBack', up)) * 0.6 * em;
      break;
    case 'wordByWord':
      look.opacity = clamp(up * 2, 0, 1);
      look.scale = 0.7 + 0.3 * ease('easeOutBack', up);
      look.y = (1 - up) * 0.2 * em;
      break;
    case 'kinetic':
      look.opacity = up > 0 ? 1 : 0;
      look.scale = 2.2 - 1.2 * ease('easeOutCubic', up);
      look.rotate = (i % 2 ? -7 : 7) * (1 - up);
      break;
    default:
      break;
  }
  return look;
}

function lookCss(l: Look): CSSProperties {
  const transforms = [
    l.x || l.y ? `translate(${l.x}px, ${l.y}px)` : '',
    l.rotate ? `rotate(${l.rotate}deg)` : '',
    l.scale !== 1 ? `scale(${l.scale})` : '',
  ].filter(Boolean);
  return {
    opacity: l.opacity,
    transform: transforms.length ? transforms.join(' ') : undefined,
    filter: l.blur > 0.05 ? `blur(${l.blur}px)` : undefined,
  };
}

function loopLook(loop: TextAnimation['loop'], t: number, em: number): Look {
  const look = { ...SHOWN };
  switch (loop) {
    case 'pulse':
      look.scale = 1 + 0.045 * Math.sin(t * Math.PI * 2 * 1.1);
      break;
    case 'float':
      look.y = Math.sin(t * Math.PI * 2 * 0.45) * 0.09 * em;
      break;
    case 'shake':
      look.x = smoothNoise(5, t * 14) * 0.035 * em;
      look.y = smoothNoise(9, t * 14) * 0.025 * em;
      break;
    case 'wiggle':
      look.rotate = Math.sin(t * Math.PI * 2 * 1.4) * 3;
      break;
    default:
      break;
  }
  return look;
}

/** Styled, animated text used by text clips and motion templates. */
export function TextBlock({ text, style, animation, frame, duration, fps, u, seed = 1 }: TextBlockProps) {
  const em = style.fontSize * u;
  let anim: TextAnimationId = 'none';
  let raw = 1;
  let leaving = false;
  if (animation) {
    let inD = animation.in === 'none' ? 0 : animation.inDuration;
    let outD = animation.out === 'none' ? 0 : animation.outDuration;
    if (inD + outD > duration) {
      const k = duration / (inD + outD);
      inD = Math.floor(inD * k);
      outD = Math.floor(outD * k);
    }
    if (inD > 0 && frame < inD) {
      anim = animation.in;
      raw = clamp((frame + 1) / inD, 0, 1);
    } else if (outD > 0 && frame >= duration - outD) {
      anim = animation.out;
      raw = clamp(1 - (frame - (duration - outD) + 1) / outD, 0, 1);
      leaving = true;
    }
  }
  const p = leaving ? ease('easeInCubic', raw) : ease('easeOutCubic', raw);
  const split: Split = SPLIT[anim] ?? 'none';
  const block = blockLook(anim, p, raw, leaving, em, frame, seed);
  const loop = animation ? loopLook(animation.loop, frame / fps, em) : SHOWN;
  const combined: Look = {
    opacity: block.opacity,
    x: block.x + loop.x,
    y: block.y + loop.y,
    scale: block.scale * loop.scale,
    rotate: block.rotate + loop.rotate,
    blur: block.blur,
  };
  const highlight = anim === 'highlight' || animation?.in === 'highlight' ? { color: style.highlightColor, progress: anim === 'highlight' ? p : 1 } : undefined;
  const hasBack = needsBackLayer(style) || !!highlight;

  const lines = tokenize(text);
  const unitCount = (() => {
    if (split === 'none') return 0;
    let n = 0;
    for (const line of lines)
      for (const tok of line) n += split === 'chars' ? [...tok.text.replace(/\s/g, '')].length : tok.text.split(/\s+/).filter(Boolean).length;
    return n;
  })();
  const span = anim === 'typewriter' ? 1 : anim === 'kinetic' ? 1.2 : split === 'chars' ? 4 : 1.6;
  const unitStyle = (i: number): CSSProperties => {
    const up = stagger(raw, i, unitCount, span);
    return { display: 'inline-block', ...lookCss(unitLook(anim, up, i, em)) };
  };

  const renderLayer = (layer: 'back' | 'front'): ReactNode => {
    let unit = 0;
    return lines.map((line, li) => (
      <div key={li}>
        <span style={boxCss(style, highlight, layer === 'back' || !hasBack)}>
          {line.map((tok, ti) => {
            const color = layer === 'front' && tok.emphasis ? style.highlightColor : undefined;
            const paint: CSSProperties | undefined = color ? { color, WebkitTextFillColor: color } : undefined;
            if (split === 'none') {
              return (
                <span key={ti} style={paint}>
                  {tok.text}
                </span>
              );
            }
            const parts = tok.text.split(/(\s+)/);
            return (
              <span key={ti} style={paint}>
                {parts.map((part, pi) => {
                  if (!part) return null;
                  if (/^\s+$/.test(part)) return part;
                  if (split === 'words') return <span key={pi} style={unitStyle(unit++)}>{part}</span>;
                  return (
                    <span key={pi} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
                      {[...part].map((ch, ci) => (
                        <span key={ci} style={unitStyle(unit++)}>
                          {ch}
                        </span>
                      ))}
                    </span>
                  );
                })}
              </span>
            );
          })}
        </span>
      </div>
    ));
  };

  const glitchSplit = block.split ?? 0;
  return (
    <div style={{ display: 'grid', width: '100%', ...typeCss(style, u), ...lookCss(combined) }}>
      {hasBack && (
        <div aria-hidden style={{ gridArea: '1 / 1', ...backPaint(style, u) }}>
          {renderLayer('back')}
        </div>
      )}
      <div
        style={{
          gridArea: '1 / 1',
          ...frontPaint(style),
          filter: glitchSplit > 0.2 ? `drop-shadow(${glitchSplit}px 0 0 rgba(255,0,90,0.85)) drop-shadow(${-glitchSplit}px 0 0 rgba(0,235,255,0.85))` : undefined,
        }}
      >
        {renderLayer('front')}
      </div>
    </div>
  );
}
