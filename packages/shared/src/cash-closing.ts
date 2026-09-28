const MONEY_EPS = 0.009;

export function parseOptionalMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function expectedCashOnHand(openingFloat: number | null | undefined, cashSales: number): number {
  return (openingFloat ?? 0) + cashSales;
}

/** Error message if the close is not ready; null when it can be saved. */
export function cashCloseValidationError(input: {
  countedCash: unknown;
  openingFloat: unknown;
  cashSales: number;
  notes: string | null | undefined;
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
  const expected = expectedCashOnHand(opening, input.cashSales);
  if (Math.abs(counted - expected) > MONEY_EPS && !(input.notes ?? '').trim()) {
    return 'Si hay diferencia, anota por qué para poder cerrar';
  }
  return null;
}
