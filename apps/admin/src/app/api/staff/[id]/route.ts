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
    };

    const updates: { role?: StaffRole; status?: 'active' | 'inactive' } = {};
    if (body.role && STAFF_ROLES.includes(body.role)) updates.role = body.role;
    if (body.status === 'active' || body.status === 'inactive') updates.status = body.status;

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('staff_memberships')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', tenant.organizationId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar usuario' },
      { status: 500 },
    );
  }
}
