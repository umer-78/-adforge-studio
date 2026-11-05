import * as z from 'zod';
import { motionDefaults, MOTION_TEMPLATES_BY_ID } from '../motion-templates';
import { clamp, round } from '../utils';
import { CAPTION_STYLES_BY_ID, EFFECTS_BY_ID, TRANSITIONS_BY_ID } from './catalog';
import * as ops from './ops';
import { ANIMATABLE_PROPS, type AnimatableProp, type AssetMap, type TimelineData } from './schema';

export const EDIT_OP_TYPES = [
  'split',
  'trim_start',
  'trim_end',
  'delete',
  'ripple_delete_range',
  'move',
  'duplicate',
  'set_speed',
  'set_volume',
  'fade_audio',
  'add_text',
  'update_text',
  'add_transition',
  'add_effect',
  'add_motion',
  'set_transform',
  'add_keyframe',
  'add_marker',
  'set_caption_style',
] as const;

/** Flat shape so it works well with structured outputs; unused fields are null. */
export const editOpSchema = z.object({
  op: z.enum(EDIT_OP_TYPES),
  clipId: z.string().nullable().describe('Target clip id from the timeline summary'),
  trackId: z.string().nullable(),
  atSeconds: z.number().nullable().describe('Absolute timeline time in seconds'),
  toSeconds: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  value: z.number().nullable().describe('Numeric value: speed multiplier, volume 0-2, transform value'),
  text: z.string().nullable(),
  name: z.string().nullable().describe('Transition, effect, motion template, caption style or keyframe property id'),
  edge: z.enum(['in', 'out']).nullable(),
  reason: z.string().describe('One short sentence the user will see'),
});
export type EditOp = z.infer<typeof editOpSchema>;

export const editPlanSchema = z.object({
  summary: z.string().describe('What the edit does, in one or two sentences'),
  ops: z.array(editOpSchema),
});
export type EditPlan = z.infer<typeof editPlanSchema>;

export interface ApplyResult {
  applied: number;
  errors: string[];
}

