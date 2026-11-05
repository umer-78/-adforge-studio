import { owned, route } from '@/lib/server/api';
import { toJobView } from '@/lib/server/workspace';

export const GET = route({}, async ({ sb, caller, params }) => toJobView(await owned(sb, 'jobs', params.id!, caller, 'The job')));
