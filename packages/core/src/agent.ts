import { defaultModelFor, estimateCost, getModel, resolveParams } from './ai/registry';
import type { GenParams, ModelDef } from './ai/models';
import type { AgentConfig, AgentSteps } from './growth';
import type { StoryboardSlot } from './timeline/storyboard';

/** Speech model the agent records voice-overs with. */
export const AGENT_TTS_MODEL_ID = 'eleven-v3-tts';

/** Id prefix of the tracks the agent adds when it assembles an ad, so a re-run replaces them. */
export const AGENT_TRACK_PREFIX = 'trk_agent_';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Storyboard shots the script step planned. */
export function agentSlots(steps: AgentSteps): StoryboardSlot[] {
  const slots = steps.script.output.slots;
  return Array.isArray(slots) ? (slots as StoryboardSlot[]).filter((s) => s && typeof s.key === 'string' && typeof s.prompt === 'string') : [];
}

/** Text-to-video model for the shots: the step's pick, the run's, or the recommended one. */
export function agentVideoModel(cfg: AgentConfig, edits: Record<string, unknown>): ModelDef | null {
  const id = str(edits.videoModelId) ?? cfg.videoModelId;
  const model = id ? getModel(id) : defaultModelFor('t2v');
  return model && model.capability === 't2v' ? model : null;
}

/** The shortest supported clip length that covers the shot. */
export function agentShotDuration(model: ModelDef, seconds: number): number | undefined {
  const { durations, durationRange } = model.controls;
  if (durations?.length) return [...durations].sort((a, b) => a - b).find((d) => d >= seconds) ?? Math.max(...durations);
  if (durationRange) return Math.min(durationRange[1], Math.max(durationRange[0], Math.ceil(seconds)));
  return undefined;
}

export function agentShotParams(model: ModelDef, slot: Pick<StoryboardSlot, 'prompt' | 'durationS'>, cfg: AgentConfig): GenParams {
  const look =
    cfg.style === 'ugc'
      ? ' Authentic UGC look: shot on a smartphone, natural light, slight handheld motion, real everyday setting.'
      : ' Polished commercial look, soft studio lighting, smooth camera move.';
  return resolveParams(model, {
    prompt: `${slot.prompt}${look}`.slice(0, 4000),
    durationS: agentShotDuration(model, slot.durationS),
    aspect: model.controls.aspects?.includes(cfg.aspect) ? cfg.aspect : undefined,
    ...(model.controls.audioToggle ? { audio: false } : {}),
  });
}

export interface AgentGenerateEstimate {
  usd: number;
  shotsUsd: number;
  voiceUsd: number;
  /** Shots that will be generated (others are reused). */
  shots: number;
  totalShots: number;
  modelId: string;
  modelLabel: string;
  approx: boolean;
}

/**
 * Price of the generate step: every shot that is not reused plus the voice-over unless it is kept.
 * Returns null when there is nothing to price yet (no storyboard) or the model is not text-to-video.
 */
export function agentGenerateEstimate(
  steps: AgentSteps,
  edits: Record<string, unknown> = steps.generate.edits,
  reuse: { slotKeys?: ReadonlySet<string>; voice?: boolean } = {},
): AgentGenerateEstimate | null {
  const slots = agentSlots(steps);
  const model = agentVideoModel(steps.config, edits);
  if (!model || !slots.length) return null;
  let shotsUsd = 0;
  let shots = 0;
  let approx = false;
  for (const slot of slots) {
    if (reuse.slotKeys?.has(slot.key)) continue;
    const quote = estimateCost(model.id, agentShotParams(model, slot, steps.config));
    shotsUsd += quote.usd;
    approx ||= quote.approx;
    shots++;
  }
  const spoken = str(steps.script.output.spoken);
  const voiceUsd = spoken && !reuse.voice ? estimateCost(AGENT_TTS_MODEL_ID, { prompt: spoken }).usd : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { usd: round(shotsUsd + voiceUsd), shotsUsd: round(shotsUsd), voiceUsd: round(voiceUsd), shots, totalShots: slots.length, modelId: model.id, modelLabel: model.label, approx };
}
