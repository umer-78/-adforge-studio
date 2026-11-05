import { route } from '@/lib/server/api';
import { providerViews } from '@/lib/server/providers';

export const GET = route({}, ({ sb, caller }) => providerViews(sb, caller.workspaceId));
