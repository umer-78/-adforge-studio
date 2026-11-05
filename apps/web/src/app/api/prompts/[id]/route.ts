import * as z from 'zod';
import { check, owned, route } from '@/lib/server/api';

const patchSchema = z.object({ title: z.string().max(120).optional(), isSaved: z.boolean().optional(), prompt: z.string().min(1).max(5000).optional(), tags: z.array(z.string().max(40)).max(20).optional() });

export const PATCH = route({ body: patchSchema }, async ({ sb, caller, params, body }) => {
  const row = await owned(sb, 'prompts', params.id!, caller, 'This prompt');
  return check(
    await sb
      .from('prompts')
      .update({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.isSaved !== undefined ? { is_saved: body.isSaved } : {}),
        ...(body.prompt !== undefined ? { prompt: body.prompt } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
      })
      .eq('id', row.id)
      .select('*')
      .single(),
    'Could not save the prompt',
  );
});

export const DELETE = route({}, async ({ sb, caller, params }) => {
  const row = await owned(sb, 'prompts', params.id!, caller, 'This prompt');
  check(await sb.from('prompts').delete().eq('id', row.id), 'Could not delete the prompt');
  return { ok: true };
});
