import {
  asJson,
  CAPTION_STYLES,
  CAPTION_STYLES_BY_ID,
  parseTimeline,
  parseVariants,
  summarizeTimeline,
  SYSTEM_PROMPTS,
  timelineOps,
  variantPlanSchema,
  type AssetRow,
  type TimelineData,
  type VariantItem,
  type VariantBatchRow,
} from '@adforge/core';
import { PermanentError } from '../lib/errors';
import { loadAssets } from '../lib/files';
import { llmAvailable, runLlm } from '../lib/llm';
import { audioClipsWithRole, findHookClip, insertRender, insertTimeline, retimeCaptions, setCaptionStyle, setCta, setHook, swapFirstShot } from '../lib/timeline-edit';
import { synthesizeVoice } from '../lib/tts';
import type { JobContext, JobHandler } from '../runner';

async function loadBatch(ctx: JobContext, id: string): Promise<VariantBatchRow> {
  const { data, error } = await ctx.sb.from('variant_batches').select('*').eq('id', id).eq('workspace_id', ctx.workspaceId).maybeSingle();
  if (error) throw new Error(`Could not load variants: ${error.message}`);
  if (!data) throw new PermanentError('This variant batch no longer exists.');
  return data;
}

async function sourceTimeline(ctx: JobContext, batch: VariantBatchRow) {
  if (!batch.source_timeline_id) throw new PermanentError('Pick a source edit for the variants.');
  const { data } = await ctx.sb.from('timelines').select('*').eq('id', batch.source_timeline_id).eq('workspace_id', batch.workspace_id).maybeSingle();
  if (!data || data.deleted_at) throw new PermanentError('The source edit was deleted.');
  return { row: data, tl: parseTimeline(data.data) };
}

async function saveVariants(ctx: JobContext, batchId: string, variants: VariantItem[], patch: Record<string, unknown> = {}) {
  const { error } = await ctx.sb.from('variant_batches').update({ variants: asJson(variants), ...patch }).eq('id', batchId);
  if (error) throw new Error(`Could not save variants: ${error.message}`);
}

const mediaIds = (tl: TimelineData) => tl.tracks.flatMap((t) => t.clips.flatMap((c) => ((c.type === 'video' || c.type === 'image' || c.type === 'audio') && c.assetId ? [c.assetId] : [])));

