import {
  expectedCashOnHand,
  expectedCashOnHandForCount,
  formatMoney,
  type CashDrawerLine,
} from '@puertaverde/shared';

const MONEY_EPS = 0.009;

export function CashCloseExpected({
  openingFloat,
  cashSales,
  cashLines,
  countedCash,
}: {
  openingFloat: number;
  cashSales: number;
  cashLines: CashDrawerLine[];
  countedCash: number | null;
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

  return (
    <div className="space-y-1.5 text-sm">
      {hasActivity ? (
        <>
          <p className="font-medium text-slate-700">
            Fondo + efectivo vendido {formatMoney(salesExpected)}
          </p>
          {takenFromDrawer.length > 0 ? (
            <div className="space-y-0.5">
              <p className="text-rose-800">Falta porque se tomó de caja para pagos:</p>
              {takenFromDrawer.map((line, index) => (
                <p key={`out-${index}`} className="pl-3 text-rose-800">
                  {line.label} −{formatMoney(line.amount)}
                </p>
              ))}
            </div>
          ) : null}
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
            <div className="space-y-0.5">
              <p className="text-slate-500">En Gastos, pagado por cuenta (no sale de caja):</p>
              {accountOnly.map((line, index) => (
                <p key={`acc-${index}`} className="pl-3 text-slate-500">
                  {line.label} {formatMoney(line.amount)}
                </p>
              ))}
            </div>
          ) : null}
          <p className="font-medium text-slate-900">En caja {formatMoney(expected)}</p>
        </>
      ) : (
        <p className="font-medium text-slate-700">Esperado {formatMoney(expected)}</p>
      )}
      {cashDiff == null ? (
        <p className="text-slate-500">Cuenta el efectivo de la caja para poder cerrar.</p>
      ) : (
        <p className={`font-medium ${matches || cashDiff > 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
          {matches ? 'Cuadra con lo contado' : `Diferencia ${formatMoney(cashDiff)}`}
        </p>
      )}
    </div>
  );
}
