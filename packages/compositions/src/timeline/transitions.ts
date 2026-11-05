import { ease, TRANSITIONS_BY_ID, type Clip, type Track, type Transition } from '@adforge/core';

export type TransitionPhase = 'in' | 'out' | 'pairOut';

/** How a layer looks at one frame of a transition. Transforms are in canvas pixels around the canvas centre. */
export interface TransitionLook {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotate: number;
  blur: number;
  clipPath?: string;
  /** Solid colour drawn over the layer (dip to black, flash). */
  wash?: { color: string; opacity: number };
  /** Horizontal motion blur radius for whip pans. */
  motionBlur: number;
  /** Glitch strength 0..1. */
  glitch: number;
}

export const NEUTRAL_LOOK: TransitionLook = { opacity: 1, translateX: 0, translateY: 0, scale: 1, rotate: 0, blur: 0, motionBlur: 0, glitch: 0 };

/**
 * Look of a layer during a transition. `p` runs 0→1 through the phase:
 * for 'in' the layer arrives, for 'out' it leaves on its own, and for
 * 'pairOut' it is the outgoing clip underneath an incoming pair transition.
 */
export function transitionLook(
  transition: Transition,
  phase: TransitionPhase,
  rawP: number,
  canvas: { width: number; height: number; u: number },
  frame: number,
): TransitionLook {
  const p = ease(transition.easing, rawP);
  const q = 1 - p;
  const W = canvas.width;
  const H = canvas.height;
  const u = canvas.u;
  const look: TransitionLook = { ...NEUTRAL_LOOK };
  const arriving = phase === 'in';
  const leavingAlone = phase === 'out';
  const color = typeof transition.params.color === 'string' ? transition.params.color : '#FFFFFF';
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

  switch (transition.type) {
    case 'fade':
      look.opacity = arriving ? p : q;
      break;
    case 'crossfade':
      if (arriving) look.opacity = p;
      else if (leavingAlone) look.opacity = q;
      break;
    case 'dipBlack':
      look.wash = { color: '#000000', opacity: arriving ? q : p };
      break;
    case 'flash':
      look.wash = { color, opacity: arriving ? q ** 1.5 : p ** 1.5 };
      break;
    case 'slideLeft':
      look.translateX = arriving ? q * W : -p * W;
      break;
    case 'slideRight':
      look.translateX = arriving ? -q * W : p * W;
      break;
    case 'slideUp':
      look.translateY = arriving ? q * H : -p * H;
      break;
    case 'slideDown':
      look.translateY = arriving ? -q * H : p * H;
      break;
    case 'pushLeft':
      look.translateX = arriving ? q * W : -p * W;
      break;
    case 'pushUp':
      look.translateY = arriving ? q * H : -p * H;
      break;
    case 'wipeLeft':
      look.clipPath = arriving ? `inset(0 0 0 ${pct(q)})` : `inset(0 ${pct(p)} 0 0)`;
      break;
    case 'wipeDown':
      look.clipPath = arriving ? `inset(0 0 ${pct(q)} 0)` : `inset(${pct(p)} 0 0 0)`;
      break;
    case 'iris':
      look.clipPath = `circle(${pct((arriving ? p : q) * 0.75)} at 50% 50%)`;
      break;
    case 'zoomIn':
      if (arriving) {
        look.scale = 1.35 - 0.35 * p;
        look.blur = q * 16 * u;
        look.opacity = Math.min(1, p * 1.6);
      } else {
        look.scale = 1 + 0.6 * p;
        look.blur = p * 16 * u;
        if (leavingAlone) look.opacity = q;
      }
      break;
    case 'zoomOut':
      if (arriving) {
        look.scale = 0.7 + 0.3 * p;
        look.blur = q * 12 * u;
        look.opacity = Math.min(1, p * 1.6);
      } else {
        look.scale = 1 - 0.3 * p;
        look.blur = p * 12 * u;
        if (leavingAlone) look.opacity = q;
      }
      break;
    case 'whip':
      if (arriving) {
        look.translateX = q * 0.6 * W;
        look.motionBlur = q * 60 * u;
        look.opacity = Math.min(1, p * 2);
      } else {
        look.translateX = -p * 0.6 * W;
        look.motionBlur = p * 60 * u;
        if (leavingAlone) look.opacity = q;
      }
      break;
    case 'blur':
      if (arriving) {
        look.blur = q * 30 * u;
        look.opacity = p;
      } else {
        look.blur = p * 30 * u;
        if (leavingAlone) look.opacity = q;
      }
      break;
    case 'spin':
      if (arriving) {
        look.rotate = -q * 120;
        look.scale = 0.6 + 0.4 * p;
        look.opacity = Math.min(1, p * 1.5);
      } else {
        look.rotate = p * 120;
        look.scale = leavingAlone ? 1 - 0.4 * p : 1 + 0.4 * p;
        if (leavingAlone) look.opacity = q;
      }
      break;
    case 'glitch':
      look.glitch = arriving ? q : p;
      if (arriving) look.opacity = rawP < 0.12 ? (frame % 2 ? 0 : 0.6) : 1;
      else if (leavingAlone) look.opacity = rawP > 0.88 ? (frame % 2 ? 0 : 0.6) : 1;
      break;
    default:
      look.opacity = arriving ? p : q;
  }
  return look;
}

export function isPairTransition(t: Transition | null | undefined): t is Transition {
  return !!t && !!TRANSITIONS_BY_ID[t.type]?.pair;
}

/** Frames a clip keeps showing after its end because the next clip on its track starts with a pair transition. */
export function tailFrames(track: Track, clip: Clip): { frames: number; transition: Transition | null } {
  if (clip.type === 'audio') return { frames: 0, transition: null };
  const end = clip.start + clip.duration;
  const next = track.clips.find((c) => c.id !== clip.id && Math.abs(c.start - end) <= 1);
  if (!next || next.type === 'audio' || !isPairTransition(next.transitionIn)) return { frames: 0, transition: null };
  return { frames: Math.min(next.transitionIn.duration, next.duration), transition: next.transitionIn };
}

/** The transition look of a clip at a clip-relative frame, combining in, out and pair tails. */
export function clipTransitionLook(
  clip: Clip,
  frame: number,
  tail: { frames: number; transition: Transition | null },
  canvas: { width: number; height: number; u: number },
): TransitionLook | null {
  if (tail.transition && frame >= clip.duration) {
    return transitionLook(tail.transition, 'pairOut', (frame - clip.duration + 1) / (tail.frames + 1), canvas, frame);
  }
  const tin = clip.transitionIn;
  if (tin && frame < tin.duration) return transitionLook(tin, 'in', (frame + 1) / (tin.duration + 1), canvas, frame);
  const tout = clip.transitionOut;
  if (tout && frame >= clip.duration - tout.duration) {
    return transitionLook(tout, 'out', (frame - (clip.duration - tout.duration) + 1) / (tout.duration + 1), canvas, frame);
  }
  return null;
}

/** Audio gain multiplier for transitions: pair transitions crossfade the outgoing and incoming audio. */
export function transitionAudioGain(clip: Clip, frame: number, tail: { frames: number }, hasPairIn: boolean): number {
  if (tail.frames > 0 && frame >= clip.duration) return Math.max(0, 1 - (frame - clip.duration + 1) / (tail.frames + 1));
  if (hasPairIn && clip.transitionIn && frame < clip.transitionIn.duration) return (frame + 1) / (clip.transitionIn.duration + 1);
  return 1;
}
