import { NextResponse } from 'next/server';

import { PAYMENT_METHODS, type PaymentMethod } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';
import {
  addMexicoDays,
  mexicoYmdAtNoonIso,
  mexicoYmdBoundsIso,
  resolveProfitDateRange,
  todayMexicoYmd,
} from '@/lib/mexico-date';

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function mexicoWeekdayIndex(ymd: string): number {
  return new Date(mexicoYmdAtNoonIso(ymd)).getUTCDay();
}

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
      .select('id, created_at, total, payment_method')
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
          .select('order_id, quantity, product_name, line_total, unit_cost')
          .in('order_id', orderIds)
      : { data: [], error: null };

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }

    const daily = new Map<string, number>();
    const byProduct = new Map<string, { quantity: number; revenue: number; profit: number }>();
    const byPayment = new Map<string, number>();

    for (const order of orders ?? []) {
      const day = todayMexicoYmd(new Date(order.created_at));
      const amount = Number(order.total ?? 0);
      daily.set(day, (daily.get(day) ?? 0) + amount);
      const method =
        order.payment_method && (PAYMENT_METHODS as readonly string[]).includes(order.payment_method)
          ? order.payment_method
          : 'cash';
      byPayment.set(method, (byPayment.get(method) ?? 0) + amount);
    }

    for (const row of items ?? []) {
      const day = orderDateById.get(row.order_id);
      if (!day) continue;
      const name = row.product_name || 'Producto';
      const quantity = Number(row.quantity ?? 0);
      const revenue = Number(row.line_total ?? 0);
      const profit = revenue - quantity * Number(row.unit_cost ?? 0);
      const prev = byProduct.get(name) ?? { quantity: 0, revenue: 0, profit: 0 };
      byProduct.set(name, {
        quantity: prev.quantity + quantity,
        revenue: prev.revenue + revenue,
        profit: prev.profit + profit,
      });
    }

    const series: Array<{ date: string; amount: number }> = [];
    for (let cursor = range.start; cursor <= range.end; cursor = addMexicoDays(cursor, 1)) {
      series.push({ date: cursor, amount: Number((daily.get(cursor) ?? 0).toFixed(2)) });
    }

    const topProducts = [...byProduct.entries()].map(([name, stats]) => ({
      name,
      quantity: Number(stats.quantity.toFixed(3)),
      revenue: Number(stats.revenue.toFixed(2)),
      profit: Number(stats.profit.toFixed(2)),
    }));

    const weekdayBuckets = WEEKDAY_LABELS.map((label, weekday) => ({
      weekday,
      label,
      amount: 0,
      days: 0,
    }));
    for (const point of series) {
      const weekday = mexicoWeekdayIndex(point.date);
      weekdayBuckets[weekday].amount += point.amount;
      weekdayBuckets[weekday].days += 1;
    }
    const topWeekdays = weekdayBuckets
      .filter((row) => row.days > 0)
      .map((row) => ({
        ...row,
        amount: Number(row.amount.toFixed(2)),
        average: Number((row.amount / Math.max(row.days, 1)).toFixed(2)),
      }))
      .sort((a, b) => b.average - a.average || a.days - b.days)
      .slice(0, 3);

    const paymentTotal = [...byPayment.values()].reduce((sum, value) => sum + value, 0);
    const paymentBreakdown = PAYMENT_METHODS.map((method: PaymentMethod) => {
      const amount = Number((byPayment.get(method) ?? 0).toFixed(2));
      return {
        method,
        amount,
        percent: paymentTotal > 0 ? Number(((amount / paymentTotal) * 100).toFixed(1)) : 0,
      };
    }).filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      from: range.start,
      to: range.end,
      periodLabel: range.label,
      series,
      topProducts,
      topWeekdays,
      paymentBreakdown,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar tendencias' },
      { status: 500 },
    );
  }
}