export const variantsPlan: JobHandler<'variants.plan'> = {
  async run(ctx, { batchId }) {
    const batch = await loadBatch(ctx, batchId);
    if (batch.status !== 'planning') return { skipped: batch.status };
    if (!(await llmAvailable(ctx))) throw new PermanentError('Add a Claude API key in Settings → Providers to plan variants.');
    const { tl } = await sourceTimeline(ctx, batch);
    const assets = await loadAssets(ctx.sb, batch.workspace_id, mediaIds(tl));
    const seeded = parseVariants(batch.variants);
    const dims = batch.dimensions;

    const [{ data: moods }, { data: voices }] = await Promise.all([
      ctx.sb.from('music').select('mood').eq('workspace_id', batch.workspace_id).not('mood', 'is', null).limit(200),
      ctx.sb.from('voices').select('name, provider_voice_id, labels').eq('workspace_id', batch.workspace_id).limit(50),
    ]);
    const hook = findHookClip(tl)?.text ?? null;
    const transcript = [...assets.values()].map((a) => a.transcript).filter(Boolean).join(' ').slice(0, 2500);
    const context = [
      `Create ${batch.count} variants changing only: ${dims.join(', ')}.`,
      `Current edit:\n${summarizeTimeline(tl, Object.fromEntries([...assets.values()].map((a) => [a.id, { id: a.id, type: a.type as 'video', src: '', name: a.name }])))}`,
      hook ? `Current hook text: "${hook}"` : 'There is no on-screen hook text yet.',
      transcript ? `Voice-over: ${transcript}` : '',
      dims.includes('caption_style') ? `Caption style ids to choose from: ${CAPTION_STYLES.map((c) => `${c.id} (${c.label})`).join(', ')}.` : '',
      dims.includes('music') ? `Music moods in the library: ${[...new Set((moods ?? []).map((m) => m.mood))].slice(0, 30).join(', ') || 'none yet'}.` : '',
      dims.includes('voice') ? `Voices assigned per variant (in order): ${seeded.map((v, i) => `${i + 1}: ${voices?.find((x) => x.provider_voice_id === v.voiceId)?.name ?? 'same voice'}`).join('; ')}. Describe the delivery style for each.` : '',
    ].filter(Boolean);
    const { data } = await runLlm(ctx, {
      task: 'planVariants',
      schema: variantPlanSchema,
      system: SYSTEM_PROMPTS.planVariants,
      prompt: context.join('\n\n'),
      meta: { batchId },
    });
    const letters = 'ABCDEFGHIJ';
    const variants: VariantItem[] = data.variants.slice(0, batch.count).map((v, i) => ({
      label: v.label?.trim() ? v.label.slice(0, 40) : `Variant ${letters[i]}`,
      hook: dims.includes('hook') ? v.hook : null,
      cta: dims.includes('cta') ? v.cta : null,
      voiceStyle: dims.includes('voice') ? v.voiceStyle : null,
      voiceId: dims.includes('voice') ? (seeded[i]?.voiceId ?? null) : null,
      captionStyleId: dims.includes('caption_style') && v.captionStyleId && CAPTION_STYLES_BY_ID[v.captionStyleId] ? v.captionStyleId : null,
      musicMood: dims.includes('music') ? v.musicMood : null,
      firstShot: dims.includes('first_shot') ? v.firstShot : null,
      hypothesis: v.hypothesis,
      status: 'planned',
      timelineId: null,
      renderId: null,
      assetId: null,
      notes: [],
      error: null,
    }));
    if (!variants.length) throw new PermanentError('The planner returned no variants. Try again.');
    await saveVariants(ctx, batch.id, variants, { status: 'ready', error: null });
    return { variants: variants.length };
  },
  async onFailure(ctx, { batchId }, message) {
    await ctx.sb.from('variant_batches').update({ status: 'failed', error: message }).eq('id', batchId);
  },
};

