import { isMoneyPocket, type MoneyPocket } from './money-position';

export const VISIT_EXPENSE_PRESETS = [
  'Gasolina',
  'Bolsas plásticas',
  'Estacionamiento',
  'Empaque / cajas',
  'Transporte',
  'Otro',
] as const;

export type VisitExpensePreset = (typeof VISIT_EXPENSE_PRESETS)[number];

export interface ExpenseInput {
  concept: string;
  amount: number;
  expenseDate: string;
  notes?: string | null;
  paidFrom?: MoneyPocket;
}

export function validateExpenseInput(input: ExpenseInput): string | null {
  const concept = input.concept?.trim() ?? '';
  if (!concept) return 'El concepto es obligatorio.';
  if (concept.length > 120) return 'El concepto es demasiado largo.';
  if (!(input.amount > 0)) return 'El monto debe ser mayor a cero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate ?? '')) {
    return 'La fecha del gasto es inválida.';
  }
  if (input.paidFrom != null && !isMoneyPocket(input.paidFrom)) {
    return 'Elige si pagaste en efectivo o de la cuenta.';
  }
  return null;
}
