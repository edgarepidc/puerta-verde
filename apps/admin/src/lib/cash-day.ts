import {
  buildCashDrawerLines,
  operatingCostsChargedOnYmd,
  orderPaymentAmounts,
  parseMoneyPocket,
  type CashDrawerLine,
  type OperatingCostPocketInput,
} from '@puertaverde/shared';
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
  cashLines: CashDrawerLine[];
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

function asTermList(value: unknown): OperatingCostPocketInput['terms'] {
  if (Array.isArray(value)) return value as OperatingCostPocketInput['terms'];
  if (value && typeof value === 'object') return [value as { start_date: string; end_date: string | null }];
  return [];
}

export async function loadCashDay(branchId: string, closingDate: string): Promise<CashDaySummary> {
  const supabase = createAdminClient();
  const startOfDay = `${closingDate}T00:00:00-06:00`;
  const endOfDay = `${closingDate}T23:59:59-06:00`;
  const priorDate = addMexicoDays(closingDate, -1);

  const [
    { data: orders },
    { data: closing },
    { data: prior },
    { data: costRows },
    { data: expenses },
    { data: purchases },
    { data: incomes },
    { data: transfers },
  ] = await Promise.all([
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
    supabase
      .from('branch_operating_costs')
      .select(
        'name, category, cost_type, period, amount, charge_day, paid_from, terms:branch_operating_cost_terms(start_date, end_date)',
      )
      .eq('branch_id', branchId),
    supabase
      .from('expenses')
      .select('concept, amount, paid_from')
      .eq('branch_id', branchId)
      .eq('expense_date', closingDate),
    supabase
      .from('purchases')
      .select('notes, total_amount, paid_from')
      .eq('branch_id', branchId)
      .eq('purchased_at', closingDate),
    supabase
      .from('income_entries')
      .select('concept, amount, paid_from, entry_type')
      .eq('branch_id', branchId)
      .eq('entry_date', closingDate),
    // Table is not in generated types yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('cash_withdrawals')
      .select('amount, destination, notes')
      .eq('branch_id', branchId)
      .eq('withdrawal_date', closingDate),
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

  const costs: OperatingCostPocketInput[] = (costRows ?? []).map((row) => ({
    name: row.name,
    category: row.category,
    costType: row.cost_type,
    period: row.period,
    amount: Number(row.amount),
    chargeDay: row.charge_day ?? 1,
    paidFrom: parseMoneyPocket(row.paid_from, 'account'),
    terms: asTermList(row.terms),
  }));

  const cashLines = buildCashDrawerLines({
    operating: operatingCostsChargedOnYmd(costs, closingDate, (orders ?? []).length),
    expenses: (expenses ?? []).map((row) => ({
      concept: row.concept,
      amount: Number(row.amount ?? 0),
      paidFrom: row.paid_from,
    })),
    purchases: (purchases ?? []).map((row) => ({
      notes: row.notes,
      amount: Number(row.total_amount ?? 0),
      paidFrom: row.paid_from,
    })),
    incomes: (incomes ?? []).map((row) => ({
      concept: row.concept,
      amount: Number(row.amount ?? 0),
      paidFrom: row.paid_from,
      entryType: row.entry_type,
    })),
    transfers: (
      (transfers ?? []) as Array<{ amount: number; destination: string | null; notes: string | null }>
    ).map((row) => ({
      notes: row.notes,
      amount: Number(row.amount ?? 0),
      destination: row.destination,
    })),
  });

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
    cashLines,
  };
}
