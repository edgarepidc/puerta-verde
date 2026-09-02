import { createAdminClient } from '@puertaverde/supabase/admin';

import { mexicoYmdBoundsIso } from '@/lib/mexico-date';

export type ZeroCostSold = { name: string; revenue: number };

export async function fetchPeriodProfitExtras(
  supabase: ReturnType<typeof createAdminClient>,
  branchId: string,
  start: string,
  end: string,
): Promise<{ wasteCost: number; zeroCostSold: ZeroCostSold[] }> {
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
      .select('id, order_items(product_name, line_total, unit_cost)')
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
  for (const order of orders ?? []) {
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

  return { wasteCost: Number(wasteCost.toFixed(2)), zeroCostSold };
}
