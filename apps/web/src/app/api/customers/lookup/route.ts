import { NextResponse } from 'next/server';

import { normalizePhone } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';
import { createServerClient } from '@puertaverde/supabase/client';

type UnitJoin = {
  identifier: string;
  building: { name: string } | { name: string }[] | null;
};

function formatDepartment(unit: UnitJoin | null | undefined): string {
  if (!unit) return '';
  const building = Array.isArray(unit.building) ? unit.building[0] : unit.building;
  return building?.name ? `${building.name} — ${unit.identifier}` : unit.identifier;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phone?: string; branchSlug?: string };
    const phone = body.phone?.trim() ?? '';
    const branchSlug = body.branchSlug?.trim() ?? '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      return NextResponse.json({ customer: null });
    }
    if (!branchSlug) {
      return NextResponse.json({ error: 'Sucursal requerida' }, { status: 400 });
    }

    const publicClient = createServerClient();
    const { data: branchRows } = await publicClient.rpc('get_public_branch', {
      target_slug: branchSlug,
    });
    const branch = branchRows?.[0];
    if (!branch) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });
    }

    const normalized = normalizePhone(phone);
    const admin = createAdminClient();

    const { data: customer } = await admin
      .from('customers')
      .select('full_name, default_delivery_label, default_unit_id')
      .eq('organization_id', branch.organization_id)
      .eq('phone', normalized)
      .maybeSingle();

    if (!customer) {
      return NextResponse.json({ customer: null });
    }

    let department = customer.default_delivery_label?.trim() || '';

    if (!department && customer.default_unit_id) {
      const { data: unit } = await admin
        .from('units')
        .select('identifier, building:buildings(name)')
        .eq('id', customer.default_unit_id)
        .maybeSingle();
      department = formatDepartment(unit as UnitJoin | null);
    }

    if (!department) {
      const { data: latestOrder } = await admin
        .from('orders')
        .select('delivery_unit_label, unit_id')
        .eq('organization_id', branch.organization_id)
        .eq('customer_phone', normalized)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestOrder?.delivery_unit_label) {
        department = latestOrder.delivery_unit_label;
      } else if (latestOrder?.unit_id) {
        const { data: unit } = await admin
          .from('units')
          .select('identifier, building:buildings(name)')
          .eq('id', latestOrder.unit_id)
          .maybeSingle();
        department = formatDepartment(unit as UnitJoin | null);
      }
    }

    return NextResponse.json({
      customer: {
        fullName: customer.full_name ?? '',
        department,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al buscar cliente' },
      { status: 500 },
    );
  }
}
