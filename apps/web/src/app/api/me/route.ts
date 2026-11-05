import * as z from 'zod';
import { check, route } from '@/lib/server/api';
import { loadMe } from '@/lib/server/workspace';

export const GET = route({}, ({ sb, caller }) => loadMe(sb, caller));

const profileSchema = z.object({
  fullName: z.string().max(120).nullable().optional(),
  avatarUrl: z.string().url().max(1000).nullable().optional(),
});

export const PATCH = route({ body: profileSchema, role: 'viewer' }, async ({ sb, caller, body }) => {
  const patch: { full_name?: string | null; avatar_url?: string | null } = {};
  if (body.fullName !== undefined) patch.full_name = body.fullName;
  if (body.avatarUrl !== undefined) patch.avatar_url = body.avatarUrl;
  check(await sb.from('profiles').update(patch).eq('id', caller.userId), 'Could not save your profile');
  return loadMe(sb, caller);
});
