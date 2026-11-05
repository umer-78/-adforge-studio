import { asJson, enhancedPromptSchema, enhancePromptRequestSchema, SYSTEM_PROMPTS, brandContext } from '@adforge/core';
import { modelForTier } from '@adforge/core/server';
import { check, owned, route } from '@/lib/server/api';
import { productFactsText } from '@/lib/server/products';
import { runLlm, workspaceBrandContext } from '@/lib/server/llm';

/** Turns a rough idea into a production-ready prompt with style, shot list and variations. */
export const POST = route({ body: enhancePromptRequestSchema, scope: 'generate', limit: ['enhance', 200, 3600] }, async ({ sb, caller, body }) => {
  const brand = await workspaceBrandContext(sb, caller.workspaceId, body.brandKitId);
  const product = body.productId ? await productFactsText(sb, caller.workspaceId, body.productId) : '';
  const prompt = [
    `Idea: ${body.idea}`,
    body.platform ? `Platform: ${body.platform}` : '',
    body.aspect ? `Aspect ratio: ${body.aspect}` : '',
    body.durationS ? `Target length: ${body.durationS}s` : '',
    product ? `Product facts:\n${product}` : '',
    'Default to an authentic, creator-style (UGC) look unless the idea asks for a polished studio style.',
    brandContext(brand),
  ]
    .filter(Boolean)
    .join('\n');
  const data = await runLlm(sb, caller, { task: 'enhancePrompt', schema: enhancedPromptSchema, system: body.mode === 'ad' ? SYSTEM_PROMPTS.enhanceAd : SYSTEM_PROMPTS.enhanceCinematic, prompt });
  let id: string | null = null;
  if (body.parentId) await owned(sb, 'prompts', body.parentId, caller, 'The original prompt');
  if (body.save) {
    const row = check(
      await sb
        .from('prompts')
        .insert({
          workspace_id: caller.workspaceId,
          created_by: caller.userId,
          title: data.title.slice(0, 120),
          idea: body.idea,
          mode: body.mode,
          platform: body.platform ?? null,
          structured: asJson(data),
          prompt: data.prompt,
          negative_prompt: data.negativePrompt,
          parent_id: body.parentId ?? null,
          provider: 'anthropic',
          model: modelForTier('fast'),
        })
        .select('id')
        .single(),
      'Could not save the prompt',
    );
    id = row.id;
  }
  return { id, ...data };
});
