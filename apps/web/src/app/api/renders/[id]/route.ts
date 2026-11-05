import { owned, route } from '@/lib/server/api';
import { toRenderViews } from '@/lib/server/timelines';

export const GET = route({}, async ({ sb, caller, params }) => (await toRenderViews(sb, caller.workspaceId, [await owned(sb, 'renders', params.id!, caller, 'This export')]))[0]);
