import { capabilitySchema } from '@adforge/core';
import * as z from 'zod';
import { route } from '@/lib/server/api';
import { listModels } from '@/lib/server/generation';

export const GET = route({ query: z.object({ capability: capabilitySchema.optional() }) }, async ({ sb, caller, query }) => ({ items: await listModels(sb, caller, query.capability) }));
