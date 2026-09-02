import {
  addCollectedTicket,
  addPocketOutflow,
  applyOperatingCostsToPockets,
  calendarMonthStart,
  parseMoneyPocket,
  pocketTotal,
  resolveMoneyPosition,
  roundMoney,
  type MoneyPositionFlows,
  type MoneyPositionView,
  type OperatingCostPocketInput,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { addMexicoDays, mexicoYmdBoundsIso } from '@/lib/mexico-date';

export type { MoneyPositionView };

async function fetchPaged<T>(
  run: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await run(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

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
      .select('cost_type, period, amount, charge_day, paid_from, terms:branch_operating_cost_terms(start_date, end_date)')
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
    chargeDay: row.charge_day ?? 1,
    paidFrom: parseMoneyPocket(row.paid_from, 'account'),
    terms: row.terms ?? [],
  }));

  const closesThisPeriod = Boolean(snapshot && snapshot.asOfDate >= to);
  const movementStart = snapshot ? addMexicoDays(snapshot.asOfDate, 1) : from;

  const flows: MoneyPositionFlows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
  const ticketFlows: MoneyPositionFlows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
  const pausedFlows: MoneyPositionFlows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };

  if (snapshot && !closesThisPeriod) {
    const monthStart = calendarMonthStart(snapshot.asOfDate);
    applyOperatingCostsToPockets(pausedFlows, costs, {
      from: monthStart,
      to: snapshot.asOfDate,
      dayBeforeFrom: addMexicoDays(monthStart, -1),
      mode: 'paused-addback',
    });
    flows.cashIn += pausedFlows.cashIn;
    flows.accountIn += pausedFlows.accountIn;
  }

  if (!closesThisPeriod && movementStart <= to) {
    const saleStart = mexicoYmdBoundsIso(movementStart).start;
    const saleEnd = mexicoYmdBoundsIso(to).end;

    const [orders, purchases, expenses, incomes] = await Promise.all([
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('orders')
          .select(
            'status, payment_status, payment_method, subtotal, discount_amount, delivery_fee, total',
          )
          .eq('branch_id', branchId)
          .eq('payment_status', 'paid')
          .neq('status', 'cancelled')
          .gte('paid_at', saleStart)
          .lt('paid_at', saleEnd)
          .range(rangeFrom, rangeTo),
      ),
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('purchases')
          .select('total_amount, paid_from')
          .eq('branch_id', branchId)
          .gte('purchased_at', movementStart)
          .lte('purchased_at', to)
          .range(rangeFrom, rangeTo),
      ),
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('expenses')
          .select('amount, paid_from')
          .eq('branch_id', branchId)
          .gte('expense_date', movementStart)
          .lte('expense_date', to)
          .range(rangeFrom, rangeTo),
      ),
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('income_entries')
          .select('entry_type, amount')
          .eq('branch_id', branchId)
          .gte('entry_date', movementStart)
          .lte('entry_date', to)
          .range(rangeFrom, rangeTo),
      ),
    ]);

    for (const order of orders) {
      addCollectedTicket(flows, order);
      addCollectedTicket(ticketFlows, order);
    }

    for (const row of purchases) {
      addPocketOutflow(flows, parseMoneyPocket(row.paid_from), Number(row.total_amount ?? 0));
    }
    for (const row of expenses) {
      addPocketOutflow(flows, parseMoneyPocket(row.paid_from), Number(row.amount ?? 0));
    }

    for (const row of incomes) {
      const amount = Number(row.amount ?? 0);
      if (row.entry_type === 'contribution') flows.accountIn += amount;
      else flows.cashIn += amount;
    }

    applyOperatingCostsToPockets(flows, costs, {
      from: movementStart,
      to,
      dayBeforeFrom: addMexicoDays(movementStart, -1),
      orderCount: orders.length,
      mode: 'outflow',
    });
  }

  const roundedFlows = {
    cashIn: roundMoney(flows.cashIn),
    accountIn: roundMoney(flows.accountIn),
    cashOut: roundMoney(flows.cashOut),
    accountOut: roundMoney(flows.accountOut),
  };

  const resolved = resolveMoneyPosition({
    snapshot,
    periodEnd: to,
    flows: roundedFlows,
  });

  const ticketInCash = roundMoney(ticketFlows.cashIn);
  const ticketInAccount = roundMoney(ticketFlows.accountIn);

  return {
    ...resolved,
    asOfDate: to,
    notes: snapshot && snapshot.asOfDate >= to ? (snapshotRow?.notes ?? null) : null,
    openingTotal: snapshot ? pocketTotal(snapshot) : 0,
    openingAsOf: snapshot?.asOfDate ?? null,
    periodIn: roundMoney(roundedFlows.cashIn + roundedFlows.accountIn),
    periodOut: roundMoney(roundedFlows.cashOut + roundedFlows.accountOut),
    ticketIn: roundMoney(ticketInCash + ticketInAccount),
    ticketInCash,
    ticketInAccount,
    pausedIn: roundMoney(pausedFlows.cashIn + pausedFlows.accountIn),
  };
}
