import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@adforge/core';
import { env, supabasePublishableKey } from '@adforge/core/server';
import { cookies } from 'next/headers';

/** Cookie-bound Supabase client for route handlers (auth only; data goes through the service client). */
export async function sessionClient() {
  const store = await cookies();
  return createServerClient<Database>(env().NEXT_PUBLIC_SUPABASE_URL, supabasePublishableKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) store.set(name, value, options);
      },
    },
  });
}
