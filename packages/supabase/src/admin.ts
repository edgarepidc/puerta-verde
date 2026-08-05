import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client.');
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
