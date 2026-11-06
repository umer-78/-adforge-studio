import type { NextRequest } from 'next/server';
import { assertSameOrigin } from '@/lib/server/api';
import { redirectTo, safeNext } from '@/lib/server/auth';
import { sessionClient } from '@/lib/server/supabase';

/** Ends the session on this device. POST only, from the app's own pages. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch {
    return new Response('Cross-site request blocked.', { status: 403 });
  }
  // A form may say where to go next, such as back to an invite after switching accounts.
  const form = req.headers.get('content-type')?.includes('form') ? await req.formData().catch(() => null) : null;
  const next = safeNext(form?.get('next')?.toString(), '');
  const supabase = await sessionClient();
  await supabase.auth.signOut({ scope: 'local' });
  return next ? redirectTo(req, next, {}, 303) : redirectTo(req, '/login', { signedOut: '1' }, 303);
}
