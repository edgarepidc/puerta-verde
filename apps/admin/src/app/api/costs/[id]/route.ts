import { NextResponse } from 'next/server';

import {
  OPERATING_COST_PERIODS,
  OPERATING_COST_TYPES,
  type OperatingCostInput,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para gestionar costos',
  );
  if (denied) return denied;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as Partial<OperatingCostInput>;
    const updates: Partial<{
      name: string;
      cost_type: OperatingCostInput['costType'];
      period: OperatingCostInput['period'];
      amount: number;
      notes: string | null;
      is_active: boolean;
    }> = {};
    if (body.name?.trim()) updates.name = body.name.trim();
    if (body.costType && OPERATING_COST_TYPES.includes(body.costType)) {
      updates.cost_type = body.costType;
    }
    if (body.period && OPERATING_COST_PERIODS.includes(body.period)) {
      updates.period = body.period;
    }
    if (body.amount != null) {
      if (body.amount < 0) {
        return NextResponse.json({ error: 'El monto no puede ser negativo' }, { status: 400 });
      }
      updates.amount = body.amount;
    }
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;
    if (body.isActive !== undefined) updates.is_active = body.isActive;

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('branch_operating_costs')
      .update(updates)
      .eq('id', id)
      .eq('branch_id', tenant.branchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'profit.view',
    'No tienes permiso para gestionar costos',
  );
  if (denied) return denied;

  try {
    const { id } = await params;
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('branch_operating_costs')
      .delete()
      .eq('id', id)
      .eq('branch_id', tenant.branchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar' },
      { status: 500 },
    );
  }
}
