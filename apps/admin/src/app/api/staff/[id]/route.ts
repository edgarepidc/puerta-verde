import { NextResponse } from 'next/server';

import { STAFF_ROLES, type StaffRole } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(auth, 'staff.manage', 'No tienes permiso para editar usuarios');
  if (denied) return denied;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as {
      role?: StaffRole;
      status?: 'active' | 'inactive';
      password?: string;
    };

    const supabase = createAdminClient();
    const { data: membership, error: membershipError } = await supabase
      .from('staff_memberships')
      .select('id, user_id')
      .eq('id', id)
      .eq('organization_id', tenant.organizationId)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const updates: { role?: StaffRole; status?: 'active' | 'inactive' } = {};
    if (body.role && STAFF_ROLES.includes(body.role)) updates.role = body.role;
    if (body.status === 'active' || body.status === 'inactive') updates.status = body.status;

    const password = body.password?.trim() ?? '';
    const changingPassword = Boolean(password);

    if (!Object.keys(updates).length && !changingPassword) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    if (changingPassword) {
      if (membership.user_id === auth.userId) {
        return NextResponse.json(
          { error: 'Cambia tu contraseña en Cuenta' },
          { status: 400 },
        );
      }
      if (password.length < 8) {
        return NextResponse.json(
          { error: 'La contraseña nueva debe tener al menos 8 caracteres' },
          { status: 400 },
        );
      }
      const { error: authError } = await supabase.auth.admin.updateUserById(membership.user_id, {
        password,
      });
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    }

    if (Object.keys(updates).length) {
      const { error } = await supabase
        .from('staff_memberships')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', tenant.organizationId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar usuario' },
      { status: 500 },
    );
  }
}
