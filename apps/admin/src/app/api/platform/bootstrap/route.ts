import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

/**
 * Bootstrap one-shot para plataforma.
 * Protegido por BOOTSTRAP_TOKEN (env plain en Vercel).
 *
 * Acciones:
 * - status: ¿existe is_platform_admin?
 * - export-env: devuelve URL/keys de runtime (para reconfigurar envs)
 * - migrate: aplica la migración SQL si hay DATABASE_URL / SUPABASE_DB_URL
 * - promote: marca is_platform_admin=true para un email (requiere columna)
 */
function assertBootstrap(request: Request): NextResponse | null {
  const expected = process.env.BOOTSTRAP_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'BOOTSTRAP_TOKEN no configurado' }, { status: 503 });
  }
  const got = request.headers.get('x-bootstrap-token') ?? '';
  if (got !== expected) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  return null;
}

async function columnExists(): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('profiles').select('is_platform_admin').limit(1);
  if (!error) return true;
  return !(error.message.includes('is_platform_admin') || error.code === '42703');
}

export async function POST(request: Request) {
  const denied = assertBootstrap(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    email?: string;
  };
  const action = body.action ?? 'status';

  if (action === 'status') {
    const hasColumn = await columnExists();
    return NextResponse.json({
      hasColumn,
      platformAdminEmails: process.env.PLATFORM_ADMIN_EMAILS ?? '',
    });
  }

  if (action === 'list-users') {
    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      users: data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at })),
    });
  }

  if (action === 'export-env') {
    return NextResponse.json({
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
      NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL ?? null,
      PLATFORM_ADMIN_EMAILS: process.env.PLATFORM_ADMIN_EMAILS ?? null,
    });
  }

  if (action === 'promote') {
    const email = body.email?.trim();
    if (!email) {
      return NextResponse.json({ error: 'email requerido' }, { status: 400 });
    }
    if (!(await columnExists())) {
      return NextResponse.json(
        { error: 'Falta migración is_platform_admin. Usa PLATFORM_ADMIN_EMAILS mientras tanto.' },
        { status: 409 },
      );
    }
    const supabase = createAdminClient();
    const { data: users, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 400 });
    }
    const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      return NextResponse.json({ error: `No existe usuario ${email}` }, { status: 404 });
    }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, is_platform_admin: true }, { onConflict: 'id' });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, email, userId: user.id });
  }

  if (action === 'migrate') {
    const dbUrl =
      process.env.DATABASE_URL ??
      process.env.SUPABASE_DB_URL ??
      process.env.POSTGRES_URL ??
      null;
    if (!dbUrl) {
      return NextResponse.json(
        {
          error:
            'No hay DATABASE_URL. Aplica supabase/migrations/20250806190000_platform_admin.sql en el SQL Editor, o configura DATABASE_URL.',
        },
        { status: 409 },
      );
    }

    if (await columnExists()) {
      return NextResponse.json({ ok: true, skipped: true, message: 'Migración ya aplicada' });
    }

    const migrationPath = path.join(
      process.cwd(),
      '../../supabase/migrations/20250806190000_platform_admin.sql',
    );
    let sql: string;
    try {
      sql = await readFile(migrationPath, 'utf8');
    } catch {
      // En Vercel el monorepo root puede no estar; embeber SQL mínimo.
      sql = `
alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

create unique index if not exists idx_branches_slug_global
  on public.branches (slug);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_platform_admin
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

do $$ begin
  create policy "platform admin read organizations"
    on public.organizations
    for select to authenticated
    using (public.is_platform_admin());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "platform admin read branches"
    on public.branches
    for select to authenticated
    using (public.is_platform_admin());
exception when duplicate_object then null;
end $$;
`;
    }

    try {
      const postgres = (await import('postgres')).default;
      const sqlClient = postgres(dbUrl, { max: 1 });
      await sqlClient.unsafe(sql);
      await sqlClient.end({ timeout: 5 });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Error al migrar',
          hint: 'Verifica DATABASE_URL (connection string de Postgres).',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, migrated: true, hasColumn: await columnExists() });
  }

  return NextResponse.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
}
