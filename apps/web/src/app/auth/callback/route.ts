import type { NextRequest } from 'next/server';
import { redirectTo, safeNext } from '@/lib/server/auth';
import { sessionClient } from '@/lib/server/supabase';

/** Where email links and OAuth sign-ins land: trades the one-time code for a session cookie. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get('next'));
  const denied = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (denied) return redirectTo(req, '/login', { error: denied.slice(0, 200), next });
  const code = url.searchParams.get('code');
  if (!code) return redirectTo(req, '/login', { error: 'This sign-in link is incomplete. Request a new one.', next });
  const supabase = await sessionClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return redirectTo(req, '/login', { error: 'This sign-in link has expired or was already used. Request a new one.', next });
  return redirectTo(req, next);
}
