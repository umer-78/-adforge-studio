import { asJson, brandContext, isRecord, scriptLineSchema, SYSTEM_PROMPTS } from '@adforge/core';
import * as z from 'zod';
import { check, conflict, notFound, owned, route } from '@/lib/server/api';
import { runLlm, workspaceBrandContext } from '@/lib/server/llm';
import { scriptLines } from '@/lib/server/scripts';

const body = z.object({
  lineId: z.string().min(1).max(64),
  instruction: z.string().trim().max(500).optional(),
  save: z.boolean().default(true),
});

/** Punches up one line, keeping its speaker, beat and timing. */
export const POST = route({ body, scope: 'generate', limit: ['rewrite', 300, 3600] }, async ({ sb, caller, body, params }) => {
  const row = await owned(sb, 'scripts', params.id!, caller, 'This script');
  if (row.status === 'generating') throw conflict('Wait until the script finishes writing.');
  const lines = scriptLines(row.lines);
  const index = lines.findIndex((l) => l.id === body.lineId);
  const line = lines[index];
  if (!line) throw notFound('That line');
  const brief = isRecord(row.brief) ? row.brief : {};
  const brand = await workspaceBrandContext(sb, caller.workspaceId);
  const prompt = [
    `Script "${row.title}" (${row.format}, ${typeof brief.platform === 'string' ? brief.platform : 'social'}, language ${row.language}):`,
    lines.map((l, i) => `${i + 1}. [${l.beat}] ${l.speaker ?? 'Voice-over'}: ${l.text}`).join('\n'),
    typeof brief.product === 'string' && brief.product ? `Product: ${brief.product}` : '',
    typeof brief.audience === 'string' && brief.audience ? `Audience: ${brief.audience}` : '',
    typeof brief.tone === 'string' && brief.tone ? `Tone: ${brief.tone}` : '',
    `Rewrite line ${index + 1}:\n${JSON.stringify({ speaker: line.speaker, text: line.text, emotion: line.emotion, onScreenText: line.onScreenText, visual: line.visual, shotType: line.shotType, camera: line.camera, durationS: line.durationS, beat: line.beat, useRealFootage: line.useRealFootage })}`,
    body.instruction ? `Instruction: ${body.instruction}` : 'No instruction given.',
    brandContext(brand),
  ]
    .filter(Boolean)
    .join('\n\n');
  const draft = await runLlm(sb, caller, { task: 'rewriteLine', schema: scriptLineSchema, system: SYSTEM_PROMPTS.rewriteLine, prompt, meta: { scriptId: row.id } });
  // Speaker and beat stay put: they tie the line to its character and its place in the arc.
  const [next] = scriptLines([{ ...line, ...draft, id: line.id, speaker: line.speaker, beat: line.beat, characterId: line.characterId, voiceId: line.voiceId, pace: line.pace, frameAssetId: line.frameAssetId, voiceAssetId: line.voiceAssetId }]);
  const updated = next ?? line;
  if (body.save) {
    const all = lines.map((l) => (l.id === line.id ? updated : l));
    check(await sb.from('scripts').update({ lines: asJson(all) }).eq('id', row.id), 'Could not save the line');
  }
  return { line: updated, previous: line };
});
