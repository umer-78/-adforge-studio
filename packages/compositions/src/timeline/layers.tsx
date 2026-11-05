import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { transformAt, type AdjustmentClip, type Clip, type Track, type Transition } from '@adforge/core';
import { useRenderEnv } from '../context';
import { GlitchFilter, MotionBlurFilter } from '../effects/filters';
import { OverlayOpacity } from '../effects/overlays';
import { buildEffects } from '../effects/stack';
import { layerRect, layerStyle, maskStyle } from '../layout';
import { MotionView } from '../motion';
import { TextBlock } from '../text/TextBlock';
import { domId } from '../utils';
import type { AudioMix } from './audio';
import { CaptionsContent } from './captions';
import { AudioPlayback, ImageContent, VideoContent } from './media';
import { ShapeContent } from './shapes';
import { clipTransitionLook, transitionAudioGain, type TransitionLook } from './transitions';

export interface Tail {
  frames: number;
  transition: Transition | null;
}

export interface ClipViewProps {
  clip: Clip;
  track: Track;
  tail: Tail;
  /** The clip starts with a pair transition from an adjacent clip, so its audio crossfades in. */
  pairIn: boolean;
  mix: AudioMix;
  audible: boolean;
  visible: boolean;
}

/** Renders one clip inside its Sequence (frames are clip-relative). */
export function ClipView(props: ClipViewProps) {
  const frame = useCurrentFrame();
  const { clip, track, mix, audible, visible } = props;
  if (clip.type === 'audio') return <AudioPlayback clip={clip} frame={frame} track={track} mix={mix} audible={audible} />;
  if (!visible) return clip.type === 'video' ? <AudioPlayback clip={clip} frame={frame} track={track} mix={mix} audible={audible} /> : null;
  if (clip.type === 'adjustment') return <AdjustmentLayer clip={clip} frame={frame} />;
  return <VisualLayer {...props} frame={frame} />;
}

const numericSeed = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100_000, 7);

function transitionWrapper(look: TransitionLook | null, clipId: string, frame: number, u: number, washAsOpacity: boolean) {
  if (!look) return { style: {} as CSSProperties, defs: [] as ReactNode[] };
  const filters: string[] = [];
  const defs: ReactNode[] = [];
  if (look.blur > 0.05) filters.push(`blur(${look.blur}px)`);
  if (look.motionBlur > 0.3) {
    const id = domId(clipId, 'whip');
    defs.push(<MotionBlurFilter key="whip" id={id} amount={look.motionBlur} />);
    filters.push(`url(#${id})`);
  }
  if (look.glitch > 0.02) {
    const id = domId(clipId, 'tglitch');
    defs.push(<GlitchFilter key="tglitch" id={id} intensity={look.glitch} seed={frame * 13 + 5} u={u} />);
    filters.push(`url(#${id})`);
  }
  const transforms = [
    look.translateX || look.translateY ? `translate(${look.translateX}px, ${look.translateY}px)` : '',
    look.rotate ? `rotate(${look.rotate}deg)` : '',
    look.scale !== 1 ? `scale(${look.scale})` : '',
  ].filter(Boolean);
  const washOpacity = washAsOpacity && look.wash ? 1 - look.wash.opacity : 1;
  return {
    style: {
      opacity: look.opacity * washOpacity,
      transform: transforms.length ? transforms.join(' ') : undefined,
      filter: filters.length ? filters.join(' ') : undefined,
      clipPath: look.clipPath,
    } as CSSProperties,
    defs,
  };
}

