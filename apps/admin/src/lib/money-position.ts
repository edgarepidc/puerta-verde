import {
  addCollectedTicket,
  addPocketInflow,
  addPocketOutflow,
  applyOperatingCostsToPockets,
  buildMoneyLedger,
  isIncomeEntryType,
  isRecordedAfterCount,
  moneyLedgerRowYmd,
  parseIncomePocket,
  parseMoneyPocket,
  roundMoney,
  type MoneyLedger,
  type MoneyPositionFlows,
  type MoneyPositionView,
  type OperatingCostPocketInput,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { addMexicoDays, mexicoYmdBoundsIso } from '@/lib/mexico-date';

export type { MoneyLedger, MoneyPositionView };

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

function emptyFlows(): MoneyPositionFlows {
  return { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
}

function addSelectedPockets(
  target: MoneyPositionFlows,
  source: MoneyPositionFlows,
  sides: { cash: boolean; account: boolean },
) {
  if (sides.cash) {
    target.cashIn += source.cashIn;
    target.cashOut += source.cashOut;
  }
  if (sides.account) {
    target.accountIn += source.accountIn;
    target.accountOut += source.accountOut;
  }
}

export async function fetchMoneyPosition(
  branchId: string,
  from: string,
  to: string,
): Promise<MoneyPositionView> {
  const supabase = createAdminClient();
  const [{ data: baselineRow }, { data: costRows }] = await Promise.all([
    supabase
      .from('branch_money_positions')
      .select('as_of_date, cash_amount, account_amount, notes, created_at, updated_at')
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

  const baseline = baselineRow
    ? {
        asOfDate: baselineRow.as_of_date,
        cash: Number(baselineRow.cash_amount),
        account: Number(baselineRow.account_amount),
        notes: baselineRow.notes,
      }
    : null;
  const countedAt = baselineRow?.updated_at || baselineRow?.created_at || null;

  const costs: OperatingCostPocketInput[] = (costRows ?? []).map((row) => ({
    costType: row.cost_type,
    period: row.period,
    amount: Number(row.amount),
    chargeDay: row.charge_day ?? 1,
    paidFrom: parseMoneyPocket(row.paid_from, 'account'),
    terms: row.terms ?? [],
  }));

  const recordedStart = baseline ? baseline.asOfDate : from;
  const costStart = baseline ? addMexicoDays(baseline.asOfDate, 1) : from;
  const flows = emptyFlows();
  const ticketFlows = emptyFlows();
  const inRange = (ymd: string) => ymd >= from && ymd <= to;
  const affects = (ymd: string, recordedAt?: string | null) => {
    if (!baseline) return inRange(ymd);
    if (ymd > baseline.asOfDate && ymd <= to) return true;
    return ymd === baseline.asOfDate && isRecordedAfterCount(recordedAt, countedAt);
  };

  let orderCount = 0;

  if (recordedStart <= to) {
    const saleStart = mexicoYmdBoundsIso(recordedStart).start;
    const saleEnd = mexicoYmdBoundsIso(to).end;

    const [orders, purchases, expenses, incomes, transferRows] = await Promise.all([
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('orders')
          .select(
            'paid_at, created_at, status, payment_status, payment_method, payment_splits, subtotal, discount_amount, delivery_fee',
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
          .select('purchased_at, created_at, total_amount, paid_from')
          .eq('branch_id', branchId)
          .gte('purchased_at', recordedStart)
          .lte('purchased_at', to)
          .range(rangeFrom, rangeTo),
      ),
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('expenses')
          .select('expense_date, created_at, amount, paid_from')
          .eq('branch_id', branchId)
          .gte('expense_date', recordedStart)
          .lte('expense_date', to)
          .range(rangeFrom, rangeTo),
      ),
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('income_entries')
          .select('entry_date, created_at, entry_type, amount, paid_from')
          .eq('branch_id', branchId)
          .gte('entry_date', recordedStart)
          .lte('entry_date', to)
          .range(rangeFrom, rangeTo),
      ),
      fetchPaged<{
        withdrawal_date: string;
        created_at: string;
        amount: number;
        destination: string | null;
      }>((rangeFrom, rangeTo) =>
        // Table is not in generated types yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('cash_withdrawals')
          .select('withdrawal_date, created_at, amount, destination')
          .eq('branch_id', branchId)
          .gte('withdrawal_date', recordedStart)
          .lte('withdrawal_date', to)
          .range(rangeFrom, rangeTo),
      ),
    ]);

    for (const order of orders) {
      const ymd = moneyLedgerRowYmd(order.paid_at);
      if (!affects(ymd, order.created_at)) continue;
      const ticket = emptyFlows();
      addCollectedTicket(ticket, order);
      addSelectedPockets(flows, ticket, { cash: true, account: true });
      addCollectedTicket(ticketFlows, order);
      orderCount += 1;
    }

    for (const row of purchases) {
      const ymd = moneyLedgerRowYmd(row.purchased_at);
      if (!affects(ymd, row.created_at)) continue;
      const purchase = emptyFlows();
      addPocketOutflow(purchase, parseMoneyPocket(row.paid_from), Number(row.total_amount ?? 0));
      addSelectedPockets(flows, purchase, { cash: true, account: true });
    }

    for (const row of expenses) {
      const ymd = moneyLedgerRowYmd(row.expense_date);
      if (!affects(ymd, row.created_at)) continue;
      const expense = emptyFlows();
      addPocketOutflow(expense, parseMoneyPocket(row.paid_from), Number(row.amount ?? 0));
      addSelectedPockets(flows, expense, { cash: true, account: true });
    }

    for (const row of incomes) {
      const ymd = moneyLedgerRowYmd(row.entry_date);
      if (!affects(ymd, row.created_at)) continue;
      const income = emptyFlows();
      addPocketInflow(
        income,
        parseIncomePocket(row.paid_from, row.entry_type),
        Number(row.amount ?? 0),
      );
      addSelectedPockets(flows, income, { cash: true, account: true });
    }

    for (const row of transferRows) {
      const ymd = moneyLedgerRowYmd(row.withdrawal_date);
      if (!affects(ymd, row.created_at)) continue;
      const transfer = emptyFlows();
      const amount = Number(row.amount ?? 0);
      if (parseMoneyPocket(row.destination, 'account') === 'cash') {
        transfer.accountOut += amount;
        transfer.cashIn += amount;
      } else {
        transfer.cashOut += amount;
        transfer.accountIn += amount;
      }
      addSelectedPockets(flows, transfer, { cash: true, account: true });
    }

    if (costStart <= to) {
      applyOperatingCostsToPockets(flows, costs, {
        from: costStart,
        to,
        dayBeforeFrom: addMexicoDays(costStart, -1),
        orderCount,
        mode: 'outflow',
      });
    }
  }

  const roundedFlows = {
    cashIn: roundMoney(flows.cashIn),
    accountIn: roundMoney(flows.accountIn),
    cashOut: roundMoney(flows.cashOut),
    accountOut: roundMoney(flows.accountOut),
  };
  const cash = roundMoney((baseline?.cash ?? 0) + roundedFlows.cashIn - roundedFlows.cashOut);
  const account = roundMoney((baseline?.account ?? 0) + roundedFlows.accountIn - roundedFlows.accountOut);
  const ticketInCash = roundMoney(ticketFlows.cashIn);
  const ticketInAccount = roundMoney(ticketFlows.accountIn);

  return {
    cash,
    account,
    source: baseline ? 'projected' : 'period',
    snapshotAsOf: baseline?.asOfDate ?? null,
    asOfDate: to,
    notes: baseline && baseline.asOfDate >= to ? (baseline.notes ?? null) : null,
    openingTotal: baseline ? roundMoney(baseline.cash + baseline.account) : 0,
    openingAsOf: baseline?.asOfDate ?? null,
    periodIn: roundMoney(roundedFlows.cashIn + roundedFlows.accountIn),
    periodOut: roundMoney(roundedFlows.cashOut + roundedFlows.accountOut),
    ticketIn: roundMoney(ticketInCash + ticketInAccount),
    ticketInCash,
    ticketInAccount,
    pausedIn: 0,
  };
}

export async function fetchMoneyLedger(
  branchId: string,
  from: string,
  to: string,
): Promise<MoneyLedger> {
  const supabase = createAdminClient();
  const saleStart = mexicoYmdBoundsIso(from).start;
  const saleEnd = mexicoYmdBoundsIso(to).end;
  const dayBefore = addMexicoDays(from, -1);

  const [
    openingView,
    { data: positionRows },
    { data: closingRows },
    { data: costRows },
    tickets,
    purchases,
    expenses,
    incomes,
    transfers,
  ] = await Promise.all([
    fetchMoneyPosition(branchId, dayBefore, dayBefore),
    supabase
      .from('branch_money_positions')
      .select('as_of_date, cash_amount, account_amount, created_at, updated_at')
      .eq('branch_id', branchId)
      .gte('as_of_date', from)
      .lte('as_of_date', to)
      .order('as_of_date', { ascending: true }),
    supabase
      .from('daily_cash_closings')
      .select('closing_date, counted_cash')
      .eq('branch_id', branchId)
      .gte('closing_date', from)
      .lte('closing_date', to)
      .order('closing_date', { ascending: true }),
    supabase
      .from('branch_operating_costs')
      .select('name, category, cost_type, period, amount, charge_day, paid_from, terms:branch_operating_cost_terms(start_date, end_date)')
      .eq('branch_id', branchId),
    fetchPaged((rangeFrom, rangeTo) =>
      supabase
        .from('orders')
        .select(
          'paid_at, created_at, status, payment_status, payment_method, payment_splits, subtotal, discount_amount, delivery_fee',
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
        .select('notes, total_amount, paid_from, purchased_at, created_at')
        .eq('branch_id', branchId)
        .gte('purchased_at', from)
        .lte('purchased_at', to)
        .range(rangeFrom, rangeTo),
    ),
    fetchPaged((rangeFrom, rangeTo) =>
      supabase
        .from('expenses')
        .select('concept, amount, paid_from, expense_date, created_at')
        .eq('branch_id', branchId)
        .gte('expense_date', from)
        .lte('expense_date', to)
        .range(rangeFrom, rangeTo),
    ),
    fetchPaged((rangeFrom, rangeTo) =>
      supabase
        .from('income_entries')
        .select('entry_type, concept, amount, paid_from, entry_date, created_at')
        .eq('branch_id', branchId)
        .gte('entry_date', from)
        .lte('entry_date', to)
        .range(rangeFrom, rangeTo),
    ),
    fetchPaged<{
      amount: number;
      destination: string | null;
      notes: string | null;
      withdrawal_date: string;
      created_at: string;
    }>(
      (rangeFrom, rangeTo) =>
        // Table is not in generated types yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('cash_withdrawals')
          .select('amount, destination, notes, withdrawal_date, created_at')
          .eq('branch_id', branchId)
          .gte('withdrawal_date', from)
          .lte('withdrawal_date', to)
          .range(rangeFrom, rangeTo),
    ),
  ]);

  const opening = openingView.snapshotAsOf
    ? {
        asOfDate: dayBefore,
        cash: openingView.cash,
        account: openingView.account,
      }
    : null;
  const counts = new Map<
    string,
    {
      asOfDate: string;
      cash: number;
      account: number;
      countedCash: number | null;
      countedAt?: string;
      resetsBalance: boolean;
    }
  >();
  for (const row of positionRows ?? []) {
    counts.set(row.as_of_date, {
      asOfDate: row.as_of_date,
      cash: Number(row.cash_amount),
      account: Number(row.account_amount),
      countedCash: Number(row.cash_amount),
      countedAt: row.updated_at || row.created_at,
      resetsBalance: true,
    });
  }
  for (const row of closingRows ?? []) {
    const countedCash = row.counted_cash == null ? null : Number(row.counted_cash);
    const existing = counts.get(row.closing_date);
    if (existing) {
      if (countedCash != null) existing.countedCash = countedCash;
      continue;
    }
    counts.set(row.closing_date, {
      asOfDate: row.closing_date,
      cash: countedCash ?? 0,
      account: 0,
      countedCash,
      resetsBalance: false,
    });
  }

  const costs: OperatingCostPocketInput[] = (costRows ?? []).map((row) => ({
    name: row.name,
    category: row.category,
    costType: row.cost_type,
    period: row.period,
    amount: Number(row.amount),
    chargeDay: row.charge_day ?? 1,
    paidFrom: parseMoneyPocket(row.paid_from, 'account'),
    terms: row.terms ?? [],
  }));

  return buildMoneyLedger({
    from,
    to,
    opening,
    counts: [...counts.values()],
    tickets: tickets.map((row) => ({
      ymd: moneyLedgerRowYmd(row.paid_at),
      recordedAt: row.created_at,
      status: row.status,
      payment_status: row.payment_status,
      payment_method: row.payment_method,
      payment_splits: row.payment_splits,
      subtotal: row.subtotal,
      discount_amount: row.discount_amount,
      delivery_fee: row.delivery_fee,
    })),
    purchases: purchases.map((row) => ({
      ymd: moneyLedgerRowYmd(row.purchased_at),
      recordedAt: row.created_at,
      amount: Number(row.total_amount ?? 0),
      paidFrom: row.paid_from,
      label: row.notes,
    })),
    expenses: expenses.map((row) => ({
      ymd: moneyLedgerRowYmd(row.expense_date),
      recordedAt: row.created_at,
      amount: Number(row.amount ?? 0),
      paidFrom: row.paid_from,
      label: row.concept,
    })),
    incomes: incomes.map((row) => ({
      ymd: moneyLedgerRowYmd(row.entry_date),
      recordedAt: row.created_at,
      amount: Number(row.amount ?? 0),
      paidFrom: row.paid_from,
      entryType: isIncomeEntryType(row.entry_type) ? row.entry_type : 'operating',
      label: row.concept,
    })),
    transfers: transfers.map((row) => ({
      ymd: moneyLedgerRowYmd(row.withdrawal_date),
      recordedAt: row.created_at,
      amount: Number(row.amount ?? 0),
      destination: row.destination,
      label: row.notes,
    })),
    costs,
  });
}
