#!/usr/bin/env node
/**
 * Crea el primer usuario super admin (plataforma) de Puerta Verde.
 *
 * Uso:
 *   ADMIN_EMAIL=admin@puertaverde.com ADMIN_PASSWORD='...' ADMIN_NAME='Admin' node scripts/create-admin-user.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME ?? 'Administrador';
const branchSlug = process.env.DEFAULT_BRANCH_SLUG ?? 'puerta-verde-demo';

if (!url || !serviceKey || !email || !password) {
  console.error('Faltan variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: branch, error: branchError } = await supabase
  .from('branches')
  .select('id, organization_id')
  .eq('slug', branchSlug)
  .single();

if (branchError || !branch) {
  console.error('Sucursal no encontrada:', branchError?.message);
  process.exit(1);
}

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});

if (createError || !created.user) {
  console.error('No se pudo crear usuario:', createError?.message);
  process.exit(1);
}

const userId = created.user.id;

await supabase.from('profiles').upsert({ id: userId, full_name: fullName, is_platform_admin: true });

const { error: membershipError } = await supabase.from('staff_memberships').insert({
  user_id: userId,
  organization_id: branch.organization_id,
  branch_id: branch.id,
  role: 'owner',
  status: 'active',
});

if (membershipError) {
  console.error('No se pudo asignar membresía:', membershipError.message);
  process.exit(1);
}

console.log(`Usuario super admin creado: ${email} (${userId})`);
console.log('Accede al panel → /plataforma para crear verdulerías.');
