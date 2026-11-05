import * as z from 'zod';
import { logActivity, route } from '@/lib/server/api';
import { insertTimeline, loadTimeline, parseTimelineData } from '@/lib/server/timelines';

const body = z.object({ name: z.string().trim().min(1).max(200).optional() });

export const POST = route({ body, limit: ['timelines', 300, 3600] }, async ({ sb, caller, params, body: b }) => {
  const row = await loadTimeline(sb, caller, params.id!);
  const copy = await insertTimeline(sb, { workspaceId: caller.workspaceId, name: b.name ?? `${row.name} copy`, data: parseTimelineData(row.data), createdBy: caller.userId, projectId: row.project_id, templateId: row.template_id });
  await logActivity(sb, caller, 'timeline.duplicated', 'timeline', copy.id, { from: row.id });
  return { id: copy.id };
});
