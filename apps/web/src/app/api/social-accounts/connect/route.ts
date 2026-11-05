import { social } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, route } from '@/lib/server/api';
import { oauthRedirectUri, safeReturnPath } from '@/lib/server/distribution';

const body = z.object({
  connector: z.enum(Object.keys(social.CONNECTORS) as [social.ConnectorId, ...social.ConnectorId[]]),
  returnTo: z.string().max(500).optional(),
});

/** Starts a provider sign-in. The browser goes to the returned URL and comes back to the callback. */
export const POST = route({ body, role: 'admin', limit: ['oauth', 30, 600] }, async ({ sb, caller, body: b }) => {
  if (caller.via !== 'session') throw badRequest('Connect accounts from the app in a browser.');
  const c = social.CONNECTORS[b.connector];
  if (!c.configured()) throw badRequest(`${c.label} is not set up on this server yet: add its app keys to the environment (see the README).`);
  const { state, codeChallenge } = await social.createOAuthState(sb, { workspaceId: caller.workspaceId, userId: caller.userId, platform: `social:${c.id}`, redirectTo: safeReturnPath(b.returnTo, '/settings/accounts'), pkce: c.pkce });
  return { url: c.authorizeUrl({ state, redirectUri: oauthRedirectUri('social', c.id), codeChallenge }) };
});
