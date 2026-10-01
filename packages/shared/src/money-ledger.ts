import { mexicoYmdFromIso } from './order-status';
import { roundMoney } from './market-prices';
import { parseIncomePocket } from './income-entries';
import {
  applyOperatingCostsToPockets,
  type OperatingCostPocketInput,
} from './profitability';
import { parsePaymentSplits } from './payment-splits';
import {
  isCollectedTicket,
  parseMoneyPocket,
  ticketCollectedAmount,
  ticketMoneyPocket,
  type MoneyPositionSnapshot,
} from './money-position';

export interface MoneyDayRow {
  ymd: string;
  cashSales: number;
  cardSales: number;
  transferSales: number;
  onlineSales: number;
  otherInCash: number;
  otherInAccount: number;
  purchasesCash: number;
  purchasesAccount: number;
  expensesCash: number;
  expensesAccount: number;
  toAccount: number;
  toCash: number;
  netCash: number;
  netAccount: number;
  runningCash: number | null;
  runningAccount: number | null;
  counted: boolean;
}

export interface MoneyLedgerTotals {
  cashSales: number;
  cardSales: number;
  transferSales: number;
  onlineSales: number;
  otherInCash: number;
  otherInAccount: number;
  purchasesCash: number;
  purchasesAccount: number;
  expensesCash: number;
  expensesAccount: number;
  toAccount: number;
  toCash: number;
  netCash: number;
  netAccount: number;
}

export interface MoneyLedger {
  from: string;
  to: string;
  openingCash: number;
  openingAccount: number;
  openingAsOf: string | null;
  pausedCash: number;
  pausedAccount: number;
  days: MoneyDayRow[];
  totals: MoneyLedgerTotals;
  closingCash: number;
  closingAccount: number;
}

export interface MoneyLedgerTicket {
  ymd: string;
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_splits?: unknown;
  subtotal?: number | null;
  discount_amount?: number | null;
  delivery_fee?: number | null;
}

export interface MoneyLedgerPocketRow {
  ymd: string;
  amount: number;
  paidFrom?: string | null;
}

export interface MoneyLedgerIncomeRow {
  ymd: string;
  amount: number;
  paidFrom?: string | null;
  entryType: 'contribution' | 'operating';
}

export interface MoneyLedgerTransferRow {
  ymd: string;
  amount: number;
  destination?: string | null;
}

export interface MoneyLedgerCount extends MoneyPositionSnapshot {
  pausedCash?: number;
  pausedAccount?: number;
}

