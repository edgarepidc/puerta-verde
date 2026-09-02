import { isUnpaidOrder, ticketCollectedAmount } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { mexicoYmdBoundsIso } from '@/lib/mexico-date';

export type ZeroCostSold = { name: string; revenue: number };

export interface PeriodProfitExtras {
  wasteCost: number;
  zeroCostSold: ZeroCostSold[];
  unpaidRevenue: number;
  unpaidCount: number;
  collectedRevenue: number;
  collectedCount: number;
}

const EMPTY_EXTRAS: PeriodProfitExtras = {
  wasteCost: 0,
  zeroCostSold: [],
  unpaidRevenue: 0,
  unpaidCount: 0,
  collectedRevenue: 0,
  collectedCount: 0,
};

export function emptyPeriodProfitExtras(): PeriodProfitExtras {
  return { ...EMPTY_EXTRAS, zeroCostSold: [] };
}

export async function fetchPeriodProfitExtras(
  supabase: ReturnType<typeof createAdminClient>,
  branchId: string,
  start: string,
  end: string,
): Promise<PeriodProfitExtras> {
  const startBound = mexicoYmdBoundsIso(start).start;
  const endBound = mexicoYmdBoundsIso(end).end;

  const [{ data: wasteRows }, { data: orders }] = await Promise.all([
    supabase
      .from('inventory_movements')
      .select('quantity, unit_cost')
      .eq('branch_id', branchId)
      .eq('movement_type', 'waste')
      .gte('created_at', startBound)
      .lt('created_at', endBound)
      .limit(2000),
    supabase
      .from('orders')
      .select(
        'id, payment_status, payment_method, subtotal, discount_amount, delivery_fee, order_items(product_name, line_total, unit_cost)',
      )
      .eq('branch_id', branchId)
      .neq('status', 'cancelled')
      .gte('created_at', startBound)
      .lt('created_at', endBound)
      .limit(5000),
  ]);

  const wasteCost = (wasteRows ?? []).reduce(
    (sum, row) => sum + Math.abs(Number(row.quantity ?? 0)) * Number(row.unit_cost ?? 0),
    0,
  );

  const byName = new Map<string, number>();
  let unpaidRevenue = 0;
  let unpaidCount = 0;
  let collectedRevenue = 0;
  let collectedCount = 0;

  for (const order of orders ?? []) {
    const ticket = ticketCollectedAmount(order);
    if (isUnpaidOrder(order)) {
      unpaidRevenue += ticket;
      unpaidCount += 1;
    } else {
      collectedRevenue += ticket;
      collectedCount += 1;
    }
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    for (const item of items) {
      if (Number(item.unit_cost ?? 0) > 0) continue;
      const revenue = Number(item.line_total ?? 0);
      if (!(revenue > 0)) continue;
      const name = item.product_name || 'Producto';
      byName.set(name, (byName.get(name) ?? 0) + revenue);
    }
  }

  const zeroCostSold = [...byName.entries()]
    .map(([name, revenue]) => ({ name, revenue: Number(revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  return {
    wasteCost: Number(wasteCost.toFixed(2)),
    zeroCostSold,
    unpaidRevenue: Number(unpaidRevenue.toFixed(2)),
    unpaidCount,
    collectedRevenue: Number(collectedRevenue.toFixed(2)),
    collectedCount,
  };
}
