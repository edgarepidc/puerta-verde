import { roundMoney } from './market-prices';

/** Methods that can share a POS ticket (not por pagar / online). */
export const SPLIT_PAYMENT_METHODS = ['cash', 'card_terminal', 'transfer'] as const;
export type SplitPaymentMethod = (typeof SPLIT_PAYMENT_METHODS)[number];

export interface PaymentSplit {
  method: SplitPaymentMethod;
  amount: number;
}

export function isSplitPaymentMethod(value: unknown): value is SplitPaymentMethod {
  return typeof value === 'string' && (SPLIT_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function parsePaymentSplits(value: unknown): PaymentSplit[] {
  if (!Array.isArray(value)) return [];
  const splits: PaymentSplit[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const method = (row as { method?: unknown }).method;
    const amount = Number((row as { amount?: unknown }).amount);
    if (!isSplitPaymentMethod(method) || !Number.isFinite(amount) || amount <= 0) continue;
    splits.push({ method, amount: roundMoney(amount) });
  }
  return splits;
}

export function primaryPaymentMethod(splits: PaymentSplit[]): SplitPaymentMethod | null {
  if (splits.length === 0) return null;
  return [...splits].sort((a, b) => b.amount - a.amount)[0]?.method ?? splits[0].method;
}

export function paymentSplitsSum(splits: PaymentSplit[]): number {
  return roundMoney(splits.reduce((sum, split) => sum + split.amount, 0));
}

export function validatePaymentSplits(splits: PaymentSplit[], total: number): string | null {
  if (splits.length < 2) {
    return 'Indica al menos dos métodos de pago.';
  }
  const seen = new Set<SplitPaymentMethod>();
  for (const split of splits) {
    if (!isSplitPaymentMethod(split.method)) return 'Método de pago no válido.';
    if (!(split.amount > 0)) return 'Cada método debe tener un monto mayor a cero.';
    if (seen.has(split.method)) return 'No repitas el mismo método de pago.';
    seen.add(split.method);
  }
  const expected = roundMoney(total);
  if (paymentSplitsSum(splits) !== expected) {
    return `Los montos deben sumar ${expected.toFixed(2)}.`;
  }
  return null;
}

function splitMethodLabel(method: SplitPaymentMethod): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'card_terminal') return 'TPV';
  return 'Transferencia';
}

export function formatPaymentSplitsLabel(splits: PaymentSplit[]): string {
  if (splits.length === 0) return '';
  return splits
    .map((split) => `${splitMethodLabel(split.method)} ${split.amount.toFixed(2)}`)
    .join(' + ');
}

/** Amounts to book by method: splits when present, otherwise the whole total. */
export function orderPaymentAmounts(order: {
  total?: number | null;
  payment_method?: string | null;
  payment_splits?: unknown;
}): Array<{ method: string; amount: number }> {
  const splits = parsePaymentSplits(order.payment_splits);
  if (splits.length >= 2) return splits;
  const method = order.payment_method ?? 'cash';
  const amount = roundMoney(Number(order.total ?? 0));
  return amount > 0 ? [{ method, amount }] : [];
}
