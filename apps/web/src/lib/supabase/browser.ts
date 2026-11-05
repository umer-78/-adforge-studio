'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@adforge/core';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False in builds without Supabase settings (local previews, tests): live updates are skipped. */
export const supabaseConfigured = () => !!url && !!key;

/** Browser Supabase client: auth and realtime. Data reads go through the app's API. */
export function supabaseBrowser() {
  if (client) return client;
  if (!url || !key) throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  client = createBrowserClient<Database>(url, key);
  return client;
}
