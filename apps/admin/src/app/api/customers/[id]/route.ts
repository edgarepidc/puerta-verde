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

    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, phone, full_name, whatsapp_opt_in, created_at, updated_at')
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .maybeSingle();

    if (error || !customer) {
      return NextResponse.json({ error: error?.message ?? 'Cliente no encontrado' }, { status: 404 });
    }

    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        fulfillment_type,
        total,
        payment_status,
        created_at
      `)
      .eq('organization_id', auth.organizationId)
      .eq('customer_phone', customer.phone)
      .order('created_at', { ascending: false })
      .limit(50);

    const orderIds = (orders ?? []).map((order) => order.id);
    const { data: items } = orderIds.length
      ? await supabase
          .from('order_items')
          .select('id, order_id, quantity, unit_price, line_total, product_name')
          .in('order_id', orderIds)
      : { data: [] };

    const itemsByOrder = new Map<string, typeof items>();
    for (const item of items ?? []) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }

    const ordersWithItems = (orders ?? []).map((order) => ({
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
    }));

    const productTotals = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const order of ordersWithItems) {
      for (const item of order.items) {
        const key = item.product_name ?? 'Producto';
        const current = productTotals.get(key) ?? { name: key, quantity: 0, revenue: 0 };
        current.quantity += Number(item.quantity);
        current.revenue += Number(
          item.line_total ?? Number(item.quantity) * Number(item.unit_price),
        );
        productTotals.set(key, current);
      }
    }

    const topProducts = [...productTotals.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);

    return NextResponse.json({
      customer,
      orders: ordersWithItems,
      topProducts,
      stats: {
        orderCount: ordersWithItems.length,
        totalSpent: Number(
          ordersWithItems.reduce((sum, order) => sum + Number(order.total), 0).toFixed(2),
        ),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar cliente' },
      { status: 500 },
    );
  }
}
