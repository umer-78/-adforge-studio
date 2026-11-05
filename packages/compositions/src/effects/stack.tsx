import type { ReactNode } from 'react';
import { defaultEffectParams, type EffectInstance, type ParamValue } from '@adforge/core';
import { domId, num, seededRandom, smoothNoise, str } from '../utils';
import { ChromaticFilter, DuotoneFilter, GlitchFilter, GlowFilter, SharpenFilter, TemperatureFilter } from './filters';
import { Grain, LightLeak, Letterbox, TemperatureWash, Vhs, Vignette } from './overlays';

export interface EffectBuildContext {
  clipId: string;
  /** Frame relative to the clip start. */
  frame: number;
  fps: number;
  u: number;
  box: { width: number; height: number };
  /** Adjustment layers filter the layers below them instead of their own content. */
  adjustment: boolean;
  /** Video and image clips can run WebGL passes. */
  media: boolean;
}

export type GlPassSpec =
  | { kind: 'lut'; preset: string; lutAssetId: string | null; intensity: number }
  | { kind: 'pixelate'; size: number }
  | { kind: 'chromaKey'; key: string; similarity: number; smoothness: number; spill: number };

export interface BuiltEffects {
  /** CSS filter for the layer content, or the backdrop filter on adjustment layers. */
  filter: string;
  /** SVG <filter> elements referenced from `filter`. */
  defs: ReactNode[];
  /** Drawn above the content inside the layer box. */
  overlays: ReactNode[];
  /** Extra camera motion applied to the content. */
  motion: { x: number; y: number; rotate: number; scale: number };
  gl: GlPassSpec[];
}

export const NO_EFFECTS: BuiltEffects = { filter: '', defs: [], overlays: [], motion: { x: 0, y: 0, rotate: 0, scale: 1 }, gl: [] };

