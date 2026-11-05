import type { NextRequest } from 'next/server';
import { assertSameOrigin } from '@/lib/server/api';
import { redirectTo } from '@/lib/server/auth';
import { sessionClient } from '@/lib/server/supabase';

/** Ends the session on this device. POST only, from the app's own pages. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch {
    return new Response('Cross-site request blocked.', { status: 403 });
  }
  const supabase = await sessionClient();
  await supabase.auth.signOut({ scope: 'local' });
  return redirectTo(req, '/login', { signedOut: '1' }, 303);
}
