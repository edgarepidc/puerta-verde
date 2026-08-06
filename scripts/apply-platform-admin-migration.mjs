#!/usr/bin/env node
/**
 * Aplica la migración de platform admin vía Management API.
 *
 * Requiere UNA de:
 *   SUPABASE_ACCESS_TOKEN  (Account → Access Tokens en supabase.com)
 *   DATABASE_URL / SUPABASE_DB_URL  (connection string de Postgres)
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-platform-admin-migration.mjs
 *   DATABASE_URL='postgresql://...' node scripts/apply-platform-admin-migration.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const migrationFile = path.join(
  root,
  'supabase/migrations/20250806190000_platform_admin.sql',
);

const projectRef =
  process.env.SUPABASE_PROJECT_REF ??
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
    .replace(/^https?:\/\//, '')
    .split('.')[0];

const sql = await readFile(migrationFile, 'utf8');

async function viaManagementApi(token) {
  if (!projectRef) {
    throw new Error('Falta SUPABASE_PROJECT_REF o NEXT_PUBLIC_SUPABASE_URL');
  }
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Management API ${response.status}: ${text}`);
  }
  console.log('OK: migración aplicada vía Management API');
  if (text) console.log(text.slice(0, 500));
}

async function viaDatabaseUrl(dbUrl) {
  const postgres = (await import('postgres')).default;
  const sqlClient = postgres(dbUrl, { max: 1 });
  try {
    await sqlClient.unsafe(sql);
    console.log('OK: migración aplicada vía DATABASE_URL');
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

async function verify() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('Skip verify: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.from('profiles').select('is_platform_admin').limit(1);
  if (error) {
    console.error('Verify FAIL:', error.message);
    process.exitCode = 1;
    return;
  }
  console.log('Verify OK: profiles.is_platform_admin existe');
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const dbUrl =
  process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? process.env.POSTGRES_URL;

try {
  if (token) {
    await viaManagementApi(token);
  } else if (dbUrl) {
    await viaDatabaseUrl(dbUrl);
  } else {
    console.error(
      'Falta SUPABASE_ACCESS_TOKEN o DATABASE_URL.\n' +
        'Crea un token en https://supabase.com/dashboard/account/tokens\n' +
        'Luego: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-platform-admin-migration.mjs',
    );
    process.exit(1);
  }
  await verify();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
