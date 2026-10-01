import { isIncomeEntryType, parseIncomePocket } from './income-entries';
import { roundMoney } from './market-prices';
import { parseMoneyPocket, type MoneyPocket } from './money-position';
import {
  OPERATING_COST_CATEGORY_LABELS,
  type OperatingCostOnYmd,
} from './profitability';

const MONEY_EPS = 0.009;

export function parseOptionalMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export type CashDrawerLine = {
  direction: 'in' | 'out';
  label: string;
  amount: number;
  pocket: MoneyPocket;
};

export function cashDrawerNet(lines: CashDrawerLine[], pocket: MoneyPocket = 'cash'): number {
  return roundMoney(
    lines
      .filter((line) => line.pocket === pocket)
      .reduce((sum, line) => sum + (line.direction === 'in' ? line.amount : -line.amount), 0),
  );
}

export function expectedCashOnHand(
  openingFloat: number | null | undefined,
  cashSales: number,
  lines: CashDrawerLine[] = [],
): number {
  return roundMoney((openingFloat ?? 0) + cashSales + cashDrawerNet(lines, 'cash'));
}

/** When the drawer is short by the same-day Gastos tagged as cuenta, treat them as cash taken. */
export function expectedCashOnHandForCount(
  openingFloat: number | null | undefined,
  cashSales: number,
  lines: CashDrawerLine[] = [],
  countedCash: number | null | undefined,
): number {
  const afterCash = expectedCashOnHand(openingFloat, cashSales, lines);
  const counted = countedCash == null ? null : Number(countedCash);
  if (counted == null || !Number.isFinite(counted)) return afterCash;
  const accountOut = -cashDrawerNet(lines, 'account');
  if (!(accountOut > MONEY_EPS)) return afterCash;
  const gap = roundMoney(afterCash - counted);
  if (Math.abs(gap - accountOut) <= MONEY_EPS) {
    return roundMoney(afterCash - accountOut);
  }
  return afterCash;
}

function pushLine(
  lines: CashDrawerLine[],
  direction: 'in' | 'out',
  label: string,
  amount: number,
  pocket: MoneyPocket,
) {
  if (!(amount > 0)) return;
  lines.push({ direction, label, amount: roundMoney(amount), pocket });
}

function withNotes(base: string, notes: string | null | undefined): string {
  const extra = (notes ?? '').trim();
  return extra ? `${base} · ${extra}` : base;
}

export function buildCashDrawerLines(input: {
  expenses?: Array<{ concept?: string | null; amount: number; paidFrom?: string | null }>;
  purchases?: Array<{ notes?: string | null; amount: number; paidFrom?: string | null }>;
  incomes?: Array<{
    concept?: string | null;
    amount: number;
    paidFrom?: string | null;
    entryType?: string | null;
  }>;
  transfers?: Array<{ notes?: string | null; amount: number; destination?: string | null }>;
  operating?: OperatingCostOnYmd[];
}): CashDrawerLine[] {
  const lines: CashDrawerLine[] = [];

  for (const row of input.operating ?? []) {
    const category = OPERATING_COST_CATEGORY_LABELS[row.category];
    const name = row.name.trim();
    const label = name && name !== category ? `${category} · ${name}` : name || category;
    pushLine(lines, 'out', label, row.amount, row.paidFrom);
  }

  for (const row of input.expenses ?? []) {
    const pocket = parseMoneyPocket(row.paidFrom, 'cash');
    const concept = (row.concept ?? '').trim() || 'Gasto';
    pushLine(lines, 'out', `Gasto · ${concept}`, row.amount, pocket);
  }

  for (const row of input.purchases ?? []) {
    if (parseMoneyPocket(row.paidFrom, 'cash') !== 'cash') continue;
    pushLine(lines, 'out', withNotes('Compra', row.notes), row.amount, 'cash');
  }

  for (const row of input.incomes ?? []) {
    const rawType = row.entryType ?? '';
    const entryType = isIncomeEntryType(rawType) ? rawType : 'operating';
    if (parseIncomePocket(row.paidFrom, entryType) !== 'cash') continue;
    const concept = (row.concept ?? '').trim() || 'Ingreso';
    pushLine(lines, 'in', `Ingreso · ${concept}`, row.amount, 'cash');
  }

  for (const row of input.transfers ?? []) {
    if (parseMoneyPocket(row.destination, 'account') === 'cash') {
      pushLine(lines, 'in', withNotes('De cuenta a caja', row.notes), row.amount, 'cash');
    } else {
      pushLine(lines, 'out', withNotes('Retiro a cuenta', row.notes), row.amount, 'cash');
    }
  }

  return lines;
}

/** Error message if the close is not ready; null when it can be saved. */
export function cashCloseValidationError(input: {
  countedCash: unknown;
  openingFloat: unknown;
  cashSales: number;
  notes: string | null | undefined;
  cashLines?: CashDrawerLine[];
}): string | null {
  const counted = parseOptionalMoney(input.countedCash);
  if (counted == null || counted < 0) {
    return 'Cuenta el efectivo para cuadrar la caja';
  }
  const openingProvided = input.openingFloat !== null && input.openingFloat !== undefined && input.openingFloat !== '';
  const opening = parseOptionalMoney(input.openingFloat);
  if (openingProvided && (opening == null || opening < 0)) {
    return 'El fondo inicial no es válido';
  }
  const expected = expectedCashOnHandForCount(opening, input.cashSales, input.cashLines, counted);
  if (Math.abs(counted - expected) > MONEY_EPS && !(input.notes ?? '').trim()) {
    return 'Si hay diferencia, anota por qué para poder cerrar';
  }
  return null;
}
