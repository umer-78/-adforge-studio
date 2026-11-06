import * as z from 'zod';
import { deleteAccount } from '@/lib/server/account';
import { check, route } from '@/lib/server/api';
import { requireSession } from '@/lib/server/providers';
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

/**
 * Permanently deletes the signed-in account and every workspace it owns. Only from the app, never
 * with an API key, and only with the typed confirmation.
 */
export const DELETE = route({ body: z.object({ confirm: z.literal('DELETE') }), role: 'viewer', limit: ['account-delete', 5, 3600] }, async ({ sb, caller }) => {
  requireSession(caller, 'Your account');
  return deleteAccount(sb, caller.userId);
});
