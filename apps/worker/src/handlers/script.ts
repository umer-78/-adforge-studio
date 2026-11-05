import { randomUUID } from 'node:crypto';
import { asJson, brandContext, isRecord, scriptBriefSchema, scriptDraftSchema, SYSTEM_PROMPTS } from '@adforge/core';
import { PermanentError } from '../lib/errors';
import { llmAvailable, runLlm } from '../lib/llm';
import { productFacts, workspaceBrand } from '../lib/storyboard';
import type { JobHandler } from '../runner';

/** Writes an ad script or a character dialogue from the brief saved on the script row. */
export const scriptWrite: JobHandler<'script.write'> = {
  async run(ctx, { scriptId }) {
    const { data: script } = await ctx.sb.from('scripts').select('*').eq('id', scriptId).eq('workspace_id', ctx.workspaceId).maybeSingle();
    if (!script) throw new PermanentError('This script no longer exists.');
    if (script.status !== 'generating') return { skipped: script.status };
    if (!(await llmAvailable(ctx))) throw new PermanentError('Add a Claude API key in Settings → Providers to write scripts.');
    const brief = scriptBriefSchema.parse(isRecord(script.brief) ? script.brief : {});
    const { brand, tone, name } = await workspaceBrand(ctx.sb, script.workspace_id);

    const facts: string[] = [];
    if (brief.productId) {
      const { data: product } = await ctx.sb.from('products').select('*').eq('id', brief.productId).eq('workspace_id', script.workspace_id).maybeSingle();
      if (product) facts.push(`Product (from its page):\n${productFacts(product)}`);
    }
    if (brief.product) facts.push(`Product notes: ${brief.product}`);
    let speakers = '';
    if (brief.format === 'dialogue') {
      const { data: characters } = brief.characterIds.length ? await ctx.sb.from('characters').select('name, description, default_emotion').in('id', brief.characterIds).eq('workspace_id', script.workspace_id) : { data: [] };
      if (!characters?.length) throw new PermanentError('Pick at least one character for a dialogue.');
      speakers = `Characters (use these exact names as speakers):\n${characters.map((c) => `- ${c.name}: ${c.description ?? 'no description'} (usually ${c.default_emotion})`).join('\n')}`;
    }

    ctx.progress(15, 'Writing');
    const { data: draft } = await runLlm(ctx, {
      task: 'writeScript',
      schema: scriptDraftSchema,
      system: brief.format === 'dialogue' ? SYSTEM_PROMPTS.writeDialogue : SYSTEM_PROMPTS.writeAdScript,
      prompt: [
        ...facts,
        speakers,
        `Audience: ${brief.audience || 'infer from the product'}`,
        `Goal: ${brief.goal}. Tone: ${brief.tone || tone || 'natural'}. Platform: ${brief.platform}. Length: ${brief.durationS}s. Language: ${brief.language}.`,
        brief.angle ? `Angle: ${brief.angle}` : '',
        brief.notes ? `Notes: ${brief.notes}` : '',
        brandContext({ name, tone, colors: [brand.primary, brand.accent] }),
      ]
        .filter(Boolean)
        .join('\n\n'),
      meta: { scriptId },
    });

    const lines = draft.lines.map((l) => ({ id: randomUUID(), ...l }));
    const { error } = await ctx.sb
      .from('scripts')
      .update({
        title: script.title && script.title !== 'Untitled script' ? script.title : draft.title.slice(0, 200) || 'Ad script',
        lines: asJson(lines),
        captions: draft.caption,
        hashtags: draft.hashtags.map((h) => h.replace(/^#/, '')).slice(0, 30),
        brief: asJson({ ...brief, angle: draft.angle, hook: draft.hook, cta: draft.cta, musicMood: draft.musicMood }),
        status: 'draft',
        error: null,
      })
      .eq('id', script.id);
    if (error) throw new Error(`Could not save the script: ${error.message}`);
    return { lines: lines.length };
  },
  async onFailure(ctx, { scriptId }, message) {
    await ctx.sb.from('scripts').update({ status: 'failed', error: message }).eq('id', scriptId).eq('status', 'generating');
  },
};