export function buildEffects(effects: readonly EffectInstance[], ctx: EffectBuildContext): BuiltEffects {
  const active = effects.filter((e) => e.enabled);
  if (!active.length) return NO_EFFECTS;
  const filters: string[] = [];
  const defs: ReactNode[] = [];
  const overlays: ReactNode[] = [];
  const gl: GlPassSpec[] = [];
  const motion = { x: 0, y: 0, rotate: 0, scale: 1 };
  const t = ctx.frame / ctx.fps;
  const { u } = ctx;

  for (const e of active) {
    const p: Record<string, ParamValue> = { ...defaultEffectParams(e.type), ...e.params };
    const id = domId(ctx.clipId, e.id);
    const svg = (node: ReactNode) => {
      if (ctx.adjustment) return;
      defs.push(node);
      filters.push(`url(#${id})`);
    };
    switch (e.type) {
      case 'adjust':
        filters.push(`brightness(${num(p.brightness, 1)}) contrast(${num(p.contrast, 1)}) saturate(${num(p.saturation, 1)}) hue-rotate(${num(p.hue, 0)}deg)`);
        break;
      case 'temperature':
        if (ctx.adjustment) overlays.push(<TemperatureWash key={e.id} temperature={num(p.temperature, 0)} tint={num(p.tint, 0)} />);
        else svg(<TemperatureFilter key={e.id} id={id} temperature={num(p.temperature, 0)} tint={num(p.tint, 0)} />);
        break;
      case 'lut':
        if (ctx.media) gl.push({ kind: 'lut', preset: str(p.preset, 'teal-orange'), lutAssetId: str(p.cubeAssetId, '') || null, intensity: num(p.intensity, 0.8) });
        break;
      case 'duotone':
        svg(<DuotoneFilter key={e.id} id={id} shadows={str(p.shadows, '#1B0B3A')} highlights={str(p.highlights, '#22D3EE')} />);
        break;
      case 'grayscale':
        filters.push(`grayscale(${num(p.amount, 1)})`);
        break;
      case 'sepia':
        filters.push(`sepia(${num(p.amount, 0.7)})`);
        break;
      case 'invert':
        filters.push(`invert(${num(p.amount, 1)})`);
        break;
      case 'blur':
        filters.push(`blur(${num(p.radius, 8) * u}px)`);
        break;
      case 'sharpen':
        svg(<SharpenFilter key={e.id} id={id} amount={num(p.amount, 0.6)} />);
        break;
      case 'glow':
        svg(<GlowFilter key={e.id} id={id} radius={num(p.radius, 18) * u} intensity={num(p.intensity, 0.6)} color={str(p.color, '#7C5CFF')} />);
        break;
      case 'vignette':
        overlays.push(<Vignette key={e.id} strength={num(p.strength, 0.5)} size={num(p.size, 0.65)} color={str(p.color, '#000000')} />);
        break;
      case 'lightLeak':
        overlays.push(<LightLeak key={e.id} t={t} intensity={num(p.intensity, 0.5)} hue={num(p.hue, 25)} speed={num(p.speed, 1)} />);
        break;
      case 'grain':
        overlays.push(<Grain key={e.id} id={`${id}-grain`} frame={ctx.frame} amount={num(p.amount, 0.25)} size={num(p.size, 1)} />);
        break;
      case 'chromatic':
        svg(<ChromaticFilter key={e.id} id={id} offset={num(p.offset, 4) * u} />);
        break;
      case 'glitch': {
        const intensity = num(p.intensity, 0.5);
        const seed = num(p.seed, 7);
        const window = Math.floor(ctx.frame / 3);
        const burst = seededRandom(seed * 31.7 + window) < num(p.frequency, 0.3);
        if (burst && intensity > 0) {
          svg(<GlitchFilter key={e.id} id={id} intensity={intensity} seed={seed * 1000 + ctx.frame} u={u} />);
          motion.x += (seededRandom(seed + ctx.frame * 1.31) - 0.5) * 24 * u * intensity;
        }
        break;
      }
      case 'vhs': {
        const i = num(p.intensity, 0.6);
        filters.push(`saturate(${1 + 0.3 * i}) contrast(${1 + 0.08 * i})`);
        if (ctx.adjustment) filters.push(`blur(${0.6 * i * u}px)`);
        else svg(<ChromaticFilter key={`${e.id}-split`} id={id} offset={2.5 * i * u} />);
        overlays.push(<Vhs key={e.id} id={`${id}-noise`} frame={ctx.frame} fps={ctx.fps} intensity={i} u={u} />);
        break;
      }
      case 'pixelate':
        if (ctx.media) gl.push({ kind: 'pixelate', size: num(p.size, 12) * u });
        break;
      case 'letterbox':
        overlays.push(<Letterbox key={e.id} ratio={num(p.ratio, 2.39)} color={str(p.color, '#000000')} box={ctx.box} />);
        break;
      case 'shake': {
        const i = num(p.intensity, 0.3);
        const s = t * num(p.speed, 1) * 7;
        motion.x += smoothNoise(3, s) * 28 * u * i;
        motion.y += smoothNoise(11, s) * 28 * u * i;
        motion.rotate += smoothNoise(17, s * 0.8) * 1.6 * i;
        motion.scale *= 1 + 0.05 * i;
        break;
      }
      case 'zoomPulse': {
        const beat = 60 / Math.max(1, num(p.bpm, 120));
        const phase = (t % beat) / beat;
        motion.scale *= 1 + num(p.amount, 0.08) * Math.exp(-phase * 7);
        break;
      }
      case 'chromaKey':
        if (ctx.media)
          gl.push({ kind: 'chromaKey', key: str(p.keyColor, '#00FF00'), similarity: num(p.similarity, 0.4), smoothness: num(p.smoothness, 0.08), spill: num(p.spill, 0.1) });
        break;
      default:
        break;
    }
  }
  return { filter: filters.join(' '), defs, overlays, motion, gl };
}
