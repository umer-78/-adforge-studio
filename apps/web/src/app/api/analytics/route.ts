import * as z from 'zod';
import { route } from '@/lib/server/api';
import { buildAnalytics } from '@/lib/server/analytics';

const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export const GET = route({ query, limit: ['analytics', 120, 3600] }, async ({ sb, caller, query: q }) => buildAnalytics(sb, caller, q.days));
