'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@puertaverde/supabase';

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Falta la conexión a Supabase en el navegador.');
  }
  return createBrowserClient<Database>(url, anonKey);
}
