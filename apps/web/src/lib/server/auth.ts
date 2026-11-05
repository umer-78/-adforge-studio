import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

/** Only same-site paths inside the app; anything else falls back to the dashboard. */
export function safeNext(path: string | null | undefined, fallback = '/dashboard'): string {
  return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/api/') && !path.startsWith('/auth/') ? path : fallback;
}

export function redirectTo(req: NextRequest, path: string, params: Record<string, string> = {}, status = 307) {
  const dest = new URL(path, req.url);
  for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v);
  return NextResponse.redirect(dest, { status, headers: { 'cache-control': 'no-store' } });
}
