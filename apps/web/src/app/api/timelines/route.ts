import { timelineCreateSchema } from '@adforge/core';
import * as z from 'zod';
import { logActivity, owned, route } from '@/lib/server/api';
import { buildScriptTimeline } from '@/lib/server/scripts';
import { insertTimeline, startingTimeline, toTimelineSummaries } from '@/lib/server/timelines';

const query = z.object({
  q: z.string().max(200).optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  cursor: z.string().optional(),
});

export const GET = route({ query }, async ({ sb, caller, query: q }) => {
  let req = sb.from('timelines').select('*').eq('workspace_id', caller.workspaceId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(q.limit + 1);
  if (q.q?.trim()) req = req.ilike('name', `%${q.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  if (q.projectId) req = req.eq('project_id', q.projectId);
  if (q.cursor) req = req.lt('updated_at', q.cursor);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  const page = (data ?? []).slice(0, q.limit);
  return { items: await toTimelineSummaries(sb, caller.workspaceId, page), nextCursor: (data?.length ?? 0) > q.limit ? page[page.length - 1]!.updated_at : null };
});

/** Starts an edit: blank, from a template, from files, from a motion template, or from a script. */
export const POST = route({ body: timelineCreateSchema, limit: ['timelines', 300, 3600] }, async ({ sb, caller, body }) => {
  if (body.projectId) await owned(sb, 'projects', body.projectId, caller, 'The project');
  if (body.scriptId) {
    const script = await owned(sb, 'scripts', body.scriptId, caller, 'The script');
    const built = await buildScriptTimeline(sb, caller, script, { aspect: body.aspect, name: body.name === 'Untitled edit' ? undefined : body.name });
    await logActivity(sb, caller, 'timeline.created', 'timeline', built.id, { from: 'script' });
    return { id: built.id };
  }
  const { data, templateRowId } = await startingTimeline(sb, caller, body);
  const row = await insertTimeline(sb, { workspaceId: caller.workspaceId, name: body.name, data, createdBy: caller.userId, projectId: body.projectId ?? null, templateId: templateRowId });
  await logActivity(sb, caller, 'timeline.created', 'timeline', row.id, { from: body.data !== undefined ? 'copy' : body.motion ? 'motion' : body.assetIds?.length ? 'files' : body.templateId ? 'template' : 'blank' });
  return { id: row.id };
});
