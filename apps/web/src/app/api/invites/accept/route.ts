import { AppError } from '@adforge/core';
import * as z from 'zod';
import { assertSameOrigin, publicRoute } from '@/lib/server/api';
import { sessionClient } from '@/lib/server/supabase';
import { acceptInvite } from '@/lib/server/team';

/**
 * Joins a workspace from an invite link. It needs a signed-in session but not workspace access,
 * since the person is not a member yet.
 */
export const POST = publicRoute({ body: z.object({ token: z.string().min(20).max(100) }), limit: ['invite.accept', 20, 600] }, async ({ req, sb, body }) => {
  assertSameOrigin(req);
  const session = await sessionClient();
  const { data } = await session.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) throw new AppError('unauthorized', 'Sign in to accept the invite.', 401);
  return acceptInvite(sb, body.token, { id: claims.sub, email: (claims.email as string | undefined) ?? null });
});
