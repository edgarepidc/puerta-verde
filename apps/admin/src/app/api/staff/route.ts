import { NextResponse } from 'next/server';

import { STAFF_ROLES, normalizeStaffRole, type StaffRole } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { loadPermissionMatrix, requireStaffApi, requireStaffPermission, staffHasPermission } from '@/lib/auth';
import { emailsByUserId } from '@/lib/staff-emails';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();
    const matrix = await loadPermissionMatrix(auth.organizationId);

    const { data: memberships, error } = await supabase
      .from('staff_memberships')
      .select('id, user_id, role, status, branch_id, created_at')
      .eq('organization_id', tenant.organizationId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const userIds = (memberships ?? []).map((row) => row.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, full_name, phone').in('id', userIds)
      : { data: [] };

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const emails = await emailsByUserId(userIds);

    const staff = (memberships ?? []).flatMap((row) => {
      const role = normalizeStaffRole(row.role);
      if (!role) return [];
      const profile = profileById.get(row.user_id);
      return [
        {
          ...row,
          role,
          full_name: profile?.full_name ?? null,
          phone: profile?.phone ?? null,
          email: emails.get(row.user_id) ?? null,
        },
      ];
    });

    return NextResponse.json({
      staff,
      canManage: staffHasPermission(auth, 'staff.manage', matrix),
      currentUserId: auth.userId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar usuarios' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(auth, 'staff.manage', 'No tienes permiso para crear usuarios');
  if (denied) return denied;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as {
      email: string;
      password: string;
      fullName: string;
      role: StaffRole;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const fullName = body.fullName?.trim();
    const role = body.role;

    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: 'Correo y contraseña (mín. 8 caracteres) son obligatorios' }, { status: 400 });
    }
    if (!fullName) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }
    if (!STAFF_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message ?? 'No se pudo crear el usuario' }, { status: 400 });
    }

    const userId = created.user.id;

    await supabase.from('profiles').upsert({
      id: userId,
      full_name: fullName,
    });

    const { error: membershipError } = await supabase.from('staff_memberships').insert({
      user_id: userId,
      organization_id: tenant.organizationId,
      branch_id: tenant.branchId,
      role,
      status: 'active',
    });

    if (membershipError) {
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: membershipError.message }, { status: 400 });
    }

    return NextResponse.json({ userId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear usuario' },
      { status: 500 },
    );
  }
}
