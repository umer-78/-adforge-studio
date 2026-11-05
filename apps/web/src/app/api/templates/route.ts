import { asJson, isRecord, TIMELINE_TEMPLATES, timelineOps, type TimelineData } from '@adforge/core';
import * as z from 'zod';
import { check, logActivity, route } from '@/lib/server/api';
import { loadTimeline, parseTimelineData } from '@/lib/server/timelines';
import type { TemplateView } from '@/lib/types';

/** Built-in ad structures plus the templates this workspace saved from its own edits. */
export const GET = route({}, async ({ sb, caller }) => {
  const rows = check(await sb.from('templates').select('*').eq('kind', 'timeline').eq('workspace_id', caller.workspaceId).order('updated_at', { ascending: false }).limit(200), 'Could not load templates');
  const builtin: TemplateView[] = TIMELINE_TEMPLATES.map((t) => ({ id: t.id, name: t.name, category: t.category, description: t.description, durationS: t.durationS, aspect: null, builtin: true, updatedAt: null }));
  const mine: TemplateView[] = rows.map((r) => {
    const data = isRecord(r.data) && r.data.timeline ? parseTimelineData(r.data.timeline) : null;
    return {
      id: r.id,
      name: r.name,
      category: 'mine',
      description: r.description ?? '',
      durationS: data ? timelineOps.timelineDuration(data) / data.fps : 0,
      aspect: r.aspect,
      builtin: false,
      updatedAt: r.updated_at,
    };
  });
  return { items: [...mine, ...builtin] };
});

const createSchema = z.object({
  timelineId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  /** Empty out photos and videos so each use starts with slots to fill. */
  slots: z.boolean().default(true),
});

/** Turns photo and video clips into empty, labelled slots; text, music, motion and styling stay. */
function withSlots(tl: TimelineData): TimelineData {
  let n = 0;
  for (const track of tl.tracks)
    for (const c of track.clips) {
      if ((c.type !== 'video' && c.type !== 'image') || c.placeholder) continue;
      n++;
      c.placeholder = { key: `shot-${n}`, label: c.name?.trim() || `Shot ${n}`, kind: 'media' };
      c.assetId = null;
    }
  return tl;
}

/** Saves an edit as a reusable template for this workspace. */
export const POST = route({ body: createSchema, limit: ['templates', 120, 3600] }, async ({ sb, caller, body }) => {
  const row = await loadTimeline(sb, caller, body.timelineId);
  const data = parseTimelineData(row.data);
  const timeline = body.slots ? withSlots(data) : data;
  const saved = check(
    await sb
      .from('templates')
      .insert({
        workspace_id: caller.workspaceId,
        kind: 'timeline',
        name: body.name,
        description: body.description || null,
        category: 'mine',
        aspect: row.aspect,
        is_builtin: false,
        created_by: caller.userId,
        data: asJson({ timeline }),
      })
      .select('*')
      .single(),
    'Could not save the template',
  );
  await logActivity(sb, caller, 'template.created', 'template', saved.id, { from: row.id });
  return { id: saved.id };
});
