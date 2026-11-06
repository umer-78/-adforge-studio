import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { APP_PREFIXES } from '@/lib/site';

const isAppPath = (p: string) => APP_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));

function allowed(email: string | undefined): boolean {
  const list = (process.env.APP_OWNER_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !list.length || (!!email && list.includes(email.toLowerCase()));
}

/** Refreshes the Supabase session cookie and keeps signed-out visitors out of the app. */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Validates the JWT (locally when the project uses asymmetric keys) and refreshes it when needed.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;

  const redirect = (to: string, params: Record<string, string> = {}) => {
    const dest = new URL(to, request.url);
    for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v);
    const res = NextResponse.redirect(dest);
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  if (isAppPath(path)) {
    if (!claims) return redirect('/login', { next: path + request.nextUrl.search });
    if (!allowed(claims.email as string | undefined)) return redirect('/login', { error: 'not_allowed' });
  }
  if (path === '/login' && claims && allowed(claims.email as string | undefined) && !request.nextUrl.searchParams.has('error')) {
    const next = request.nextUrl.searchParams.get('next');
    return redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
  }
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|mp4|webm|mp3|wav|json|txt|xml|ico|woff2?|cube)$).*)'],
};
