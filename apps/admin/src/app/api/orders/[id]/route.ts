import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        customer_name,
        customer_phone,
        status,
        fulfillment_type,
        total,
        subtotal,
        delivery_fee,
        payment_status,
        payment_method,
        delivery_notes,
        delivery_unit_label,
        unit_id,
        created_at,
        branch_id
      `)
      .eq('id', id)
      .eq('branch_id', auth.branchId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: error?.message ?? 'Pedido no encontrado' }, { status: 404 });
    }

    const [{ data: items }, unitResult] = await Promise.all([
      supabase
        .from('order_items')
        .select('id, product_name, unit, quantity, unit_price, line_total')
        .eq('order_id', id)
        .order('created_at', { ascending: true }),
      order.unit_id
        ? supabase
            .from('units')
            .select('identifier, building:buildings(name)')
            .eq('id', order.unit_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let department = order.delivery_unit_label?.trim() || '';
    if (!department && unitResult.data) {
      const building = Array.isArray(unitResult.data.building)
        ? unitResult.data.building[0]
        : unitResult.data.building;
      department = building?.name
        ? `${building.name} — ${unitResult.data.identifier}`
        : unitResult.data.identifier;
    }

    return NextResponse.json({
      order: {
        ...order,
        department,
        items: items ?? [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar pedido' },
      { status: 500 },
    );
  }
}