/** Applies one variant's changes to a copy of the source edit. */
async function buildVariant(ctx: JobContext, batch: VariantBatchRow, source: TimelineData, assets: Map<string, AssetRow>, trackKinds: Map<string, string>, v: VariantItem): Promise<{ tl: TimelineData; notes: string[] }> {
  const tl = timelineOps.cloneTimeline(source);
  const notes: string[] = [];
  if (v.hook) setHook(tl, v.hook);
  if (v.cta) setCta(tl, v.cta);
  if (v.captionStyleId && !setCaptionStyle(tl, v.captionStyleId)) notes.push('No captions in the edit to restyle.');
  if (v.firstShot && !swapFirstShot(tl, assets, v.firstShot)) notes.push('No other shot matched the planned opening shot; kept the original.');

  if (v.musicMood) {
    const music = audioClipsWithRole(tl, assets, 'music', trackKinds);
    if (!music.length) notes.push('No music in the edit to swap.');
    else {
      const current = new Set(music.map((m) => m.assetId));
      const { data: options } = await ctx.sb
        .from('music')
        .select('asset_id, mood, title, duration_s, license_id')
        .eq('workspace_id', batch.workspace_id)
        .ilike('mood', `%${v.musicMood.split(/[\s,]+/)[0]!.slice(0, 30)}%`)
        .not('asset_id', 'is', null)
        .limit(20);
      const pick = (options ?? []).find((o) => o.asset_id && !current.has(o.asset_id));
      if (!pick?.asset_id) notes.push(`No ${v.musicMood} music in the library; kept the current track.`);
      else
        for (const clip of music) {
          clip.assetId = pick.asset_id;
          clip.trimStart = 0;
          if (pick.duration_s) clip.duration = Math.min(clip.duration, Math.floor(Number(pick.duration_s) * tl.fps));
        }
    }
  }

  if (v.voiceId) {
    const voiceClips = audioClipsWithRole(tl, assets, 'voice', trackKinds);
    if (!voiceClips.length) notes.push('No voice-over in the edit to re-voice.');
    for (const [i, clip] of voiceClips.entries()) {
      const text = assets.get(clip.assetId!)?.transcript?.trim();
      if (!text) {
        notes.push('A voice clip has no transcript, so it kept the original voice.');
        continue;
      }
      const res = await synthesizeVoice(ctx, {
        workspaceId: batch.workspace_id,
        text: v.voiceStyle && /\[/.test(v.voiceStyle) ? `${v.voiceStyle} ${text}` : text,
        voiceId: v.voiceId,
        name: `${batch.name} · ${v.label} voice${voiceClips.length > 1 ? ` ${i + 1}` : ''}`,
      });
      clip.assetId = res.asset.id;
      clip.trimStart = 0;
      clip.speed = 1;
      clip.duration = Math.max(1, Math.round(res.durationS * tl.fps));
      retimeCaptions(tl, clip, res.words);
    }
  }
  return { tl, notes };
}

export const variantsRender: JobHandler<'variants.render'> = {
  async run(ctx, { batchId }) {
    const batch = await loadBatch(ctx, batchId);
    if (!['ready', 'rendering'].includes(batch.status)) return { skipped: batch.status };
    const { row, tl } = await sourceTimeline(ctx, batch);
    const assets = await loadAssets(ctx.sb, batch.workspace_id, mediaIds(tl));
    const audioIds = [...assets.values()].filter((a) => a.type === 'audio').map((a) => a.id);
    const { data: tracks } = audioIds.length ? await ctx.sb.from('audio_tracks').select('asset_id, kind').in('asset_id', audioIds) : { data: [] };
    const trackKinds = new Map((tracks ?? []).map((t) => [t.asset_id, t.kind]));
    const variants = parseVariants(batch.variants);
    if (!variants.length) throw new PermanentError('Plan the variants first.');
    await ctx.sb.from('variant_batches').update({ status: 'rendering', error: null }).eq('id', batch.id);

    let queued = 0;
    for (const [i, v] of variants.entries()) {
      if (v.status !== 'planned' && v.status !== 'building') continue;
      ctx.progress((i / variants.length) * 100, `Building ${v.label}`);
      variants[i] = { ...v, status: 'building' };
      await saveVariants(ctx, batch.id, variants);
      try {
        const built = await buildVariant(ctx, batch, tl, assets, trackKinds, v);
        const timeline = await insertTimeline(ctx.sb, { workspaceId: batch.workspace_id, name: `${batch.name} · ${v.label}`, data: built.tl, createdBy: batch.created_by, projectId: row.project_id, templateId: row.template_id });
        const render = await insertRender(ctx.sb, { workspaceId: batch.workspace_id, timeline, createdBy: batch.created_by });
        variants[i] = { ...variants[i]!, status: 'rendering', timelineId: timeline.id, renderId: render.id, notes: built.notes };
        await saveVariants(ctx, batch.id, variants);
        const job = await ctx.enqueue('render.timeline', { renderId: render.id }, { idempotencyKey: `render.timeline:${render.id}`, createdBy: batch.created_by });
        await ctx.sb.from('renders').update({ job_id: job.id }).eq('id', render.id);
        queued++;
      } catch (err) {
        if ((err as { name?: string }).name === 'JobAborted') throw err;
        variants[i] = { ...variants[i]!, status: 'failed', error: (err as Error).message };
        await saveVariants(ctx, batch.id, variants);
      }
    }
    const allFailed = variants.every((v) => v.status === 'failed');
    if (allFailed) await ctx.sb.from('variant_batches').update({ status: 'failed', error: variants[0]?.error ?? 'No variant could be built.' }).eq('id', batch.id);
    return { queued };
  },
  async onFailure(ctx, { batchId }, message) {
    await ctx.sb.from('variant_batches').update({ status: 'failed', error: message }).eq('id', batchId);
  },
};
