export const INCOME_ENTRY_TYPES = ['contribution', 'operating'] as const;

export type IncomeEntryType = (typeof INCOME_ENTRY_TYPES)[number];

export const INCOME_ENTRY_TYPE_LABELS: Record<IncomeEntryType, string> = {
  contribution: 'Aportación',
  operating: 'Otro ingreso',
};

export const INCOME_ENTRY_TYPE_HINTS: Record<IncomeEntryType, string> = {
  contribution: 'Capital que metiste. Suma a Tienes.',
  operating: 'Reembolso o venta suelta. Sí entra a Tienes.',
};

export interface IncomeEntryInput {
  entryType: IncomeEntryType;
  concept: string;
  amount: number;
  entryDate: string;
  notes?: string | null;
}

export function isIncomeEntryType(value: string): value is IncomeEntryType {
  return (INCOME_ENTRY_TYPES as readonly string[]).includes(value);
}

export function validateIncomeEntryInput(input: {
  entryType: string;
  concept: string;
  amount: number;
  entryDate: string;
  notes?: string | null;
}): string | null {
  if (!isIncomeEntryType(input.entryType)) {
    return 'Elige si es aportación u otro ingreso.';
  }
  const concept = input.concept?.trim() ?? '';
  if (!concept) return 'El concepto es obligatorio.';
  if (concept.length > 120) return 'El concepto es demasiado largo.';
  if (!(input.amount > 0)) return 'El monto debe ser mayor a cero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate ?? '')) {
    return 'La fecha es inválida.';
  }
  return null;
}
