import { NextResponse } from 'next/server';

import { validateOperatingCostInput, type OperatingCostInput } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data: costs, error } = await supabase
      .from('branch_operating_costs')
      .select('*')
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ costs: costs ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar costos' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as OperatingCostInput;
    const validationError = validateOperatingCostInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('branch_operating_costs')
      .insert({
        branch_id: tenant.branchId,
        name: body.name.trim(),
        cost_type: body.costType,
        period: body.period,
        amount: body.amount,
        notes: body.notes?.trim() || null,
        is_active: body.isActive,
      })
      .select('id')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'No se pudo crear' }, { status: 400 });
    }

    return NextResponse.json({ id: data.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear costo' },
      { status: 500 },
    );
  }
}
