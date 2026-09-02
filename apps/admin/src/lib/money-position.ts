import {
  addPocketOutflow,
  applyOperatingCostsToPockets,
  calendarMonthStart,
  costPausedAtPeriodStart,
  parseMoneyPocket,
  resolveMoneyPosition,
  roundMoney,
  type MoneyPositionView,
  type OperatingCostPocketInput,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { addMexicoDays, mexicoYmdBoundsIso } from '@/lib/mexico-date';

export type { MoneyPositionView };

export async function fetchMoneyPosition(
  branchId: string,
  from: string,
  to: string,
): Promise<MoneyPositionView> {
  const supabase = createAdminClient();
  const [{ data: snapshotRow }, { data: costRows }] = await Promise.all([
    supabase
      .from('branch_money_positions')
      .select('as_of_date, cash_amount, account_amount, notes')
      .eq('branch_id', branchId)
      .lte('as_of_date', to)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('branch_operating_costs')
      .select('cost_type, period, amount, paid_from, terms:branch_operating_cost_terms(start_date, end_date)')
      .eq('branch_id', branchId),
  ]);

  const snapshot = snapshotRow
    ? {
        asOfDate: snapshotRow.as_of_date,
        cash: Number(snapshotRow.cash_amount),
        account: Number(snapshotRow.account_amount),
      }
    : null;

  const costs: OperatingCostPocketInput[] = (costRows ?? []).map((row) => ({
    costType: row.cost_type,
    period: row.period,
    amount: Number(row.amount),
    paidFrom: parseMoneyPocket(row.paid_from, 'account'),
    terms: row.terms ?? [],
  }));

  const closesThisPeriod = Boolean(snapshot && snapshot.asOfDate >= to);
  const movementStart = snapshot ? addMexicoDays(snapshot.asOfDate, 1) : from;

  const flows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };

  if (snapshot && !closesThisPeriod) {
    const monthStart = calendarMonthStart(snapshot.asOfDate);
    applyOperatingCostsToPockets(flows, costs, {
      from: monthStart,
      to: snapshot.asOfDate,
      dayBeforeFrom: addMexicoDays(monthStart, -1),
      mode: 'paused-addback',
    });
  }

  if (!closesThisPeriod && movementStart <= to) {
    const saleStart = mexicoYmdBoundsIso(movementStart).start;
    const saleEnd = mexicoYmdBoundsIso(to).end;

    const [ordersRes, purchasesRes, expensesRes, incomesRes] = await Promise.all([
      supabase
        .from('orders')
        .select('total, payment_method')
        .eq('branch_id', branchId)
        .eq('payment_status', 'paid')
        .gte('paid_at', saleStart)
        .lt('paid_at', saleEnd)
        .limit(5000),
      supabase
        .from('purchases')
        .select('total_amount, paid_from')
        .eq('branch_id', branchId)
        .gte('purchased_at', movementStart)
        .lte('purchased_at', to)
        .limit(2000),
      supabase
        .from('expenses')
        .select('amount, paid_from')
        .eq('branch_id', branchId)
        .gte('expense_date', movementStart)
        .lte('expense_date', to)
        .limit(2000),
      supabase
        .from('income_entries')
        .select('entry_type, amount')
        .eq('branch_id', branchId)
        .gte('entry_date', movementStart)
        .lte('entry_date', to)
        .limit(2000),
    ]);

    for (const order of ordersRes.data ?? []) {
      const amount = Number(order.total ?? 0);
      if (order.payment_method === 'cash' || !order.payment_method) {
        flows.cashIn += amount;
      } else if (
        order.payment_method === 'card_terminal' ||
        order.payment_method === 'transfer' ||
        order.payment_method === 'online'
      ) {
        flows.accountIn += amount;
      }
    }

    for (const row of purchasesRes.data ?? []) {
      addPocketOutflow(flows, parseMoneyPocket(row.paid_from), Number(row.total_amount ?? 0));
    }
    for (const row of expensesRes.data ?? []) {
      addPocketOutflow(flows, parseMoneyPocket(row.paid_from), Number(row.amount ?? 0));
    }

    for (const row of incomesRes.data ?? []) {
      const amount = Number(row.amount ?? 0);
      if (row.entry_type === 'contribution') flows.accountIn += amount;
      else flows.cashIn += amount;
    }

    applyOperatingCostsToPockets(flows, costs, {
      from: movementStart,
      to,
      dayBeforeFrom: addMexicoDays(movementStart, -1),
      orderCount: (ordersRes.data ?? []).length,
      mode: 'outflow',
    });
  }

  const resolved = resolveMoneyPosition({
    snapshot,
    periodEnd: to,
    flows: {
      cashIn: roundMoney(flows.cashIn),
      accountIn: roundMoney(flows.accountIn),
      cashOut: roundMoney(flows.cashOut),
      accountOut: roundMoney(flows.accountOut),
    },
  });

  if (closesThisPeriod) {
    const addBack = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
    const needsOrderCount = costs.some(
      (cost) =>
        cost.period === 'per_order' &&
        costPausedAtPeriodStart(cost.terms, from, addMexicoDays(from, -1)),
    );
    let orderCount = 0;
    if (needsOrderCount) {
      const saleStart = mexicoYmdBoundsIso(from).start;
      const saleEnd = mexicoYmdBoundsIso(to).end;
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', branchId)
        .eq('payment_status', 'paid')
        .gte('paid_at', saleStart)
        .lt('paid_at', saleEnd);
      orderCount = count ?? 0;
    }
    applyOperatingCostsToPockets(addBack, costs, {
      from,
      to,
      dayBeforeFrom: addMexicoDays(from, -1),
      orderCount,
      mode: 'paused-addback',
    });
    resolved.cash = roundMoney(resolved.cash + addBack.cashIn);
    resolved.account = roundMoney(resolved.account + addBack.accountIn);
  }

  return {
    ...resolved,
    asOfDate: to,
    notes: snapshot && snapshot.asOfDate >= to ? (snapshotRow?.notes ?? null) : null,
  };
}
