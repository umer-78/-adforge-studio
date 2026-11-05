import { randomUUID } from 'node:crypto';
import { asJson, brandFromKit, type BrandStyle, type ScriptDraft } from '@adforge/core';
import type { ServiceClient } from '@adforge/core/server';

export { storyboardFromScript, type Storyboard, type StoryboardSlot } from '@adforge/core';

export async function workspaceBrand(sb: ServiceClient, workspaceId: string): Promise<{ brand: BrandStyle; tone: string | null; kitId: string | null; name: string | null }> {
  const { data } = await sb.from('brand_kits').select('*').eq('workspace_id', workspaceId).order('is_default', { ascending: false }).limit(1).maybeSingle();
  return { brand: brandFromKit(data ?? null), tone: data?.tone ?? null, kitId: data?.id ?? null, name: data?.name ?? null };
}

/** Stores a script draft with stable line ids. */
export async function insertScript(sb: ServiceClient, input: { workspaceId: string; draft: ScriptDraft; brief: Record<string, unknown>; createdBy: string | null; projectId?: string | null; language?: string }) {
  const lines = input.draft.lines.map((l) => ({ id: randomUUID(), ...l }));
  const { data, error } = await sb
    .from('scripts')
    .insert({
      workspace_id: input.workspaceId,
      title: input.draft.title.slice(0, 200) || 'Ad script',
      format: 'ad',
      brief: asJson({ ...input.brief, angle: input.draft.angle, hook: input.draft.hook, cta: input.draft.cta, musicMood: input.draft.musicMood }),
      lines: asJson(lines),
      captions: input.draft.caption,
      hashtags: input.draft.hashtags.map((h) => h.replace(/^#/, '')).slice(0, 30),
      language: input.language ?? 'en',
      status: 'draft',
      project_id: input.projectId ?? null,
      created_by: input.createdBy,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Could not save script: ${error.message}`);
  return { script: data, lines };
}

/** Product facts for prompts. */
export { productFacts } from '@adforge/core';
