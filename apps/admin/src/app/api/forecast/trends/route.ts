import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get('days') ?? 30) || 30, 7), 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const supabase = createAdminClient();
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, created_at')
      .eq('branch_id', auth.branchId)
      .neq('status', 'cancelled')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })
      .limit(2000);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 400 });
    }

    const orderIds = (orders ?? []).map((order) => order.id);
    const orderDateById = new Map((orders ?? []).map((order) => [order.id, order.created_at.slice(0, 10)]));

    const { data: items, error: itemsError } = orderIds.length
      ? await supabase
          .from('order_items')
          .select('order_id, quantity, product_name')
          .in('order_id', orderIds)
      : { data: [], error: null };

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    const daily = new Map<string, number>();
    const byProduct = new Map<string, number>();

    for (const row of items ?? []) {
      const day = orderDateById.get(row.order_id);
      if (!day) continue;
      const qty = Number(row.quantity);
      daily.set(day, (daily.get(day) ?? 0) + qty);
      const name = row.product_name || 'Producto';
      byProduct.set(name, (byProduct.get(name) ?? 0) + qty);
    }

    const series = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      series.push({ date: key, quantity: Number((daily.get(key) ?? 0).toFixed(3)) });
    }

    const topProducts = [...byProduct.entries()]
      .map(([name, quantity]) => ({ name, quantity: Number(quantity.toFixed(3)) }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);

    return NextResponse.json({ days, series, topProducts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar tendencias' },
      { status: 500 },
    );
  }
}
