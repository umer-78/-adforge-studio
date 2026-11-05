import { AD_PLATFORMS } from '@adforge/core';
import { ads, social } from '@adforge/core/server';
import * as z from 'zod';
import { badRequest, route } from '@/lib/server/api';
import { oauthRedirectUri, safeReturnPath } from '@/lib/server/distribution';

/** Starts the ad platform sign-in. Ads made through it are always created paused. */
export const POST = route({ body: z.object({ platform: z.enum(AD_PLATFORMS), returnTo: z.string().max(500).optional() }), role: 'admin', scope: 'ads', limit: ['oauth', 30, 600] }, async ({ sb, caller, body }) => {
  if (caller.via !== 'session') throw badRequest('Connect ad accounts from the app in a browser.');
  const p = ads.ADS_PLATFORMS[body.platform];
  if (!p.configured()) throw badRequest(`${p.label} is not set up on this server yet: add its app keys to the environment (see the README).`);
  const { state } = await social.createOAuthState(sb, { workspaceId: caller.workspaceId, userId: caller.userId, platform: `ads:${p.id}`, redirectTo: safeReturnPath(body.returnTo, '/settings/ad-accounts') });
  return { url: p.authorizeUrl({ state, redirectUri: oauthRedirectUri('ads', p.id) }) };
});
