import { roundMoney } from './market-prices';

export const MONEY_POCKETS = ['cash', 'account'] as const;
export type MoneyPocket = (typeof MONEY_POCKETS)[number];

export const MONEY_POCKET_LABELS: Record<MoneyPocket, string> = {
  cash: 'Efectivo',
  account: 'Cuenta',
};

export function isMoneyPocket(value: unknown): value is MoneyPocket {
  return typeof value === 'string' && (MONEY_POCKETS as readonly string[]).includes(value);
}

export function parseMoneyPocket(value: unknown, fallback: MoneyPocket = 'cash'): MoneyPocket {
  return isMoneyPocket(value) ? value : fallback;
}

export function addPocketOutflow(flows: MoneyPositionFlows, pocket: MoneyPocket, amount: number) {
  if (!(amount > 0)) return;
  if (pocket === 'account') flows.accountOut += amount;
  else flows.cashOut += amount;
}

export function addPocketInflow(flows: MoneyPositionFlows, pocket: MoneyPocket, amount: number) {
  if (!(amount > 0)) return;
  if (pocket === 'account') flows.accountIn += amount;
  else flows.cashIn += amount;
}

export function pocketTotal(position: { cash: number; account: number }): number {
  return roundMoney(position.cash + position.account);
}

export interface MoneyPositionSnapshot {
  asOfDate: string;
  cash: number;
  account: number;
}

export interface MoneyPositionFlows {
  cashIn: number;
  accountIn: number;
  cashOut: number;
  accountOut: number;
}

export type MoneyPositionSource = 'snapshot' | 'projected' | 'period';

export interface MoneyPositionView {
  cash: number;
  account: number;
  source: MoneyPositionSource;
  snapshotAsOf: string | null;
  asOfDate: string;
  notes: string | null;
  /** Last counted total (or 0 if never counted). */
  openingTotal: number;
  openingAsOf: string | null;
  periodIn: number;
  periodOut: number;
  /** Paid tickets (not cancelled / not por pagar) that entered after the conteo. */
  ticketIn: number;
  ticketInCash: number;
  ticketInAccount: number;
}

export function ticketCollectedAmount(order: {
  subtotal?: number | null;
  discount_amount?: number | null;
  delivery_fee?: number | null;
}): number {
  const net = Math.max(Number(order.subtotal ?? 0) - Number(order.discount_amount ?? 0), 0);
  return roundMoney(net + Number(order.delivery_fee ?? 0));
}

/** Pocket that receives a collected ticket, or null when it should not enter caja/cuenta. */
export function ticketMoneyPocket(method: string | null | undefined): MoneyPocket | null {
  if (method === 'on_account') return null;
  if (method === 'card_terminal' || method === 'transfer' || method === 'online') return 'account';
  return 'cash';
}

export function isCollectedTicket(order: {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
}): boolean {
  if (order.status === 'cancelled') return false;
  if (order.payment_status !== 'paid') return false;
  return ticketMoneyPocket(order.payment_method) != null;
}

export function addCollectedTicket(
  flows: MoneyPositionFlows,
  order: {
    status?: string | null;
    payment_status?: string | null;
    payment_method?: string | null;
    subtotal?: number | null;
    discount_amount?: number | null;
    delivery_fee?: number | null;
  },
): void {
  if (!isCollectedTicket(order)) return;
  const pocket = ticketMoneyPocket(order.payment_method);
  if (!pocket) return;
  addPocketInflow(flows, pocket, ticketCollectedAmount(order));
}

export interface MoneyPositionInput {
  cashAmount: number;
  accountAmount: number;
  asOfDate: string;
  notes?: string | null;
}

export function validateMoneyPositionInput(input: MoneyPositionInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate ?? '')) {
    return 'La fecha es inválida.';
  }
  if (!Number.isFinite(input.cashAmount) || input.cashAmount < 0) {
    return 'El efectivo no puede ser negativo.';
  }
  if (!Number.isFinite(input.accountAmount) || input.accountAmount < 0) {
    return 'El saldo en cuenta no puede ser negativo.';
  }
  if ((input.notes ?? '').length > 240) {
    return 'La nota es demasiado larga.';
  }
  return null;
}

export function resolveMoneyPosition(input: {
  snapshot: MoneyPositionSnapshot | null;
  periodEnd: string;
  flows: MoneyPositionFlows;
}): {
  cash: number;
  account: number;
  source: MoneyPositionSource;
  snapshotAsOf: string | null;
} {
  const snapshot = input.snapshot;
  if (snapshot && snapshot.asOfDate >= input.periodEnd) {
    return {
      cash: roundMoney(snapshot.cash),
      account: roundMoney(snapshot.account),
      source: 'snapshot',
      snapshotAsOf: snapshot.asOfDate,
    };
  }

  return {
    cash: roundMoney((snapshot?.cash ?? 0) + input.flows.cashIn - input.flows.cashOut),
    account: roundMoney((snapshot?.account ?? 0) + input.flows.accountIn - input.flows.accountOut),
    source: snapshot ? 'projected' : 'period',
    snapshotAsOf: snapshot?.asOfDate ?? null,
  };
}
