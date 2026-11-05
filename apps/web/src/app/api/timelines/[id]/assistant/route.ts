import { editAssistantSchema, editPlanSchema, isRecord, summarizeTimeline, SYSTEM_PROMPTS, timelineOps, type AssetMap, type AssetMeta, type ResolvedAsset } from '@adforge/core';
import { route } from '@/lib/server/api';
import { assetsByIds } from '@/lib/server/assets';
import { runLlm } from '@/lib/server/llm';
import { loadTimeline, parseTimelineData } from '@/lib/server/timelines';

/**
 * Plans edits for a plain-language instruction against the editor's current (possibly unsaved)
 * timeline. Nothing is changed here: the editor applies the plan as one step the user can undo.
 */
export const POST = route({ body: editAssistantSchema.omit({ timelineId: true }), limit: ['edit-assistant', 120, 3600] }, async ({ sb, caller, params, body }) => {
  await loadTimeline(sb, caller, params.id!);
  const tl = parseTimelineData(body.data);
  const rows = await assetsByIds(sb, caller.workspaceId, timelineOps.collectAssetIds(tl));
  const assets: AssetMap = Object.fromEntries(
    rows.map((a) => {
      const meta = (isRecord(a.meta) ? a.meta : {}) as AssetMeta;
      return [a.id, { id: a.id, type: a.type as ResolvedAsset['type'], src: '', name: a.name, durationS: a.duration_s, ...(meta.role ? { role: meta.role } : {}) }];
    }),
  );
  const context = [
    body.playheadSeconds != null ? `The playhead is at ${body.playheadSeconds.toFixed(2)}s.` : null,
    body.selectedClipIds?.length ? `Selected clips: ${body.selectedClipIds.join(', ')}.` : 'No clips are selected.',
  ]
    .filter(Boolean)
    .join(' ');
  return runLlm(sb, caller, {
    task: 'editPlan',
    schema: editPlanSchema,
    system: SYSTEM_PROMPTS.editAssistant,
    prompt: `Timeline:\n${summarizeTimeline(tl, assets)}\n\n${context}\n\nInstruction: ${body.instruction}`,
    meta: { timelineId: params.id },
  });
});
