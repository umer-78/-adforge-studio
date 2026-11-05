import * as z from 'zod';
import type { TimelineData } from './timeline/schema';

/* --------------------------------- Variants -------------------------------- */

export const VARIANT_STATUSES = ['planned', 'building', 'rendering', 'done', 'failed'] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

/** One entry of variant_batches.variants. */
export const variantItemSchema = z.object({
  label: z.string(),
  hook: z.string().nullable().default(null),
  cta: z.string().nullable().default(null),
  voiceStyle: z.string().nullable().default(null),
  voiceId: z.string().nullable().default(null),
  captionStyleId: z.string().nullable().default(null),
  musicMood: z.string().nullable().default(null),
  firstShot: z.string().nullable().default(null),
  hypothesis: z.string().default(''),
  status: z.enum(VARIANT_STATUSES).default('planned'),
  timelineId: z.string().nullable().default(null),
  renderId: z.string().nullable().default(null),
  assetId: z.string().nullable().default(null),
  /** What could not be applied, e.g. no music in the library matched the mood. */
  notes: z.array(z.string()).default([]),
  error: z.string().nullable().default(null),
});
export type VariantItem = z.infer<typeof variantItemSchema>;

export function parseVariants(value: unknown): VariantItem[] {
  return Array.isArray(value) ? value.flatMap((v) => (variantItemSchema.safeParse(v).success ? [variantItemSchema.parse(v)] : [])) : [];
}

/* ---------------------------------- Agent ---------------------------------- */

export const AGENT_STEPS = ['research', 'script', 'generate', 'launch', 'optimize'] as const;
export type AgentStep = (typeof AGENT_STEPS)[number];

export const AGENT_STEP_LABELS: Record<AgentStep, string> = {
  research: 'Research the product, audience and competitors',
  script: 'Write the ad script and storyboard',
  generate: 'Generate shots and voice-over, then render',
  launch: 'Create the ad campaign (paused)',
  optimize: 'Read results and recommend next tests',
};

export const agentConfigSchema = z.object({
  platforms: z.array(z.enum(['meta', 'tiktok'])).default(['meta']),
  adAccountId: z.string().uuid().nullable().default(null),
  dailyAdBudget: z.number().positive().nullable().default(null),
  aspect: z.enum(['9:16', '1:1', '4:5', '16:9']).default('9:16'),
  durationS: z.number().int().min(6).max(90).default(20),
  /** Generation model for AI B-roll; null picks the recommended one. */
  videoModelId: z.string().nullable().default(null),
  voiceId: z.string().nullable().default(null),
  /** Authentic creator-style footage by default; polished studio look on request. */
  style: z.enum(['ugc', 'polished']).default('ugc'),
  countries: z.array(z.string().length(2)).min(1).max(25).default(['US']),
  /** Where the ads send people; defaults to the product page. */
  landingUrl: z.string().url().nullable().default(null),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const agentStepStateSchema = z.object({
  status: z.enum(['pending', 'running', 'waiting', 'done', 'failed', 'skipped']).default('pending'),
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
  costUsd: z.number().default(0),
  /** Estimated cost of running this step, shown at the approval gate. */
  estimateUsd: z.number().nullable().default(null),
  output: z.record(z.string(), z.unknown()).default({}),
  /** Edits the user made when approving, applied by the step. */
  edits: z.record(z.string(), z.unknown()).default({}),
  note: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type AgentStepState = z.infer<typeof agentStepStateSchema>;

/** Shape of agent_runs.steps. */
export const agentStepsSchema = z.object({
  config: agentConfigSchema.prefault({}),
  research: agentStepStateSchema.prefault({}),
  script: agentStepStateSchema.prefault({}),
  generate: agentStepStateSchema.prefault({}),
  launch: agentStepStateSchema.prefault({}),
  optimize: agentStepStateSchema.prefault({}),
});
export type AgentSteps = z.infer<typeof agentStepsSchema>;

export function parseAgentSteps(value: unknown): AgentSteps {
  const parsed = agentStepsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : agentStepsSchema.parse({});
}

export function nextAgentStep(step: AgentStep | 'done'): AgentStep | 'done' {
  if (step === 'done') return 'done';
  const i = AGENT_STEPS.indexOf(step);
  return AGENT_STEPS[i + 1] ?? 'done';
}

/* ------------------------------ Render licensing ----------------------------- */

/** Stored on rendered assets (meta.licenseIssues) and checked before publishing or launching ads. */
export interface LicenseIssue {
  assetId: string;
  name: string;
  problem: 'non_commercial' | 'expired' | 'unlicensed_music';
}

export type LicenseState = 'cleared' | 'non_commercial' | 'expired' | 'missing';

/** Whether audio can go into a published ad, by the same rules exports check. */
export function licenseState(license: { commercial_use: boolean; expires_at: string | null } | null | undefined, now = Date.now()): LicenseState {
  if (!license) return 'missing';
  if (!license.commercial_use) return 'non_commercial';
  if (license.expires_at && new Date(license.expires_at).getTime() < now) return 'expired';
  return 'cleared';
}

/** The asset facts the license rules need. */
export interface LicenseCheckAsset {
  id: string;
  name: string;
  type: string;
  source: string;
  licenseId: string | null;
  /** False when a video has no sound track. */
  hasAudio?: boolean;
  role?: 'voice' | 'music' | 'sfx' | 'other' | null;
}

/** Ids of files that can be heard in the edit: unmuted audio and video clips on unmuted tracks. */
export function audibleAssetIds(tl: TimelineData): string[] {
  const ids = new Set<string>();
  for (const t of tl.tracks) {
    if (t.muted) continue;
    for (const c of t.clips) if ((c.type === 'audio' || c.type === 'video') && c.assetId && !c.audio.muted) ids.add(c.assetId);
  }
  return [...ids];
}

/** Role of an audio file from the kind of audio track that produced it. */
export function roleFromAudioTrackKind(kind: string | null | undefined): LicenseCheckAsset['role'] {
  return kind === 'voiceover' || kind === 'recording' ? 'voice' : kind === 'music' ? 'music' : kind === 'sfx' ? 'sfx' : null;
}

/** Audio a published ad can't legally use: non-commercial or expired licenses, and music without any license. */
export function findLicenseIssues(assets: readonly LicenseCheckAsset[], licenses: readonly { id: string; commercial_use: boolean; expires_at: string | null }[], now = Date.now()): LicenseIssue[] {
  const byId = new Map(licenses.map((l) => [l.id, l]));
  const issues: LicenseIssue[] = [];
  for (const a of assets) {
    if (a.type !== 'audio' && (a.type !== 'video' || a.hasAudio === false)) continue;
    const lic = a.licenseId ? byId.get(a.licenseId) : undefined;
    const state = lic ? licenseState(lic, now) : null;
    if (state === 'non_commercial' || state === 'expired') issues.push({ assetId: a.id, name: a.name, problem: state });
    else if (!lic && a.role === 'music' && a.source !== 'generated') issues.push({ assetId: a.id, name: a.name, problem: 'unlicensed_music' });
  }
  return issues;
}

export function licenseIssueMessage(issues: readonly LicenseIssue[]): string {
  const names = issues.slice(0, 3).map((i) => `“${i.name}”`).join(', ');
  const more = issues.length > 3 ? ` and ${issues.length - 3} more` : '';
  return `This video uses audio that is not cleared for commercial use (${names}${more}). Replace it or add a commercial license in the Library before publishing.`;
}
