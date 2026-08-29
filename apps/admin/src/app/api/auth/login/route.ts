import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { Database } from '@puertaverde/supabase';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { resolveTenantForUser } from '@/lib/tenant';

export async function POST(request: Request) {
  let email = '';
  let password = '';
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = String(body.email ?? '').trim();
    password = String(body.password ?? '');
  } catch {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Correo y contraseña son obligatorios.' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', data.user.id)
    .maybeSingle();
  const isPlatformAdmin = Boolean(profile?.is_platform_admin);
  const tenant = await resolveTenantForUser(data.user.id);

  if (!tenant && !isPlatformAdmin) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: 'Tu cuenta no tiene acceso al panel. Pide acceso al administrador.' },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
