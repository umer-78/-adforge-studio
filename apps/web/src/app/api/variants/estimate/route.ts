import { variantBatchCreateSchema } from '@adforge/core';
import { route } from '@/lib/server/api';
import { variantBatchEstimate } from '@/lib/server/growth';
import { loadTimeline, parseTimelineData } from '@/lib/server/timelines';

/** Price of a variant batch before it is planned: Claude planning plus re-voicing when voices vary. */
export const POST = route({ body: variantBatchCreateSchema.pick({ sourceTimelineId: true, dimensions: true, count: true }), limit: ['estimates', 600, 3600] }, async ({ sb, caller, body }) => {
  const row = await loadTimeline(sb, caller, body.sourceTimelineId);
  const estimate = await variantBatchEstimate(sb, caller.workspaceId, parseTimelineData(row.data), [...new Set(body.dimensions)], body.count);
  return { ...estimate, approx: true };
});
