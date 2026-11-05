import { useMemo, type CSSProperties } from 'react';
import { activeCaptionGroup, CAPTION_STYLES_BY_ID, ease, groupCaptionWords, textStyleSchema, type CaptionsClip } from '@adforge/core';
import { captionStyleOverrides } from '../fonts';
import { backPaint, frontPaint, needsBackLayer, typeCss } from '../text/style';
import { clamp } from '../utils';

const POSITION_PADDING = { top: 0.16, center: 0, bottom: 0.24 } as const;

/** Word-timed captions with the active word highlighted. */
export function CaptionsContent({ clip, frame, fps, u, box }: { clip: CaptionsClip; frame: number; fps: number; u: number; box: { width: number; height: number } }) {
  const def = CAPTION_STYLES_BY_ID[clip.styleId] ?? CAPTION_STYLES_BY_ID.pop!;
  const style = useMemo(() => textStyleSchema.parse({ ...def.style, ...captionStyleOverrides(clip.overrides) }), [def, clip.overrides]);
  const activeColor = typeof clip.overrides.activeColor === 'string' ? clip.overrides.activeColor : def.activeColor;
  const activeWord = (typeof clip.overrides.activeWord === 'string' ? clip.overrides.activeWord : def.activeWord) as typeof def.activeWord;
  const animation = (typeof clip.overrides.animation === 'string' ? clip.overrides.animation : def.animation) as typeof def.animation;
  const groups = useMemo(() => groupCaptionWords(clip.words, clip.maxWordsPerLine), [clip.words, clip.maxWordsPerLine]);
  const t = frame / fps;
  const group = activeCaptionGroup(groups, t);
  if (!group) return null;

  const since = t - group.start;
  const pIn = clamp(since / 0.18, 0, 1);
  const groupLook: CSSProperties =
    animation === 'pop'
      ? { transform: `scale(${0.82 + 0.18 * ease('easeOutBack', pIn)})`, opacity: clamp(pIn * 3, 0, 1) }
      : animation === 'fade'
        ? { opacity: ease('easeOutCubic', clamp(since / 0.12, 0, 1)) }
        : animation === 'slide'
          ? { transform: `translateY(${(1 - ease('easeOutCubic', clamp(since / 0.15, 0, 1))) * 0.35 * style.fontSize * u}px)`, opacity: clamp(since / 0.1, 0, 1) }
          : {};
  const back = needsBackLayer(style) || activeWord === 'box' || activeWord === 'underline';
  const activeIndex = (() => {
    let idx = -1;
    group.words.forEach((w, i) => {
      if (t >= w.start) idx = i;
    });
    return idx;
  })();

  const wordStyle = (i: number, layer: 'back' | 'front'): CSSProperties => {
    const active = i === activeIndex && t < group.words[i]!.end + 0.25;
    const spoken = i <= activeIndex;
    const base: CSSProperties = { display: 'inline-block', margin: '0 0.14em', padding: '0.02em 0.12em', borderRadius: '0.18em' };
    switch (activeWord) {
      case 'color':
        return { ...base, ...(layer === 'front' && active ? { color: activeColor, WebkitTextFillColor: activeColor } : {}) };
      case 'scale':
        return { ...base, transform: active ? 'scale(1.16)' : undefined, ...(layer === 'front' && active ? { color: activeColor, WebkitTextFillColor: activeColor } : {}) };
      case 'box':
        return { ...base, background: layer === 'back' && active ? activeColor : undefined };
      case 'underline':
        return { ...base, background: layer === 'back' ? (spoken ? activeColor : 'rgba(255,255,255,0.92)') : undefined };
      default:
        return base;
    }
  };

  const line = (layer: 'back' | 'front') => (
    <span
      style={{
        backgroundColor: layer === 'back' ? (style.backgroundColor ?? undefined) : undefined,
        padding: style.backgroundColor ? `${style.backgroundPadding * 0.5}em ${style.backgroundPadding}em` : undefined,
        borderRadius: style.backgroundColor ? `${style.backgroundRadius}em` : undefined,
        WebkitBoxDecorationBreak: 'clone',
        boxDecorationBreak: 'clone',
      }}
    >
      {group.words.map((w, i) => (
        <span key={`${group.start}-${i}`} style={wordStyle(i, layer)}>
          {w.text}
        </span>
      ))}
    </span>
  );

  const pad = POSITION_PADDING[clip.position] * box.height;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: clip.position === 'top' ? 'flex-start' : clip.position === 'bottom' ? 'flex-end' : 'center',
        justifyContent: 'center',
        paddingTop: clip.position === 'top' ? pad : 0,
        paddingBottom: clip.position === 'bottom' ? pad : 0,
      }}
    >
      <div style={{ display: 'grid', width: '88%', ...typeCss({ ...style, align: 'center' }, u), lineHeight: Math.max(style.lineHeight, 1.25), ...groupLook }}>
        {back && (
          <div aria-hidden style={{ gridArea: '1 / 1', ...backPaint(style, u) }}>
            {line('back')}
          </div>
        )}
        <div style={{ gridArea: '1 / 1', ...frontPaint(style) }}>{line('front')}</div>
      </div>
    </div>
  );
}
