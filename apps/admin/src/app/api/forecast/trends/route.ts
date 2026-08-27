import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';
import {
  addMexicoDays,
  mexicoYmdBoundsIso,
  resolveProfitDateRange,
  todayMexicoYmd,
} from '@/lib/mexico-date';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const range = resolveProfitDateRange(searchParams.get('from'), searchParams.get('to'));
    if (!range.ok) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const startBound = mexicoYmdBoundsIso(range.start).start;
    const endBound = mexicoYmdBoundsIso(range.end).end;

    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, created_at, total')
      .eq('branch_id', tenant.branchId)
      .neq('status', 'cancelled')
      .gte('created_at', startBound)
      .lt('created_at', endBound)
      .order('created_at', { ascending: true })
      .limit(5000);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 400 });
    }

    const orderIds = (orders ?? []).map((order) => order.id);
    const orderDateById = new Map(
      (orders ?? []).map((order) => [order.id, todayMexicoYmd(new Date(order.created_at))]),
    );

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

    for (const order of orders ?? []) {
      const day = todayMexicoYmd(new Date(order.created_at));
      daily.set(day, (daily.get(day) ?? 0) + Number(order.total ?? 0));
    }

    for (const row of items ?? []) {
      const day = orderDateById.get(row.order_id);
      if (!day) continue;
      const name = row.product_name || 'Producto';
      byProduct.set(name, (byProduct.get(name) ?? 0) + Number(row.quantity));
    }

    const series: Array<{ date: string; amount: number }> = [];
    for (let cursor = range.start; cursor <= range.end; cursor = addMexicoDays(cursor, 1)) {
      series.push({ date: cursor, amount: Number((daily.get(cursor) ?? 0).toFixed(2)) });
    }

    const topProducts = [...byProduct.entries()]
      .map(([name, quantity]) => ({ name, quantity: Number(quantity.toFixed(3)) }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);

    return NextResponse.json({
      from: range.start,
      to: range.end,
      periodLabel: range.label,
      series,
      topProducts,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar tendencias' },
      { status: 500 },
    );
  }
}
