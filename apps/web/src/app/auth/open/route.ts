import type { EmailOtpType } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { openAccessEmail, serviceClient } from '@adforge/core/server';
import { clientIp, rateLimit } from '@/lib/server/api';
import { redirectTo, safeNext } from '@/lib/server/auth';
import { sessionClient } from '@/lib/server/supabase';

const FAILED = 'The studio could not open. Try again in a moment.';

/**
 * With sign-in off (OPEN_ACCESS), opens the studio as the owner account without an email:
 * the server makes a one-time sign-in token for that account and redeems it at once, so this
 * browser gets a normal session (live updates and uploads work as if the owner signed in).
 */
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const email = openAccessEmail();
  if (!email) return redirectTo(req, '/login', { next });

  const supabase = await sessionClient();
  const { data: current } = await supabase.auth.getClaims();
  if ((current?.claims?.email as string | undefined)?.toLowerCase() === email) return redirectTo(req, next);

  const sb = serviceClient();
  try {
    await rateLimit(sb, `open-access:${clientIp(req)}`, 30, 3600);
  } catch {
    return redirectTo(req, '/login', { error: 'Too many tries. Wait a few minutes and open the studio again.' });
  }

  const { data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error('[auth/open] could not make a sign-in token', error?.message);
    return redirectTo(req, '/login', { error: FAILED });
  }
  // A brand-new owner account comes back as a sign-up token; an existing one as a magic link.
  const type: EmailOtpType = data.properties.verification_type === 'signup' ? 'signup' : 'magiclink';
  const { error: verifyError } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (verifyError) {
    console.error('[auth/open] could not redeem the sign-in token', verifyError.message);
    return redirectTo(req, '/login', { error: FAILED });
  }
  return redirectTo(req, next);
}
