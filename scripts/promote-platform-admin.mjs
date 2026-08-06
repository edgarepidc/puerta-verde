#!/usr/bin/env node
/**
 * Marca un usuario existente como super admin de plataforma (columna BD).
 *
 * Alternativa sin migración: define PLATFORM_ADMIN_EMAILS=tu@correo.com en Vercel.
 *
 * Uso:
 *   ADMIN_EMAIL=tu@correo.com node scripts/promote-platform-admin.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;

if (!url || !serviceKey || !email) {
  console.error('Faltan variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: users, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (listError) {
  console.error(listError.message);
  process.exit(1);
}

const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No existe usuario con email ${email}`);
  process.exit(1);
}

const { error } = await supabase
  .from('profiles')
  .upsert({ id: user.id, is_platform_admin: true }, { onConflict: 'id' });

if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`OK: ${email} ahora es super admin. Entra al panel → /plataforma`);
