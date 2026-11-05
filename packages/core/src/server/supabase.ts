import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { env, supabaseSecretKey } from './env';

export type ServiceClient = SupabaseClient<Database>;
export type AnyClient = SupabaseClient<Database>;

let service: ServiceClient | null = null;

/** Service-role client. Bypasses RLS: only use after checking the caller's access. */
export function serviceClient(): ServiceClient {
  if (service) return service;
  service = createClient<Database>(env().NEXT_PUBLIC_SUPABASE_URL, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-application-name': 'adforge' } },
  });
  return service;
}

/** Throws a readable error for a failed PostgREST call, otherwise returns data. */
export function must<T>(result: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data == null) throw new Error(`${what}: not found`);
  return result.data;
}
