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
  pocketTotal,
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
  const [{ data: snapshotRow }, { data: baselineRow }, { data: costRows }] = await Promise.all([
    supabase
      .from('branch_money_positions')
      .select('as_of_date, cash_amount, account_amount, notes, created_at, updated_at')
      .eq('branch_id', branchId)
      .lte('as_of_date', to)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('branch_money_positions')
      .select('as_of_date, account_amount')
      .eq('branch_id', branchId)
      .lte('as_of_date', to)
      .order('as_of_date', { ascending: true })
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

  const accountBaseline = baselineRow
    ? {
        asOfDate: baselineRow.as_of_date,
        account: Number(baselineRow.account_amount),
      }
    : null;
  const cashStart = snapshot ? addMexicoDays(snapshot.asOfDate, 1) : from;
  const accountStart = accountBaseline ? addMexicoDays(accountBaseline.asOfDate, 1) : from;
  const movementStart = cashStart < accountStart ? cashStart : accountStart;
  const countedAt = snapshotRow?.updated_at || snapshotRow?.created_at || null;

  const flows = emptyFlows();
  const ticketFlows = emptyFlows();
  const inRange = (ymd: string) => ymd >= from && ymd <= to;
  const affectsCash = (ymd: string, recordedAt?: string | null) => {
    if (!snapshot) return inRange(ymd);
    if (ymd > snapshot.asOfDate && ymd <= to) return true;
    return ymd === snapshot.asOfDate && isRecordedAfterCount(recordedAt, countedAt);
  };
  const affectsAccount = (ymd: string) => {
    if (!accountBaseline) return inRange(ymd);
    return ymd > accountBaseline.asOfDate && ymd <= to;
  };

  let cashOrderCount = 0;
  let accountOrderCount = 0;

  if (movementStart <= to) {
    const saleStart = mexicoYmdBoundsIso(movementStart).start;
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
          .gte('purchased_at', movementStart)
          .lte('purchased_at', to)
          .range(rangeFrom, rangeTo),
      ),
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('expenses')
          .select('expense_date, created_at, amount, paid_from')
          .eq('branch_id', branchId)
          .gte('expense_date', movementStart)
          .lte('expense_date', to)
          .range(rangeFrom, rangeTo),
      ),
      fetchPaged((rangeFrom, rangeTo) =>
        supabase
          .from('income_entries')
          .select('entry_date, created_at, entry_type, amount, paid_from')
          .eq('branch_id', branchId)
          .gte('entry_date', movementStart)
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
          .gte('withdrawal_date', movementStart)
          .lte('withdrawal_date', to)
          .range(rangeFrom, rangeTo),
      ),
    ]);

    for (const order of orders) {
      const ymd = moneyLedgerRowYmd(order.paid_at);
      const sides = { cash: affectsCash(ymd, order.created_at), account: affectsAccount(ymd) };
      if (!sides.cash && !sides.account) continue;
      const ticket = emptyFlows();
      addCollectedTicket(ticket, order);
      addSelectedPockets(flows, ticket, sides);
      if (!snapshot || ymd > snapshot.asOfDate || isRecordedAfterCount(order.created_at, countedAt)) {
        addCollectedTicket(ticketFlows, order);
      }
      if (sides.cash && (!snapshot || ymd > snapshot.asOfDate)) cashOrderCount += 1;
      if (sides.account) accountOrderCount += 1;
    }

    for (const row of purchases) {
      const ymd = moneyLedgerRowYmd(row.purchased_at);
      const sides = { cash: affectsCash(ymd, row.created_at), account: affectsAccount(ymd) };
      if (!sides.cash && !sides.account) continue;
      const purchase = emptyFlows();
      addPocketOutflow(purchase, parseMoneyPocket(row.paid_from), Number(row.total_amount ?? 0));
      addSelectedPockets(flows, purchase, sides);
    }

    for (const row of expenses) {
      const ymd = moneyLedgerRowYmd(row.expense_date);
      const sides = { cash: affectsCash(ymd, row.created_at), account: affectsAccount(ymd) };
      if (!sides.cash && !sides.account) continue;
      const expense = emptyFlows();
      addPocketOutflow(expense, parseMoneyPocket(row.paid_from), Number(row.amount ?? 0));
      addSelectedPockets(flows, expense, sides);
    }

    for (const row of incomes) {
      const ymd = moneyLedgerRowYmd(row.entry_date);
      const sides = { cash: affectsCash(ymd, row.created_at), account: affectsAccount(ymd) };
      if (!sides.cash && !sides.account) continue;
      const income = emptyFlows();
      addPocketInflow(
        income,
        parseIncomePocket(row.paid_from, row.entry_type),
        Number(row.amount ?? 0),
      );
      addSelectedPockets(flows, income, sides);
    }

    for (const row of transferRows) {
      const ymd = moneyLedgerRowYmd(row.withdrawal_date);
      const sides = { cash: affectsCash(ymd, row.created_at), account: affectsAccount(ymd) };
      if (!sides.cash && !sides.account) continue;
      const transfer = emptyFlows();
      const amount = Number(row.amount ?? 0);
      if (parseMoneyPocket(row.destination, 'account') === 'cash') {
        transfer.accountOut += amount;
        transfer.cashIn += amount;
      } else {
        transfer.cashOut += amount;
        transfer.accountIn += amount;
      }
      addSelectedPockets(flows, transfer, sides);
    }

    if (accountStart <= to) {
      const accountCosts = emptyFlows();
      applyOperatingCostsToPockets(accountCosts, costs, {
        from: accountStart,
        to,
        dayBeforeFrom: addMexicoDays(accountStart, -1),
        orderCount: accountOrderCount,
        mode: 'outflow',
      });
      addSelectedPockets(flows, accountCosts, { cash: false, account: true });
    }
    if (cashStart <= to) {
      const cashCosts = emptyFlows();
      applyOperatingCostsToPockets(cashCosts, costs, {
        from: cashStart,
        to,
        dayBeforeFrom: addMexicoDays(cashStart, -1),
        orderCount: cashOrderCount,
        mode: 'outflow',
      });
      addSelectedPockets(flows, cashCosts, { cash: true, account: false });
    }
  }

  const roundedFlows = {
    cashIn: roundMoney(flows.cashIn),
    accountIn: roundMoney(flows.accountIn),
    cashOut: roundMoney(flows.cashOut),
    accountOut: roundMoney(flows.accountOut),
  };
  const cash = roundMoney((snapshot?.cash ?? 0) + roundedFlows.cashIn - roundedFlows.cashOut);
  const account = roundMoney(
    (accountBaseline?.account ?? 0) + roundedFlows.accountIn - roundedFlows.accountOut,
  );
  const ticketInCash = roundMoney(ticketFlows.cashIn);
  const ticketInAccount = roundMoney(ticketFlows.accountIn);

  return {
    cash,
    account,
    source: snapshot ? 'projected' : 'period',
    snapshotAsOf: snapshot?.asOfDate ?? null,
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
      .select('as_of_date, cash_amount, account_amount, created_at, updated_at')
      .eq('branch_id', branchId)
      .gte('as_of_date', from)
      .lte('as_of_date', to)
      .order('as_of_date', { ascending: true }),
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

  const opening = openingView.openingAsOf
    ? {
        asOfDate: openingView.openingAsOf,
        cash: openingView.cash,
        account: openingView.account,
      }
    : null;

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
    counts: (countRows ?? []).map((row) => ({
      asOfDate: row.as_of_date,
      cash: Number(row.cash_amount),
      account: Number(row.account_amount),
      countedAt: row.updated_at || row.created_at,
    })),
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
