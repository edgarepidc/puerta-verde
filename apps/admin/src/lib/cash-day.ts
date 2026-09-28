import { orderPaymentAmounts } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { addMexicoDays } from '@/lib/mexico-date';

export type MethodTotals = {
  cash: number;
  card_terminal: number;
  transfer: number;
  online: number;
};

export type CashDaySummary = {
  closingDate: string;
  totals: MethodTotals;
  channels: {
    pos: MethodTotals & { orderCount: number; total: number };
    web: MethodTotals & { orderCount: number; total: number };
  };
  orderCount: number;
  grandTotal: number;
  closing: Record<string, unknown> | null;
  suggestedOpeningFloat: number | null;
};

function emptyMethodTotals(): MethodTotals {
  return { cash: 0, card_terminal: 0, transfer: 0, online: 0 };
}

function isPosOrder(order: { source?: string | null; delivery_notes?: string | null }) {
  if (order.source === 'pos') return true;
  return (order.delivery_notes ?? '').startsWith('[mostrador]');
}

function channelPayload(totals: MethodTotals, orderCount: number) {
  return {
    ...totals,
    orderCount,
    total: Object.values(totals).reduce((sum, value) => sum + value, 0),
  };
}

export async function loadCashDay(branchId: string, closingDate: string): Promise<CashDaySummary> {
  const supabase = createAdminClient();
  const startOfDay = `${closingDate}T00:00:00-06:00`;
  const endOfDay = `${closingDate}T23:59:59-06:00`;
  const priorDate = addMexicoDays(closingDate, -1);

  const [{ data: orders }, { data: closing }, { data: prior }] = await Promise.all([
    supabase
      .from('orders')
      .select('total, payment_method, payment_splits, payment_status, paid_at, delivery_notes, source')
      .eq('branch_id', branchId)
      .eq('payment_status', 'paid')
      .gte('paid_at', startOfDay)
      .lte('paid_at', endOfDay),
    supabase
      .from('daily_cash_closings')
      .select('*')
      .eq('branch_id', branchId)
      .eq('closing_date', closingDate)
      .maybeSingle(),
    supabase
      .from('daily_cash_closings')
      .select('counted_cash')
      .eq('branch_id', branchId)
      .eq('closing_date', priorDate)
      .maybeSingle(),
  ]);

  const totals = emptyMethodTotals();
  const pos = emptyMethodTotals();
  const web = emptyMethodTotals();
  let posCount = 0;
  let webCount = 0;

  for (const order of orders ?? []) {
    const pieces = orderPaymentAmounts(order);
    if (pieces.length === 0) continue;
    const isPos = isPosOrder(order);
    if (isPos) posCount += 1;
    else webCount += 1;
    for (const piece of pieces) {
      const method = piece.method as keyof MethodTotals;
      if (!(method in totals)) continue;
      totals[method] += piece.amount;
      if (isPos) pos[method] += piece.amount;
      else web[method] += piece.amount;
    }
  }

  const suggested =
    prior?.counted_cash != null && Number.isFinite(Number(prior.counted_cash))
      ? Number(prior.counted_cash)
      : null;

  return {
    closingDate,
    totals,
    channels: {
      pos: channelPayload(pos, posCount),
      web: channelPayload(web, webCount),
    },
    orderCount: orders?.length ?? 0,
    grandTotal: Object.values(totals).reduce((sum, value) => sum + value, 0),
    closing: closing ?? null,
    suggestedOpeningFloat: suggested,
  };
}
