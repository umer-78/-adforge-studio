import 'server-only';
import {
  AppError,
  asJson,
  brandFromKit,
  isRecord,
  LLM_TASKS,
  llmEstimate,
  scriptLineEditSchema,
  storyboardFromScript,
  type AspectRatio,
  type CaptionWord,
  type ScriptLine,
  type ScriptRow,
  type StoryboardVoice,
} from '@adforge/core';
import { assertBudget, enqueueJob, modelForTier, type ServiceClient } from '@adforge/core/server';
import { badRequest, check, type Caller } from './api';
import { assetViewMap } from './assets';
import { insertTimeline } from './timelines';
import { providerStatus, toJobView } from './workspace';
import type { LineMedia, LinePending, ScriptDetailView, ScriptView } from '@/lib/types';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : v);

/** Stored lines, repaired where an AI draft ran past the edit limits. */
export function scriptLines(raw: unknown): ScriptLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ScriptLine[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const parsed = scriptLineEditSchema.safeParse({
      ...item,
      text: str(item.text, 2000),
      visual: str(item.visual, 2000),
      onScreenText: str(item.onScreenText, 300),
      speaker: str(item.speaker, 80),
      emotion: str(item.emotion, 80),
      shotType: str(item.shotType, 80),
      camera: str(item.camera, 80),
      durationS: clamp(Number(item.durationS) || 3, 0.5, 60),
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function toScriptView(row: ScriptRow): ScriptView {
  const lines = scriptLines(row.lines);
  const brief = isRecord(row.brief) ? row.brief : {};
  return {
    id: row.id,
    title: row.title,
    format: row.format === 'dialogue' ? 'dialogue' : 'ad',
    status: row.status as ScriptView['status'],
    error: row.error,
    language: row.language,
    platform: typeof brief.platform === 'string' ? brief.platform : null,
    hook: typeof brief.hook === 'string' && brief.hook ? brief.hook : (lines[0]?.text ?? null),
    lineCount: lines.length,
    durationS: Math.round(lines.reduce((sum, l) => sum + l.durationS, 0) * 10) / 10,
    timelineId: row.timeline_id,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type Purpose = 'frame' | 'voice';

/** The script with every frame and voice take made for its lines. */
export async function scriptDetail(sb: ServiceClient, workspaceId: string, row: ScriptRow): Promise<ScriptDetailView> {
  const lines = scriptLines(row.lines);
  const [{ data: gens, error }, job] = await Promise.all([
    sb
      .from('generations')
      .select('id, status, progress, error, prompt, output_asset_ids, source_ref, created_at')
      .eq('workspace_id', workspaceId)
      .eq('source_ref->>scriptId', row.id)
      .order('created_at', { ascending: false })
      .limit(400),
    row.job_id && row.status === 'generating' ? sb.from('jobs').select('*').eq('id', row.job_id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  if (error) throw new Error(`Could not load script media: ${error.message}`);

  const picked = lines.flatMap((l) => [l.frameAssetId, l.voiceAssetId]);
  const assets = await assetViewMap(sb, workspaceId, [...picked, ...(gens ?? []).flatMap((g) => g.output_asset_ids ?? [])]);
  const live = (id: string | null | undefined) => {
    const a = id ? assets[id] : undefined;
    return a && !a.deletedAt ? a : undefined;
  };

  const media: Record<Purpose, Record<string, LineMedia[]>> = { frame: {}, voice: {} };
  const pending: Record<Purpose, Record<string, LinePending>> = { frame: {}, voice: {} };
  const seen = new Set<string>();
  for (const g of gens ?? []) {
    const ref = isRecord(g.source_ref) ? g.source_ref : {};
    const purpose = ref.purpose === 'frame' || ref.purpose === 'voice' ? ref.purpose : null;
    const lineId = typeof ref.lineId === 'string' ? ref.lineId : null;
    if (!purpose || !lineId) continue;
    const key = `${purpose}:${lineId}`;
    // Only the newest attempt per line counts as pending or failed.
    if (!seen.has(key)) {
      seen.add(key);
      if (g.status !== 'succeeded') pending[purpose][lineId] = { generationId: g.id, status: g.status, progress: Number(g.progress ?? 0), error: g.error };
    }
    if (g.status !== 'succeeded') continue;
    for (const id of g.output_asset_ids ?? []) {
      const asset = live(id);
      if (asset) (media[purpose][lineId] ??= []).push({ asset, sourceText: purpose === 'voice' ? g.prompt : null });
    }
  }
  // The take picked on the line goes first, even when it came from the library.
  for (const line of lines) {
    for (const [purpose, id] of [['frame', line.frameAssetId], ['voice', line.voiceAssetId]] as const) {
      const asset = live(id);
      if (!asset) continue;
      const list = (media[purpose][line.id] ??= []);
      const at = list.findIndex((m) => m.asset.id === asset.id);
      const entry = at >= 0 ? list.splice(at, 1)[0]! : { asset, sourceText: null };
      list.unshift(entry);
    }
  }

  const brief = isRecord(row.brief) ? (row.brief as ScriptDetailView['brief']) : {};
  return {
    ...toScriptView(row),
    brief,
    lines,
    captions: row.captions,
    hashtags: row.hashtags ?? [],
    frames: media.frame,
    voices: media.voice,
    pending: { frames: pending.frame, voices: pending.voice },
    job: job ? toJobView(job) : null,
  };
}

/** Fails early with a clear message instead of a failed background job. */
export async function assertCanWrite(sb: ServiceClient, caller: Caller) {
  const providers = await providerStatus(sb, caller.workspaceId);
  if (!providers.anthropic) throw new AppError('provider_not_configured', 'Add a Claude API key in Settings → Providers to write scripts.', 400, { provider: 'anthropic' });
  const t = LLM_TASKS.writeScript;
  await assertBudget(sb, caller.workspaceId, llmEstimate(modelForTier(t.tier), t.input, t.output));
}

export async function queueScriptWrite(sb: ServiceClient, caller: Caller, scriptId: string) {
  const job = await enqueueJob(sb, {
    type: 'script.write',
    payload: { scriptId },
    workspaceId: caller.workspaceId,
    createdBy: caller.userId,
    priority: 5,
    idempotencyKey: `script.write:${scriptId}:${Date.now()}`,
  });
  check(await sb.from('scripts').update({ job_id: job.id, status: 'generating', error: null }).eq('id', scriptId), 'Could not start writing');
  return job;
}

/** Word timings stored with a voice take, if the speech engine returned them. */
function storedWords(segments: unknown): CaptionWord[] | undefined {
  if (!isRecord(segments) || !Array.isArray(segments.words)) return undefined;
  const words = segments.words.filter((w): w is CaptionWord => isRecord(w) && typeof w.text === 'string' && typeof w.start === 'number' && typeof w.end === 'number');
  return words.length ? words.map((w) => ({ text: w.text, start: Math.max(0, w.start), end: Math.max(0, w.end) })) : undefined;
}

/** Builds an editable timeline from the script, using picked frames and voice takes. */
export async function buildScriptTimeline(sb: ServiceClient, caller: Caller, row: ScriptRow, opts: { aspect: AspectRatio; name?: string }) {
  const detail = await scriptDetail(sb, caller.workspaceId, row);
  if (!detail.lines.length) throw badRequest('Add at least one line first.');
  const frameAssetIds: Record<number, string> = {};
  const voiceIds: [number, string, number][] = [];
  detail.lines.forEach((line, i) => {
    const frame = detail.frames[line.id]?.[0]?.asset;
    if (frame?.status === 'ready' && frame.type === 'image') frameAssetIds[i] = frame.id;
    const voice = detail.voices[line.id]?.[0]?.asset;
    if (voice?.status === 'ready' && voice.durationS) voiceIds.push([i, voice.id, voice.durationS]);
  });
  const [{ data: segs }, { data: kit }, product] = await Promise.all([
    voiceIds.length ? sb.from('assets').select('id, transcript_segments').in('id', voiceIds.map(([, id]) => id)) : Promise.resolve({ data: [] as { id: string; transcript_segments: unknown }[] }),
    sb.from('brand_kits').select('*').eq('workspace_id', caller.workspaceId).order('is_default', { ascending: false }).limit(1).maybeSingle(),
    detail.brief.productId
      ? sb.from('products').select('image_asset_ids, logo_asset_id').eq('id', detail.brief.productId).eq('workspace_id', caller.workspaceId).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  const wordsById = new Map((segs ?? []).map((s) => [s.id, storedWords(s.transcript_segments)]));
  const voices: Record<number, StoryboardVoice> = {};
  for (const [i, assetId, durationS] of voiceIds) voices[i] = { assetId, durationS, words: wordsById.get(assetId) };

  const board = storyboardFromScript(
    {
      title: row.title,
      angle: detail.brief.angle ?? '',
      hook: detail.brief.hook ?? '',
      cta: detail.brief.cta ?? '',
      caption: row.captions ?? '',
      hashtags: row.hashtags ?? [],
      musicMood: detail.brief.musicMood ?? '',
      lines: detail.lines,
    },
    { aspect: opts.aspect, brand: brandFromKit(kit ?? null), productImageIds: product?.image_asset_ids ?? [], logoAssetId: product?.logo_asset_id ?? null, frameAssetIds, voices },
  );
  const timeline = await insertTimeline(sb, { workspaceId: caller.workspaceId, name: opts.name ?? `${row.title} · storyboard`, data: board.timeline, createdBy: caller.userId, projectId: row.project_id });
  check(await sb.from('scripts').update({ timeline_id: timeline.id, storyboard: asJson(board.slots) }).eq('id', row.id), 'Could not link the timeline');
  return { id: timeline.id, emptySlots: board.slots.length, durationS: board.durationS };
}
