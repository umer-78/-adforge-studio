import * as z from 'zod';
import { pronunciationsSchema } from './pronounce';

/** Shape of workspaces.settings. Unknown keys are kept so newer settings survive older clients. */
export const workspaceSettingsSchema = z.looseObject({
  /** Tag, caption and embed new uploads with AI (small LLM and embedding cost per upload). */
  autoAnalyze: z.boolean().default(true),
  /** Transcribe new videos and voice recordings for captions and search. */
  autoTranscribe: z.boolean().default(true),
  /** Days items stay in the trash before they are deleted for good. */
  trashRetentionDays: z.number().int().min(1).max(365).default(30),
  /** How voice-overs say brand names and other tricky words. */
  pronunciations: pronunciationsSchema.default([]),
});
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  const parsed = workspaceSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : workspaceSettingsSchema.parse({});
}

export const workspacePatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  monthlyBudgetUsd: z.number().min(0).max(100_000).optional(),
  budgetHardStop: z.boolean().optional(),
  aiLabelDefault: z.boolean().optional(),
  settings: z
    .object({
      autoAnalyze: z.boolean().optional(),
      autoTranscribe: z.boolean().optional(),
      trashRetentionDays: z.number().int().min(1).max(365).optional(),
      pronunciations: pronunciationsSchema.optional(),
    })
    .optional(),
});
export type WorkspacePatch = z.infer<typeof workspacePatchSchema>;
