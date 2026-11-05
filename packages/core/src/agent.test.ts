import { describe, expect, it } from 'vitest';
import { AGENT_TTS_MODEL_ID, agentGenerateEstimate, agentShotDuration, agentShotParams, agentSlots, agentVideoModel } from './agent';
import { defaultModelFor, estimateCost, getModel } from './ai/registry';
import { agentStepsSchema, nextAgentStep, parseAgentSteps } from './growth';

const withScript = (slots: { key: string; prompt: string; durationS: number }[], spoken = 'Meet the bottle that keeps ice for a day.') =>
  agentStepsSchema.parse({
    config: { durationS: 20, aspect: '9:16', style: 'ugc' },
    script: { status: 'done', output: { slots: slots.map((s, i) => ({ clipId: `c${i}`, lineIndex: i, useRealFootage: false, beat: 'hook', ...s })), spoken } },
  });

describe('agent steps', () => {
  it('parses an empty document into pending steps with defaults', () => {
    const steps = parseAgentSteps({});
    expect(steps.research.status).toBe('pending');
    expect(steps.config.platforms).toEqual(['meta']);
    expect(steps.config.style).toBe('ugc');
  });

  it('walks the steps in order and ends with done', () => {
    expect(nextAgentStep('research')).toBe('script');
    expect(nextAgentStep('launch')).toBe('optimize');
    expect(nextAgentStep('optimize')).toBe('done');
    expect(nextAgentStep('done')).toBe('done');
  });

  it('ignores malformed storyboard slots', () => {
    const steps = agentStepsSchema.parse({ script: { output: { slots: [{ key: 'a', prompt: 'x', durationS: 2 }, { nope: true }, null] } } });
    expect(agentSlots(steps)).toHaveLength(1);
  });
});

describe('agent video model', () => {
  it('uses the recommended text-to-video model by default', () => {
    const steps = parseAgentSteps({});
    expect(agentVideoModel(steps.config, {})?.id).toBe(defaultModelFor('t2v')?.id);
  });

  it('rejects a model that is not text-to-video', () => {
    const steps = parseAgentSteps({});
    expect(agentVideoModel(steps.config, { videoModelId: AGENT_TTS_MODEL_ID })).toBeNull();
    expect(agentVideoModel(steps.config, { videoModelId: 'not-a-model' })).toBeNull();
  });

  it('rounds shot length up to a supported duration', () => {
    const model = defaultModelFor('t2v')!;
    const d = agentShotDuration(model, 2.4);
    if (model.controls.durations?.length) expect(model.controls.durations).toContain(d);
    if (d != null) expect(d).toBeGreaterThanOrEqual(Math.min(2.4, ...(model.controls.durations ?? [2.4])));
  });

  it('adds the look for the chosen style to the prompt', () => {
    const model = defaultModelFor('t2v')!;
    const ugc = agentShotParams(model, { prompt: 'Hands open the bottle', durationS: 3 }, parseAgentSteps({}).config);
    const polished = agentShotParams(model, { prompt: 'Hands open the bottle', durationS: 3 }, parseAgentSteps({ config: { style: 'polished' } }).config);
    expect(ugc.prompt).toMatch(/smartphone/);
    expect(polished.prompt).toMatch(/studio/);
  });
});

describe('agent generate estimate', () => {
  const slots = [
    { key: 'line-1', prompt: 'A hiker drinks from the bottle', durationS: 2.5 },
    { key: 'line-2', prompt: 'Ice cubes still in the bottle at sunset', durationS: 3 },
    { key: 'line-3', prompt: 'Bottle clipped to a backpack', durationS: 2 },
  ];

  it('is null before there is a storyboard', () => {
    expect(agentGenerateEstimate(parseAgentSteps({}))).toBeNull();
  });

  it('prices every shot plus the voice-over', () => {
    const steps = withScript(slots);
    const model = defaultModelFor('t2v')!;
    const est = agentGenerateEstimate(steps)!;
    const shots = slots.reduce((sum, s) => sum + estimateCost(model.id, agentShotParams(model, s, steps.config)).usd, 0);
    const voice = estimateCost(AGENT_TTS_MODEL_ID, { prompt: 'Meet the bottle that keeps ice for a day.' }).usd;
    expect(est.shots).toBe(3);
    expect(est.totalShots).toBe(3);
    expect(est.usd).toBeCloseTo(Math.round((shots + voice) * 100) / 100, 2);
    expect(est.voiceUsd).toBeGreaterThan(0);
  });

  it('does not charge for reused shots or a kept voice-over', () => {
    const steps = withScript(slots);
    const full = agentGenerateEstimate(steps)!;
    const partial = agentGenerateEstimate(steps, {}, { slotKeys: new Set(['line-1', 'line-2']), voice: true })!;
    expect(partial.shots).toBe(1);
    expect(partial.voiceUsd).toBe(0);
    expect(partial.usd).toBeLessThan(full.usd);
  });

  it('follows the model picked at the gate', () => {
    const steps = withScript(slots);
    const other = (['seedance-2-0-t2v', 'kling-v3-t2v', 'veo-3-1-fast-t2v'] as const).map((id) => getModel(id)).find((m) => m && m.capability === 't2v' && m.id !== defaultModelFor('t2v')?.id);
    if (!other) return;
    expect(agentGenerateEstimate(steps, { videoModelId: other.id })!.modelId).toBe(other.id);
  });
});
