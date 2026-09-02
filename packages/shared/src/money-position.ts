import { roundMoney } from './market-prices';

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
