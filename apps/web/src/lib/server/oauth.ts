import 'server-only';
import { AppError } from '@adforge/core';
import { appUrl, serviceClient, social, type ServiceClient } from '@adforge/core/server';
import { unstable_rethrow } from 'next/navigation';
import { connection, NextResponse, type NextRequest } from 'next/server';
import { safeReturnPath } from './distribution';
import { sessionClient } from './supabase';

type OAuthState = Awaited<ReturnType<typeof social.consumeOAuthState>>;

interface FinishArgs {
  sb: ServiceClient;
  /** The connector or ad platform from the callback path. */
  id: string;
  code: string;
  state: OAuthState;
}

/**
 * Handles the browser coming back from a provider's sign-in. The one-time state must belong to the
 * user signed in here, so a link from someone else can never attach accounts to this workspace.
 * Always redirects back into the app with `connected` or `error` in the query.
 */
export function oauthCallback(opts: { kind: 'social' | 'ads'; fallback: string; finish: (args: FinishArgs) => Promise<{ connected: number; label: string }> }) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }): Promise<Response> => {
    await connection();
    const url = req.nextUrl;
    let back = opts.fallback;
    const redirect = (query: Record<string, string>) => {
      const dest = new URL(back, appUrl());
      for (const [k, v] of Object.entries(query)) dest.searchParams.set(k, v);
      return NextResponse.redirect(dest, { headers: { 'cache-control': 'no-store' } });
    };
    try {
      const raw = (await ctx.params).id;
      const id = Array.isArray(raw) ? raw.join('/') : (raw ?? '');
      const stateParam = url.searchParams.get('state');
      if (!stateParam) throw new AppError('oauth_state', 'The sign-in did not come back with a state. Start the connection again.', 400);
      const sb = serviceClient();
      const state = await social.consumeOAuthState(sb, stateParam, `${opts.kind}:${id}`);
      back = safeReturnPath(state.redirect_to, opts.fallback);
      const session = await sessionClient();
      const { data } = await session.auth.getClaims();
      if (data?.claims?.sub !== state.user_id) throw new AppError('forbidden', 'Finish the connection in the browser where you started it, signed in to the same account.', 403);
      const denied = url.searchParams.get('error_description') ?? url.searchParams.get('error');
      if (denied) throw new AppError('oauth_denied', `The connection was not approved (${denied.slice(0, 200)}).`, 400);
      // TikTok's Business API returns the code as auth_code.
      const code = url.searchParams.get('code') ?? url.searchParams.get('auth_code');
      if (!code) throw new AppError('oauth_code', 'The sign-in did not come back with a code. Start the connection again.', 400);
      const result = await opts.finish({ sb, id, code, state });
      await sb.from('activity').insert({ workspace_id: state.workspace_id, actor_id: state.user_id, verb: `${opts.kind}.connected`, object_type: opts.kind === 'social' ? 'social_account' : 'ad_account', object_id: null, data: { provider: id, accounts: result.connected } });
      return redirect({ connected: String(result.connected), provider: result.label });
    } catch (err) {
      unstable_rethrow(err);
      console.warn('[oauth] connection failed', err instanceof Error ? err.message : err);
      return redirect({ error: (err instanceof AppError ? err.message : 'The connection failed. Try again.').slice(0, 300) });
    }
  };
}
