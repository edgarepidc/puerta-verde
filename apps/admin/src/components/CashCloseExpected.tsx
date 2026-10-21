import {
  expectedCashOnHand,
  expectedCashOnHandForCount,
  formatMoney,
  roundMoney,
  type CashDrawerLine,
} from '@puertaverde/shared';

const MONEY_EPS = 0.009;

export function CashCloseExpected({
  openingFloat,
  cashSales,
  cashLines,
  countedCash,
  linesOnly = false,
}: {
  openingFloat: number;
  cashSales: number;
  cashLines: CashDrawerLine[];
  countedCash: number | null;
  linesOnly?: boolean;
}) {
  const counted = countedCash != null && Number.isFinite(countedCash) ? countedCash : null;
  const salesExpected = expectedCashOnHand(openingFloat, cashSales);
  const afterCash = expectedCashOnHand(openingFloat, cashSales, cashLines);
  const expected = expectedCashOnHandForCount(openingFloat, cashSales, cashLines, counted);
  const cashDiff = counted == null ? null : counted - expected;
  const matches = cashDiff != null && Math.abs(cashDiff) < MONEY_EPS;
  const accountExplainsShortage = Math.abs(afterCash - expected) > MONEY_EPS;

  const cashOuts = cashLines.filter((line) => line.direction === 'out' && line.pocket === 'cash');
  const cashIns = cashLines.filter((line) => line.direction === 'in' && line.pocket === 'cash');
  const accountOuts = cashLines.filter((line) => line.direction === 'out' && line.pocket === 'account');
  const takenFromDrawer = accountExplainsShortage ? [...cashOuts, ...accountOuts] : cashOuts;
  const accountOnly = accountExplainsShortage ? [] : accountOuts;
  const hasActivity = takenFromDrawer.length > 0 || cashIns.length > 0 || accountOnly.length > 0;
  if (linesOnly && !hasActivity) return null;

  const shortageChip =
    takenFromDrawer.length > 0 ? (
      <div className="ml-auto w-fit max-w-full rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-right shadow-[0_4px_14px_rgba(190,18,60,0.08)]">
        <p className="text-xs font-semibold text-rose-800">Falta porque se tomó de caja para pagos</p>
        <div className="mt-1 space-y-0.5">
          {takenFromDrawer.map((line, index) => (
            <p key={`out-${index}`} className="text-sm font-medium tabular-nums text-rose-900">
              {line.label} −{formatMoney(line.amount)}
            </p>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
      <div className="min-w-0 space-y-1.5">
      {hasActivity ? (
        <>
          {linesOnly ? null : (
            <p className="font-medium text-slate-700">
              Fondo + efectivo vendido {formatMoney(salesExpected)}
            </p>
          )}
          {cashIns.length > 0 ? (
            <div className="space-y-0.5">
              <p className="text-emerald-800">Entró a caja:</p>
              {cashIns.map((line, index) => (
                <p key={`in-${index}`} className="pl-3 text-emerald-800">
                  {line.label} {formatMoney(line.amount)}
                </p>
              ))}
            </div>
          ) : null}
          {accountOnly.length > 0 ? (
            <p className="max-w-sm text-slate-500">
              De la cuenta salieron{' '}
              {formatMoney(roundMoney(accountOnly.reduce((sum, line) => sum + line.amount, 0)))}. No se
              restan del efectivo.
            </p>
          ) : null}
          {linesOnly ? null : <p className="font-medium text-slate-900">En caja {formatMoney(expected)}</p>}
        </>
      ) : linesOnly ? null : (
        <p className="font-medium text-slate-700">Esperado {formatMoney(expected)}</p>
      )}
      {linesOnly ? null : cashDiff == null ? (
        <p className="text-slate-500">Cuenta el efectivo de la caja para poder cerrar.</p>
      ) : (
        <p className={`font-medium ${matches || cashDiff > 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
          {matches ? 'Cuadra con lo contado' : `Diferencia ${formatMoney(cashDiff)}`}
        </p>
      )}
      </div>
      {shortageChip}
    </div>
  );
}
