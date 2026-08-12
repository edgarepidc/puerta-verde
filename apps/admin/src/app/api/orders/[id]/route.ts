import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await context.params;
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
        delivery_notes,
        total,
        subtotal,
        delivery_fee,
        payment_status,
        payment_method,
        tracking_token,
        created_at,
        paid_at
      `)
      .eq('id', id)
      .eq('branch_id', auth.branchId)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: error?.message ?? 'Pedido no encontrado' }, { status: 404 });
    }

    const { data: items } = await supabase
      .from('order_items')
      .select('id, product_name, unit, quantity, unit_price, line_total')
      .eq('order_id', id)
      .order('created_at', { ascending: true });

    return NextResponse.json({ order, items: items ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar pedido' },
      { status: 500 },
    );
  }
}