function VisualLayer({ clip, track, tail, pairIn, mix, audible, frame }: ClipViewProps & { frame: number }) {
  const { canvas, assets } = useRenderEnv();
  const local = Math.min(frame, clip.duration - 1);
  const t = transformAt(clip, local);
  const rect = layerRect(t, canvas);
  const box = { width: rect.width, height: rect.height };
  const media = clip.type === 'video' || clip.type === 'image';
  const effects = buildEffects(clip.effects, { clipId: clip.id, frame, fps: canvas.fps, u: canvas.u, box, adjustment: false, media });
  const look = clipTransitionLook(clip, frame, tail, canvas);
  const wrapper = transitionWrapper(look, clip.id, frame, canvas.u, !media);
  const transitionGain = transitionAudioGain(clip, frame, tail, pairIn);

  let content: ReactNode = null;
  switch (clip.type) {
    case 'video':
      content = <VideoContent clip={clip} frame={frame} box={box} gl={effects.gl} track={track} mix={mix} tail={tail.frames} transitionGain={transitionGain} audible={audible} />;
      break;
    case 'image':
      content = <ImageContent clip={clip} box={box} gl={effects.gl} />;
      break;
    case 'text':
      content = (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: clip.style.align === 'left' ? 'flex-start' : clip.style.align === 'right' ? 'flex-end' : 'center' }}>
          <TextBlock text={clip.text} style={clip.style} animation={clip.animation} frame={local} duration={clip.duration} fps={canvas.fps} u={canvas.u} seed={numericSeed(clip.id)} />
        </div>
      );
      break;
    case 'captions':
      content = <CaptionsContent clip={clip} frame={local} fps={canvas.fps} u={canvas.u} box={box} />;
      break;
    case 'shape':
      content = <ShapeContent clip={clip} box={box} u={canvas.u} />;
      break;
    case 'motion':
      content = <MotionView templateId={clip.templateId} props={clip.props} assets={assets} frame={local} duration={clip.duration} fps={canvas.fps} u={canvas.u} width={box.width} height={box.height} />;
      break;
    default:
      content = null;
  }

  const { x, y, rotate, scale } = effects.motion;
  const motionTransform = x || y || rotate || scale !== 1 ? `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})` : undefined;
  const contentFilter = [effects.filter, t.blur > 0.05 ? `blur(${t.blur * canvas.u}px)` : ''].filter(Boolean).join(' ');
  const defs = [...effects.defs, ...wrapper.defs];

  return (
    <div style={{ position: 'absolute', inset: 0, mixBlendMode: clip.blendMode === 'normal' ? undefined : clip.blendMode, ...wrapper.style }}>
      {defs.length > 0 && (
        <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
          <defs>{defs}</defs>
        </svg>
      )}
      <div style={{ ...layerStyle(t, canvas), ...maskStyle(clip.mask, box), overflow: media ? 'hidden' : 'visible', isolation: 'isolate' }}>
        <div style={{ position: 'absolute', inset: 0, filter: contentFilter || undefined, transform: motionTransform }}>{content}</div>
        {effects.overlays}
        {media && look?.wash && look.wash.opacity > 0 && <div style={{ position: 'absolute', inset: 0, background: look.wash.color, opacity: look.wash.opacity }} />}
      </div>
    </div>
  );
}

/**
 * Adjustment layers filter everything drawn below them: CSS effects become a
 * backdrop filter and overlays blend straight onto the layers underneath.
 */
function AdjustmentLayer({ clip, frame }: { clip: AdjustmentClip; frame: number }) {
  const { canvas } = useRenderEnv();
  const local = Math.min(frame, clip.duration - 1);
  const t = transformAt(clip, local);
  const rect = layerRect(t, canvas);
  const box = { width: rect.width, height: rect.height };
  const effects = buildEffects(clip.effects, { clipId: clip.id, frame, fps: canvas.fps, u: canvas.u, box, adjustment: true, media: false });
  const look = clipTransitionLook(clip, frame, { frames: 0, transition: null }, canvas);
  const opacity = t.opacity * (look?.opacity ?? 1);
  const identity = t.rotation === 0 && t.scale === 1 && !t.flipX && !t.flipY;
  const placed: CSSProperties = {
    position: 'absolute',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    ...(identity ? {} : { transform: layerStyle(t, canvas).transform, transformOrigin: layerStyle(t, canvas).transformOrigin }),
  };
  const shaped: CSSProperties = { ...maskStyle(clip.mask, box), ...(look?.clipPath ? { clipPath: look.clipPath } : {}) };
  return (
    <>
      {effects.filter && <div style={{ ...placed, ...shaped, opacity, backdropFilter: effects.filter, WebkitBackdropFilter: effects.filter }} />}
      {effects.overlays.length > 0 && (
        <OverlayOpacity.Provider value={opacity}>
          <div style={{ ...placed, ...shaped }}>{effects.overlays}</div>
        </OverlayOpacity.Provider>
      )}
    </>
  );
}
