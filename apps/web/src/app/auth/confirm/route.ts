import type { EmailOtpType } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { redirectTo, safeNext } from '@/lib/server/auth';
import { sessionClient } from '@/lib/server/supabase';

const TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/** For email templates that link here with a token hash (works across browsers and devices). */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(url.searchParams.get('next'), type === 'recovery' ? '/reset-password' : '/dashboard');
  if (!tokenHash || !type || !TYPES.includes(type)) return redirectTo(req, '/login', { error: 'This link is incomplete. Request a new one.' });
  const supabase = await sessionClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return redirectTo(req, '/login', { error: 'This link has expired or was already used. Request a new one.' });
  return redirectTo(req, next);
}
