import { randomUUID } from 'node:crypto';
import { asJson, isRecord, languageName, scriptDraftSchema, SYSTEM_PROMPTS } from '@adforge/core';
import * as z from 'zod';
import { badRequest, check, conflict, logActivity, owned, route } from '@/lib/server/api';
import { runLlm } from '@/lib/server/llm';
import { scriptDetail, scriptLines, toScriptView } from '@/lib/server/scripts';

const body = z.object({ language: z.string().trim().min(2).max(12) });

/** Localises the script into a new copy, keeping speakers, timing and storyboard frames. */
export const POST = route({ body, scope: 'generate', limit: ['translate', 60, 3600] }, async ({ sb, caller, body, params }) => {
  const row = await owned(sb, 'scripts', params.id!, caller, 'This script');
  if (row.status === 'generating') throw conflict('Wait until the script finishes writing.');
  const code = body.language.toLowerCase();
  if (code === row.language.toLowerCase()) throw badRequest(`This script is already in ${languageName(code)}.`);
  const detail = await scriptDetail(sb, caller.workspaceId, row);
  const lines = detail.lines;
  if (!lines.length) throw badRequest('There is nothing to translate yet.');
  const brief = isRecord(row.brief) ? row.brief : {};
  const source = {
    title: row.title,
    angle: detail.brief.angle ?? '',
    hook: detail.brief.hook ?? '',
    cta: detail.brief.cta ?? '',
    caption: row.captions ?? '',
    hashtags: row.hashtags ?? [],
    musicMood: detail.brief.musicMood ?? '',
    lines: lines.map((l) => ({ speaker: l.speaker, text: l.text, emotion: l.emotion, onScreenText: l.onScreenText, visual: l.visual, shotType: l.shotType, camera: l.camera, durationS: l.durationS, beat: l.beat, useRealFootage: l.useRealFootage })),
  };
  const draft = await runLlm(sb, caller, {
    task: 'translateScript',
    schema: scriptDraftSchema,
    system: SYSTEM_PROMPTS.translateScript,
    prompt: `Source language: ${languageName(row.language)} (${row.language})\nTarget language: ${languageName(code)} (${code})\n\nScript as JSON:\n${JSON.stringify(source)}`,
    meta: { scriptId: row.id, language: code },
  });
  // Lines map one to one; voices are re-recorded in the new language, frames carry over.
  const translated = scriptLines(
    draft.lines.map((l, i) => {
      const from = lines[i];
      return {
        ...l,
        id: randomUUID(),
        speaker: from?.speaker ?? l.speaker,
        characterId: from?.characterId ?? null,
        voiceId: from?.voiceId ?? null,
        pace: from?.pace ?? null,
        frameAssetId: from ? (detail.frames[from.id]?.[0]?.asset.id ?? null) : null,
        voiceAssetId: null,
      };
    }),
  );
  const copy = check(
    await sb
      .from('scripts')
      .insert({
        workspace_id: caller.workspaceId,
        created_by: caller.userId,
        project_id: row.project_id,
        title: `${(draft.title || row.title).slice(0, 190)} (${code.toUpperCase()})`,
        format: row.format,
        language: code,
        brief: asJson({ ...brief, language: code, angle: draft.angle, hook: draft.hook, cta: draft.cta, musicMood: draft.musicMood, translatedFrom: row.id }),
        lines: asJson(translated),
        captions: draft.caption,
        hashtags: draft.hashtags.map((h) => h.replace(/^#+/, '')).filter(Boolean).slice(0, 30),
        status: 'draft',
      })
      .select('*')
      .single(),
    'Could not save the translation',
  );
  await logActivity(sb, caller, 'script.translate', 'script', copy.id, { from: row.id, language: code });
  return toScriptView(copy);
});
