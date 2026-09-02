import {
  addPocketInflow,
  addPocketOutflow,
  isMoneyPocket,
  parseMoneyPocket,
  type MoneyPocket,
  type MoneyPositionFlows,
} from './money-position';

export const OPERATING_COST_TYPES = ['fixed', 'variable'] as const;
export type OperatingCostType = (typeof OPERATING_COST_TYPES)[number];

export const OPERATING_COST_PERIODS = ['monthly', 'daily', 'per_order'] as const;
export type OperatingCostPeriod = (typeof OPERATING_COST_PERIODS)[number];

export const OPERATING_COST_TYPE_LABELS: Record<OperatingCostType, string> = {
  fixed: 'Fijo',
  variable: 'Variable',
};

export const OPERATING_COST_PERIOD_LABELS: Record<OperatingCostPeriod, string> = {
  monthly: 'Mensual',
  daily: 'Diario',
  per_order: 'Por pedido',
};

export interface OperatingCostInput {
  name: string;
  costType: OperatingCostType;
  period: OperatingCostPeriod;
  amount: number;
  notes?: string | null;
  isActive: boolean;
  paidFrom?: MoneyPocket;
  /** First day the cost should apply (the start of the Números period being viewed). */
  effectiveFrom?: string;
}

export interface OperatingCostTerm {
  id?: string;
  start_date: string;
  end_date: string | null;
}

export function costAppliesToRange(
  terms: OperatingCostTerm[] | undefined,
  from: string,
  to: string,
): boolean {
  return (terms ?? []).some(
    (term) => term.start_date <= to && (term.end_date == null || term.end_date >= from),
  );
}

/** True when Pausar closed a term the day before this period (end_date = from − 1). */
export function costPausedAtPeriodStart(
  terms: OperatingCostTerm[] | undefined,
  periodStart: string,
  dayBefore: string,
): boolean {
  return (terms ?? []).some(
    (term) => term.end_date === dayBefore && term.start_date <= periodStart,
  );
}

/** First calendar day of the month that contains `ymd`. */
export function calendarMonthStart(ymd: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(0, 7)}-01` : ymd;
}

export interface OperatingCostPocketInput {
  costType: OperatingCostType;
  period: OperatingCostPeriod;
  amount: number;
  paidFrom?: MoneyPocket | null;
  terms?: OperatingCostTerm[];
}

/** Rent, payroll, and services leave (or return to) caja/cuenta. */
export function applyOperatingCostsToPockets(
  flows: MoneyPositionFlows,
  costs: OperatingCostPocketInput[],
  options: {
    from: string;
    to: string;
    dayBeforeFrom: string;
    orderCount?: number;
    mode: 'outflow' | 'paused-addback';
  },
): void {
  const orderCount = options.orderCount ?? 0;
  for (const cost of costs) {
    const applies = costAppliesToRange(cost.terms, options.from, options.to);
    const include =
      options.mode === 'outflow'
        ? applies
        : !applies && costPausedAtPeriodStart(cost.terms, options.from, options.dayBeforeFrom);
    if (!include) continue;
    const amount = operatingCostAmountForRange(cost, options.from, options.to, orderCount);
    const pocket = parseMoneyPocket(cost.paidFrom, 'account');
    if (options.mode === 'outflow') addPocketOutflow(flows, pocket, amount);
    else addPocketInflow(flows, pocket, amount);
  }
}

export function validateOperatingCostInput(input: OperatingCostInput): string | null {
  if (!input.name.trim()) return 'El nombre del costo es obligatorio.';
  if (!OPERATING_COST_TYPES.includes(input.costType)) return 'Tipo de costo inválido.';
  if (!OPERATING_COST_PERIODS.includes(input.period)) return 'Periodo inválido.';
  if (input.amount < 0) return 'El monto no puede ser negativo.';
  if (input.paidFrom != null && !isMoneyPocket(input.paidFrom)) {
    return 'Elige si sale de efectivo o de la cuenta.';
  }
  return null;
}

function ymdParts(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

function daysInCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function inclusiveDayCount(from: string, to: string): number {
  const start = ymdParts(from);
  const end = ymdParts(to);
  const ms =
    Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day);
  return Math.max(Math.round(ms / 86_400_000) + 1, 1);
}

/** Same allocation as get_profit_summary for a date range. */
export function operatingCostAmountForRange(
  cost: { costType: OperatingCostType; period: OperatingCostPeriod; amount: number },
  from: string,
  to: string,
  orderCount = 0,
): number {
  const start = ymdParts(from);
  const end = ymdParts(to);
  const periodDays = inclusiveDayCount(from, to);
  const sameMonth = start.year === end.year && start.month === end.month;
  const fullMonthFixed = sameMonth && start.day === 1;
  const monthDiv = sameMonth ? daysInCalendarMonth(start.year, start.month) : 30;
  const amount = Number(cost.amount);

  if (cost.period === 'monthly') {
    if (cost.costType === 'fixed' && fullMonthFixed) return amount;
    return amount * (periodDays / monthDiv);
  }
  if (cost.period === 'daily') return amount * periodDays;
  if (cost.period === 'per_order') return amount * orderCount;
  return 0;
}

export function calcMarginAmount(salePrice: number, unitCost: number): number {
  return Math.round((salePrice - unitCost) * 100) / 100;
}

export function calcMarginPercent(salePrice: number, unitCost: number): number {
  if (salePrice <= 0) return 0;
  return Math.round(((salePrice - unitCost) / salePrice) * 1000) / 10;
}