/** Applies an edit plan to a timeline (mutates). Invalid ops are skipped and reported. */
export function applyEditPlan(tl: TimelineData, plan: EditPlan): ApplyResult {
  const errors: string[] = [];
  let applied = 0;
  const f = (sec: number | null | undefined) => Math.max(0, Math.round((sec ?? 0) * tl.fps));
  for (const [i, op] of plan.ops.entries()) {
    try {
      const target = op.clipId ? ops.findClip(tl, op.clipId) : null;
      const needClip = () => {
        if (!target) throw new Error('clip not found');
        return target;
      };
      switch (op.op) {
        case 'split':
          if (!ops.splitClip(tl, needClip().clip.id, f(op.atSeconds))) throw new Error('split point outside clip');
          break;
        case 'trim_start': {
          const { clip } = needClip();
          ops.trimClip(tl, clip.id, 'start', f(op.atSeconds) - clip.start);
          break;
        }
        case 'trim_end': {
          const { clip } = needClip();
          ops.trimClip(tl, clip.id, 'end', f(op.atSeconds) - (clip.start + clip.duration));
          break;
        }
        case 'delete':
          ops.removeClip(tl, needClip().clip.id, { ripple: true });
          break;
        case 'ripple_delete_range':
          ops.rippleDeleteRange(tl, f(op.atSeconds), f(op.toSeconds));
          break;
        case 'move':
          if (!ops.moveClip(tl, needClip().clip.id, { start: f(op.atSeconds), ...(op.trackId ? { trackId: op.trackId } : {}) })) throw new Error('target slot is occupied');
          break;
        case 'duplicate':
          ops.duplicateClip(tl, needClip().clip.id);
          break;
        case 'set_speed':
          ops.setSpeed(tl, needClip().clip.id, clamp(op.value ?? 1, 0.1, 16));
          break;
        case 'set_volume': {
          const { clip } = needClip();
          if (clip.type !== 'video' && clip.type !== 'audio') throw new Error('clip has no audio');
          clip.audio.volume = clamp(op.value ?? 1, 0, 4);
          clip.audio.muted = (op.value ?? 1) === 0;
          break;
        }
        case 'fade_audio': {
          const { clip } = needClip();
          if (clip.type !== 'video' && clip.type !== 'audio') throw new Error('clip has no audio');
          const secs = clamp(op.durationSeconds ?? 1, 0, 30);
          if (op.edge === 'out') clip.audio.fadeOut = secs;
          else clip.audio.fadeIn = secs;
          break;
        }
        case 'add_text': {
          const start = f(op.atSeconds);
          const duration = Math.max(1, f(op.durationSeconds ?? 3));
          ops.addClip(tl, ops.makeClip({ type: 'text', start, duration, text: op.text ?? 'Text', transform: { y: op.value ?? -0.3, width: 0.86 } }), {
            newTrackOnConflict: true,
            ...(op.trackId ? { trackId: op.trackId } : {}),
          });
          break;
        }
        case 'update_text': {
          const { clip } = needClip();
          if (clip.type !== 'text') throw new Error('not a text clip');
          clip.text = op.text ?? clip.text;
          break;
        }
        case 'add_transition': {
          const { clip } = needClip();
          const type = op.name && TRANSITIONS_BY_ID[op.name] ? op.name : 'crossfade';
          ops.setTransition(tl, clip.id, op.edge ?? 'in', ops.makeTransition(type, op.durationSeconds ? f(op.durationSeconds) : undefined));
          break;
        }
        case 'add_effect': {
          const { clip } = needClip();
          if (!op.name || !EFFECTS_BY_ID[op.name]) throw new Error(`unknown effect ${op.name}`);
          ops.addEffect(tl, clip.id, op.name);
          break;
        }
        case 'add_motion': {
          if (!op.name || !MOTION_TEMPLATES_BY_ID[op.name]) throw new Error(`unknown motion template ${op.name}`);
          const props = { ...motionDefaults(op.name) };
          if (op.text) {
            const textKey = ['text', 'title', 'quote', 'handle'].find((k) => k in props);
            if (textKey) props[textKey] = op.text;
          }
          ops.addClip(
            tl,
            ops.makeClip({ type: 'motion', templateId: op.name, props, start: f(op.atSeconds), duration: Math.max(1, f(op.durationSeconds ?? 3)) }),
            { newTrackOnConflict: true },
          );
          break;
        }
        case 'set_transform': {
          const { clip } = needClip();
          const key = op.name as keyof typeof clip.transform;
          if (!op.name || !(op.name in clip.transform) || typeof clip.transform[key] !== 'number') throw new Error(`unknown transform property ${op.name}`);
          (clip.transform as Record<string, unknown>)[op.name] = op.value ?? 0;
          break;
        }
        case 'add_keyframe': {
          const { clip } = needClip();
          if (!op.name || !(ANIMATABLE_PROPS as readonly string[]).includes(op.name)) throw new Error(`unknown keyframe property ${op.name}`);
          ops.setKeyframe(tl, clip.id, op.name as AnimatableProp, f(op.atSeconds) - clip.start, op.value ?? 0);
          break;
        }
        case 'add_marker':
          ops.addMarker(tl, f(op.atSeconds), op.text ?? '');
          break;
        case 'set_caption_style': {
          const { clip } = needClip();
          if (clip.type !== 'captions') throw new Error('not a captions clip');
          if (!op.name || !CAPTION_STYLES_BY_ID[op.name]) throw new Error(`unknown caption style ${op.name}`);
          clip.styleId = op.name;
          break;
        }
      }
      applied++;
    } catch (err) {
      errors.push(`Step ${i + 1} (${op.op}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { applied, errors };
}

/** Compact description of a timeline for language models. */
export function summarizeTimeline(tl: TimelineData, assets: AssetMap = {}): string {
  const sec = (frames: number) => round(frames / tl.fps, 2);
  const lines = [`Canvas ${tl.width}x${tl.height} @ ${tl.fps}fps, duration ${sec(ops.timelineDuration(tl))}s.`];
  tl.tracks.forEach((track, i) => {
    lines.push(`Track ${i + 1} id=${track.id} kind=${track.kind} name="${track.name}"${track.muted ? ' muted' : ''}${track.hidden ? ' hidden' : ''}`);
    for (const c of track.clips) {
      const parts = [`  - clip id=${c.id} type=${c.type} ${sec(c.start)}s→${sec(c.start + c.duration)}s`];
      if ((c.type === 'video' || c.type === 'image' || c.type === 'audio') && c.assetId) {
        const a = assets[c.assetId];
        parts.push(`asset="${a?.name ?? c.assetId}"`);
        if (a?.role) parts.push(`role=${a.role}`);
      }
      if (c.type === 'video' || c.type === 'audio') parts.push(`speed=${c.speed} vol=${c.audio.volume}`);
      if (c.type === 'text') parts.push(`text="${c.text.replace(/\s+/g, ' ').slice(0, 80)}"`);
      if (c.type === 'captions') parts.push(`captions words=${c.words.length} style=${c.styleId}`);
      if (c.type === 'motion') parts.push(`template=${c.templateId}`);
      if (c.placeholder) parts.push(`EMPTY SLOT "${c.placeholder.label}"`);
      if (c.transitionIn) parts.push(`in=${c.transitionIn.type}`);
      if (c.transitionOut) parts.push(`out=${c.transitionOut.type}`);
      if (c.effects.length) parts.push(`effects=${c.effects.map((e) => e.type).join(',')}`);
      lines.push(parts.join(' '));
    }
  });
  if (tl.markers.length) lines.push(`Markers: ${tl.markers.map((m) => `${sec(m.frame)}s ${m.label || m.kind}`).join('; ')}`);
  return lines.join('\n');
}
