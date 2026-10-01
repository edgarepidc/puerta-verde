import {
  addCollectedTicket,
  addPocketInflow,
  addPocketOutflow,
  applyCashPocketTransfer,
  applyOperatingCostsToPockets,
  buildMoneyLedger,
  isIncomeEntryType,
  moneyLedgerRowYmd,
  parseIncomePocket,
  parseMoneyPocket,
  pocketTotal,
  resolveMoneyPosition,
  roundMoney,
  validateMoneyPositionInput,
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
  let transfers: Array<{ amount: number; destination: string | null }> = [];

  if (!closesThisPeriod && movementStart <= to) {
    const saleStart = mexicoYmdBoundsIso(movementStart).start;
    const saleEnd = mexicoYmdBoundsIso(to).end;

    const [orders, purchases, expenses, incomes, transferRows] = await Promise.all([
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('orders')
          .select(
            'status, payment_status, payment_method, payment_splits, subtotal, discount_amount, delivery_fee, total',
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
          .select('entry_type, amount, paid_from')
          .eq('branch_id', branchId)
          .gte('entry_date', movementStart)
          .lte('entry_date', to)
          .range(rangeFrom, rangeTo),
      ),
      fetchPaged<{ amount: number; destination: string | null }>((rangeFrom, rangeTo) =>
        // Table is not in generated types yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('cash_withdrawals')
          .select('amount, destination')
          .eq('branch_id', branchId)
          .gte('withdrawal_date', movementStart)
          .lte('withdrawal_date', to)
          .range(rangeFrom, rangeTo),
      ),
    ]);
    transfers = transferRows;

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
      addPocketInflow(
        flows,
        parseIncomePocket(row.paid_from, row.entry_type),
        Number(row.amount ?? 0),
      );
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

  const pockets = { cash: resolved.cash, account: resolved.account };
  for (const row of transfers) {
    applyCashPocketTransfer(
      pockets,
      parseMoneyPocket(row.destination, 'account'),
      Number(row.amount ?? 0),
    );
  }

  const ticketInCash = roundMoney(ticketFlows.cashIn);
  const ticketInAccount = roundMoney(ticketFlows.accountIn);

  return {
    ...resolved,
    cash: pockets.cash,
    account: pockets.account,
    asOfDate: to,
    notes: snapshot && snapshot.asOfDate >= to ? (snapshotRow?.notes ?? null) : null,
    openingTotal: snapshot ? pocketTotal(snapshot) : 0,
    openingAsOf: snapshot?.asOfDate ?? null,
    periodIn: roundMoney(roundedFlows.cashIn + roundedFlows.accountIn),
    periodOut: roundMoney(roundedFlows.cashOut + roundedFlows.accountOut),
    ticketIn: roundMoney(ticketInCash + ticketInAccount),
    ticketInCash,
    ticketInAccount,
    pausedIn: 0,
  };
}

export async function saveMoneyPositionSnapshot(input: {
  branchId: string;
  cashAmount: number;
  accountAmount: number;
  asOfDate: string;
  notes?: string | null;
  userId: string | null;
}): Promise<MoneyPositionView> {
  const validationError = validateMoneyPositionInput({
    cashAmount: input.cashAmount,
    accountAmount: input.accountAmount,
    asOfDate: input.asOfDate,
    notes: input.notes ?? null,
  });
  if (validationError) throw new Error(validationError);

  const supabase = createAdminClient();
  const { error } = await supabase.from('branch_money_positions').upsert(
    {
      branch_id: input.branchId,
      as_of_date: input.asOfDate,
      cash_amount: input.cashAmount,
      account_amount: input.accountAmount,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      created_by: input.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'branch_id,as_of_date' },
  );
  if (error) throw new Error(error.message);

  return fetchMoneyPosition(input.branchId, input.asOfDate, input.asOfDate);
}

/** Closing caja writes Tienes cash so efectivo and cuenta stay one book. */
export async function syncTienesFromCashClose(input: {
  branchId: string;
  closingDate: string;
  countedCash: number;
  userId: string | null;
}): Promise<MoneyPositionView> {
  const current = await fetchMoneyPosition(input.branchId, input.closingDate, input.closingDate);
  return saveMoneyPositionSnapshot({
    branchId: input.branchId,
    cashAmount: input.countedCash,
    accountAmount: current.account,
    asOfDate: input.closingDate,
    notes: current.notes?.trim() || 'Cierre de caja',
    userId: input.userId,
  });
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
    { data: countRows },
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
      .select('as_of_date, cash_amount, account_amount')
      .eq('branch_id', branchId)
      .gte('as_of_date', from)
      .lte('as_of_date', to)
      .order('as_of_date', { ascending: true }),
    supabase
      .from('branch_operating_costs')
      .select('cost_type, period, amount, charge_day, paid_from, terms:branch_operating_cost_terms(start_date, end_date)')
      .eq('branch_id', branchId),
    fetchPaged((rangeFrom, rangeTo) =>
      supabase
        .from('orders')
        .select(
          'paid_at, status, payment_status, payment_method, payment_splits, subtotal, discount_amount, delivery_fee',
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
        .select('total_amount, paid_from, purchased_at')
        .eq('branch_id', branchId)
        .gte('purchased_at', from)
        .lte('purchased_at', to)
        .range(rangeFrom, rangeTo),
    ),
    fetchPaged((rangeFrom, rangeTo) =>
      supabase
        .from('expenses')
        .select('amount, paid_from, expense_date')
        .eq('branch_id', branchId)
        .gte('expense_date', from)
        .lte('expense_date', to)
        .range(rangeFrom, rangeTo),
    ),
    fetchPaged((rangeFrom, rangeTo) =>
      supabase
        .from('income_entries')
        .select('entry_type, amount, paid_from, entry_date')
        .eq('branch_id', branchId)
        .gte('entry_date', from)
        .lte('entry_date', to)
        .range(rangeFrom, rangeTo),
    ),
    fetchPaged<{ amount: number; destination: string | null; withdrawal_date: string }>(
      (rangeFrom, rangeTo) =>
        // Table is not in generated types yet.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('cash_withdrawals')
          .select('amount, destination, withdrawal_date')
          .eq('branch_id', branchId)
          .gte('withdrawal_date', from)
          .lte('withdrawal_date', to)
          .range(rangeFrom, rangeTo),
    ),
  ]);

  const opening = openingView.openingAsOf
    ? {
        asOfDate: openingView.openingAsOf,
        cash: openingView.cash,
        account: openingView.account,
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

  return buildMoneyLedger({
    from,
    to,
    opening,
    counts: (countRows ?? []).map((row) => ({
      asOfDate: row.as_of_date,
      cash: Number(row.cash_amount),
      account: Number(row.account_amount),
    })),
    tickets: tickets.map((row) => ({
      ymd: moneyLedgerRowYmd(row.paid_at),
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
      amount: Number(row.total_amount ?? 0),
      paidFrom: row.paid_from,
    })),
    expenses: expenses.map((row) => ({
      ymd: moneyLedgerRowYmd(row.expense_date),
      amount: Number(row.amount ?? 0),
      paidFrom: row.paid_from,
    })),
    incomes: incomes.map((row) => ({
      ymd: moneyLedgerRowYmd(row.entry_date),
      amount: Number(row.amount ?? 0),
      paidFrom: row.paid_from,
      entryType: isIncomeEntryType(row.entry_type) ? row.entry_type : 'operating',
    })),
    transfers: transfers.map((row) => ({
      ymd: moneyLedgerRowYmd(row.withdrawal_date),
      amount: Number(row.amount ?? 0),
      destination: row.destination,
    })),
    costs,
  });
}
