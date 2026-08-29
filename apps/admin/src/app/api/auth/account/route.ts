import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as {
      fullName?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const fullName = body.fullName?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';
    const currentPassword = body.currentPassword ?? '';
    const newPassword = body.newPassword?.trim() ?? '';

    const emailChanged = Boolean(email) && email !== auth.email.toLowerCase();
    const passwordChanged = Boolean(newPassword);
    const nameChanged = fullName.length > 0 && fullName !== (auth.fullName ?? '').trim();

    if (!emailChanged && !passwordChanged && !nameChanged) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    if (email && !isEmail(email)) {
      return NextResponse.json({ error: 'El usuario debe ser un correo válido' }, { status: 400 });
    }

    if (passwordChanged && newPassword.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña nueva debe tener al menos 8 caracteres' },
        { status: 400 },
      );
    }

    if (emailChanged || passwordChanged) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Escribe tu contraseña actual para cambiar usuario o contraseña' },
          { status: 400 },
        );
      }

      const supabase = await createSupabaseServerClient();
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: auth.email,
        password: currentPassword,
      });
      if (verifyError) {
        return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 401 });
      }
    }

    const admin = createAdminClient();

    if (nameChanged) {
      const { error: profileError } = await admin
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', auth.userId);
      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 400 });
      }
    }

    if (emailChanged || passwordChanged) {
      const { error: authError } = await admin.auth.admin.updateUserById(auth.userId, {
        ...(emailChanged ? { email, email_confirm: true } : {}),
        ...(passwordChanged ? { password: newPassword } : {}),
        ...(fullName ? { user_metadata: { full_name: fullName } } : {}),
      });
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      ok: true,
      email: emailChanged ? email : auth.email,
      fullName: nameChanged ? fullName : auth.fullName,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo guardar la cuenta' },
      { status: 500 },
    );
  }
}
