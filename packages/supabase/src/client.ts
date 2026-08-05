import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

function getSupabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;

  if (!url) {
    throw new Error('Missing Supabase URL. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.');
  }

  return url;
}

function getSupabaseAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error('Missing Supabase anon key. Set NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY.');
  }

  return key;
}

export function createBrowserClient(): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export function createServerClient(): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
