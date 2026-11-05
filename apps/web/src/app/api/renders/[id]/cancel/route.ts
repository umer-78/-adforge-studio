import { cancelJob } from '@adforge/core/server';
import { check, owned, route } from '@/lib/server/api';
import { toRenderViews } from '@/lib/server/timelines';

export const POST = route({}, async ({ sb, caller, params }) => {
  const render = await owned(sb, 'renders', params.id!, caller, 'This export');
  if (render.status === 'queued' || render.status === 'running') {
    if (render.job_id) await cancelJob(sb, render.job_id);
    check(await sb.from('renders').update({ status: 'canceled', error: null }).eq('id', render.id).in('status', ['queued', 'running']), 'Could not cancel the export');
  }
  return (await toRenderViews(sb, caller.workspaceId, [await owned(sb, 'renders', render.id, caller)]))[0];
});
