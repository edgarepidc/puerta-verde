'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@puertaverde/supabase';

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