export function eachInclusiveYmd(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const days: string[] = [];
  const [year, month, day] = from.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  while (true) {
    const ymd = cursor.toISOString().slice(0, 10);
    if (ymd > to) break;
    days.push(ymd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function emptyMoneyDay(ymd: string): MoneyDayRow {
  return {
    ymd,
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    onlineSales: 0,
    otherInCash: 0,
    otherInAccount: 0,
    purchasesCash: 0,
    purchasesAccount: 0,
    expensesCash: 0,
    expensesAccount: 0,
    toAccount: 0,
    toCash: 0,
    netCash: 0,
    netAccount: 0,
    runningCash: null,
    runningAccount: null,
    counted: false,
  };
}

export function moneyDayHasActivity(day: MoneyDayRow): boolean {
  return (
    day.counted ||
    day.cashSales > 0 ||
    day.cardSales > 0 ||
    day.transferSales > 0 ||
    day.onlineSales > 0 ||
    day.otherInCash > 0 ||
    day.otherInAccount > 0 ||
    day.purchasesCash > 0 ||
    day.purchasesAccount > 0 ||
    day.expensesCash > 0 ||
    day.expensesAccount > 0 ||
    day.toAccount > 0 ||
    day.toCash > 0
  );
}

export function addCollectedTicketMethods(
  day: Pick<MoneyDayRow, 'cashSales' | 'cardSales' | 'transferSales' | 'onlineSales'>,
  order: MoneyLedgerTicket,
): void {
  if (!isCollectedTicket(order)) return;
  const splits = parsePaymentSplits(order.payment_splits);
  if (splits.length >= 2) {
    for (const split of splits) {
      addSaleMethod(day, split.method, split.amount);
    }
    return;
  }
  addSaleMethod(day, order.payment_method, ticketCollectedAmount(order));
}

export function applyMoneyDayNets(day: MoneyDayRow): void {
  const cashIn = day.cashSales + day.otherInCash + day.toCash;
  const cashOut = day.purchasesCash + day.expensesCash + day.toAccount;
  const accountIn =
    day.cardSales + day.transferSales + day.onlineSales + day.otherInAccount + day.toAccount;
  const accountOut = day.purchasesAccount + day.expensesAccount + day.toCash;
  day.netCash = roundMoney(cashIn - cashOut);
  day.netAccount = roundMoney(accountIn - accountOut);
}

export function moneyLedgerRowYmd(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return mexicoYmdFromIso(raw);
}

export function buildMoneyLedger(input: {
  from: string;
  to: string;
  opening: MoneyPositionSnapshot | null;
  counts?: MoneyLedgerCount[];
  pausedCash?: number;
  pausedAccount?: number;
  tickets: MoneyLedgerTicket[];
  purchases: MoneyLedgerPocketRow[];
  expenses: MoneyLedgerPocketRow[];
  incomes: MoneyLedgerIncomeRow[];
  transfers: MoneyLedgerTransferRow[];
  costs?: OperatingCostPocketInput[];
}): MoneyLedger {
  const days = new Map<string, MoneyDayRow>();
  for (const ymd of eachInclusiveYmd(input.from, input.to)) {
    days.set(ymd, emptyMoneyDay(ymd));
  }

  const ensureDay = (ymd: string) => {
    if (ymd < input.from || ymd > input.to) return null;
    let day = days.get(ymd);
    if (!day) {
      day = emptyMoneyDay(ymd);
      days.set(ymd, day);
    }
    return day;
  };

  const orderCountByDay = new Map<string, number>();
  for (const ticket of input.tickets) {
    const ymd = ticket.ymd;
    const day = ensureDay(ymd);
    if (!day) continue;
    if (!isCollectedTicket(ticket)) continue;
    addCollectedTicketMethods(day, ticket);
    orderCountByDay.set(ymd, (orderCountByDay.get(ymd) ?? 0) + 1);
  }

  for (const row of input.purchases) {
    const day = ensureDay(row.ymd);
    if (!day) continue;
    const amount = Number(row.amount ?? 0);
    if (!(amount > 0)) continue;
    if (parseMoneyPocket(row.paidFrom) === 'account') day.purchasesAccount += amount;
    else day.purchasesCash += amount;
  }

  for (const row of input.expenses) {
    const day = ensureDay(row.ymd);
    if (!day) continue;
    const amount = Number(row.amount ?? 0);
    if (!(amount > 0)) continue;
    if (parseMoneyPocket(row.paidFrom) === 'account') day.expensesAccount += amount;
    else day.expensesCash += amount;
  }

  for (const row of input.incomes) {
    const day = ensureDay(row.ymd);
    if (!day) continue;
    const amount = Number(row.amount ?? 0);
    if (!(amount > 0)) continue;
    const pocket = parseIncomePocket(row.paidFrom, row.entryType);
    if (pocket === 'account') day.otherInAccount += amount;
    else day.otherInCash += amount;
  }

  for (const row of input.transfers) {
    const day = ensureDay(row.ymd);
    if (!day) continue;
    const amount = Number(row.amount ?? 0);
    if (!(amount > 0)) continue;
    if (parseMoneyPocket(row.destination, 'account') === 'cash') day.toCash += amount;
    else day.toAccount += amount;
  }

  if (input.costs?.length) {
    for (const ymd of days.keys()) {
      const flows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
      applyOperatingCostsToPockets(flows, input.costs, {
        from: ymd,
        to: ymd,
        dayBeforeFrom: previousYmd(ymd),
        orderCount: orderCountByDay.get(ymd) ?? 0,
        mode: 'outflow',
      });
      const day = days.get(ymd);
      if (!day) continue;
      day.expensesCash += flows.cashOut;
      day.expensesAccount += flows.accountOut;
    }
  }

  const countByDay = new Map<string, MoneyLedgerCount>();
  for (const count of input.counts ?? []) {
    if (count.asOfDate >= input.from && count.asOfDate <= input.to) {
      countByDay.set(count.asOfDate, count);
    }
  }

  const openingCash = roundMoney(input.opening?.cash ?? 0);
  const openingAccount = roundMoney(input.opening?.account ?? 0);
  const pausedCash = roundMoney(input.pausedCash ?? 0);
  const pausedAccount = roundMoney(input.pausedAccount ?? 0);

  let tracking = Boolean(input.opening) || !countByDay.size;
  let cash = roundMoney(openingCash + pausedCash);
  let account = roundMoney(openingAccount + pausedAccount);
  let pendingPausedCash = 0;
  let pendingPausedAccount = 0;

  const orderedDays = [...days.values()].sort((a, b) => a.ymd.localeCompare(b.ymd));
  for (const day of orderedDays) {
    applyMoneyDayNets(day);
    if (tracking && (pendingPausedCash || pendingPausedAccount)) {
      cash = roundMoney(cash + pendingPausedCash);
      account = roundMoney(account + pendingPausedAccount);
      pendingPausedCash = 0;
      pendingPausedAccount = 0;
    }
    const count = countByDay.get(day.ymd);
    if (count) {
      day.counted = true;
      cash = roundMoney(count.cash);
      account = roundMoney(count.account);
      tracking = true;
      pendingPausedCash = count.asOfDate < input.to ? roundMoney(count.pausedCash ?? 0) : 0;
      pendingPausedAccount = count.asOfDate < input.to ? roundMoney(count.pausedAccount ?? 0) : 0;
      day.runningCash = cash;
      day.runningAccount = account;
      continue;
    }

    if (!tracking) {
      day.runningCash = null;
      day.runningAccount = null;
      continue;
    }

    cash = roundMoney(cash + day.netCash);
    account = roundMoney(account + day.netAccount);
    day.runningCash = cash;
    day.runningAccount = account;
  }

  const totals = emptyTotals();
  for (const day of orderedDays) {
    totals.cashSales += day.cashSales;
    totals.cardSales += day.cardSales;
    totals.transferSales += day.transferSales;
    totals.onlineSales += day.onlineSales;
    totals.otherInCash += day.otherInCash;
    totals.otherInAccount += day.otherInAccount;
    totals.purchasesCash += day.purchasesCash;
    totals.purchasesAccount += day.purchasesAccount;
    totals.expensesCash += day.expensesCash;
    totals.expensesAccount += day.expensesAccount;
    totals.toAccount += day.toAccount;
    totals.toCash += day.toCash;
    totals.netCash += day.netCash;
    totals.netAccount += day.netAccount;
  }

  return {
    from: input.from,
    to: input.to,
    openingCash,
    openingAccount,
    openingAsOf: input.opening?.asOfDate ?? null,
    pausedCash,
    pausedAccount,
    days: orderedDays,
    totals: roundTotals(totals),
    closingCash: cash,
    closingAccount: account,
  };
}

export function alignLedgerClosing(
  ledger: MoneyLedger,
  position: { cash: number; account: number },
): MoneyLedger {
  const days = ledger.days.map((day, index) =>
    index === ledger.days.length - 1
      ? { ...day, runningCash: position.cash, runningAccount: position.account }
      : day,
  );
  return {
    ...ledger,
    days,
    closingCash: roundMoney(position.cash),
    closingAccount: roundMoney(position.account),
  };
}

function addSaleMethod(
  day: Pick<MoneyDayRow, 'cashSales' | 'cardSales' | 'transferSales' | 'onlineSales'>,
  method: string | null | undefined,
  amount: number,
): void {
  if (!(amount > 0)) return;
  if (method === 'card_terminal') {
    day.cardSales += amount;
    return;
  }
  if (method === 'transfer') {
    day.transferSales += amount;
    return;
  }
  if (method === 'online') {
    day.onlineSales += amount;
    return;
  }
  if (ticketMoneyPocket(method) === 'account') {
    day.cardSales += amount;
    return;
  }
  day.cashSales += amount;
}

function previousYmd(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day - 1));
  return cursor.toISOString().slice(0, 10);
}

function emptyTotals(): MoneyLedgerTotals {
  return {
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    onlineSales: 0,
    otherInCash: 0,
    otherInAccount: 0,
    purchasesCash: 0,
    purchasesAccount: 0,
    expensesCash: 0,
    expensesAccount: 0,
    toAccount: 0,
    toCash: 0,
    netCash: 0,
    netAccount: 0,
  };
}

function roundTotals(totals: MoneyLedgerTotals): MoneyLedgerTotals {
  return {
    cashSales: roundMoney(totals.cashSales),
    cardSales: roundMoney(totals.cardSales),
    transferSales: roundMoney(totals.transferSales),
    onlineSales: roundMoney(totals.onlineSales),
    otherInCash: roundMoney(totals.otherInCash),
    otherInAccount: roundMoney(totals.otherInAccount),
    purchasesCash: roundMoney(totals.purchasesCash),
    purchasesAccount: roundMoney(totals.purchasesAccount),
    expensesCash: roundMoney(totals.expensesCash),
    expensesAccount: roundMoney(totals.expensesAccount),
    toAccount: roundMoney(totals.toAccount),
    toCash: roundMoney(totals.toCash),
    netCash: roundMoney(totals.netCash),
    netAccount: roundMoney(totals.netAccount),
  };
}
