import { ASPECT_RATIOS } from '@adforge/core';
import * as z from 'zod';
import { conflict, logActivity, owned, route } from '@/lib/server/api';
import { buildScriptTimeline } from '@/lib/server/scripts';

const body = z.object({
  aspect: z.enum(ASPECT_RATIOS).default('9:16'),
  name: z.string().trim().min(1).max(200).optional(),
});

/** Turns the script into an editable timeline: frames or shot slots, voice-over, captions and CTA. */
export const POST = route({ body, limit: ['timelines', 200, 3600] }, async ({ sb, caller, body, params }) => {
  const row = await owned(sb, 'scripts', params.id!, caller, 'This script');
  if (row.status === 'generating') throw conflict('Wait until the script finishes writing.');
  const result = await buildScriptTimeline(sb, caller, row, body);
  await logActivity(sb, caller, 'timeline.create', 'timeline', result.id, { from: 'script', scriptId: row.id });
  return result;
});
