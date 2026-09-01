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

export function validateOperatingCostInput(input: OperatingCostInput): string | null {
  if (!input.name.trim()) return 'El nombre del costo es obligatorio.';
  if (!OPERATING_COST_TYPES.includes(input.costType)) return 'Tipo de costo inválido.';
  if (!OPERATING_COST_PERIODS.includes(input.period)) return 'Periodo inválido.';
  if (input.amount < 0) return 'El monto no puede ser negativo.';
  return null;
}

export function calcMarginAmount(salePrice: number, unitCost: number): number {
  return Math.round((salePrice - unitCost) * 100) / 100;
}

export function calcMarginPercent(salePrice: number, unitCost: number): number {
  if (salePrice <= 0) return 0;
  return Math.round(((salePrice - unitCost) / salePrice) * 1000) / 10;
}
