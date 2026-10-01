'use client';

import { useMemo, useState } from 'react';

import {
  formatMoney,
  moneyDayHasActivity,
  type MoneyDayRow,
  type MoneyLedger,
} from '@puertaverde/shared';

import { FoldableSummary } from '@/components/ActionChip';
import { formatMexicoSpokenDay, formatMexicoWeekday } from '@/lib/mexico-date';

function signedMoney(amount: number): string {
  if (Math.abs(amount) < 0.005) return formatMoney(0);
  const formatted = formatMoney(Math.abs(amount));
  return amount > 0 ? `+${formatted}` : `−${formatted}`;
}

function moneyClass(amount: number, empty = 'text-slate-400'): string {
  if (Math.abs(amount) < 0.005) return empty;
  return amount > 0 ? 'text-emerald-800' : 'text-rose-700';
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function DayLines({ day }: { day: MoneyDayRow }) {
  const lines: Array<{ label: string; amount: number }> = [
    { label: 'Ventas en efectivo', amount: day.cashSales },
    { label: 'TPV', amount: day.cardSales },
    { label: 'Transferencia', amount: day.transferSales },
    { label: 'En línea', amount: day.onlineSales },
    { label: 'Otros ingresos · caja', amount: day.otherInCash },
    { label: 'Otros ingresos · cuenta', amount: day.otherInAccount },
    { label: 'Depósito caja → cuenta', amount: day.toAccount },
    { label: 'Cuenta → caja', amount: day.toCash },
    { label: 'Compras · caja', amount: -day.purchasesCash },
    { label: 'Compras · cuenta', amount: -day.purchasesAccount },
    { label: 'Gastos y renta · caja', amount: -day.expensesCash },
    { label: 'Gastos y renta · cuenta', amount: -day.expensesAccount },
  ].filter((line) => Math.abs(line.amount) >= 0.005);

  if (!lines.length && !day.counted) {
    return <p className="text-sm text-slate-500">Sin movimientos este día.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {day.counted ? (
        <li className="py-2 text-sm text-amber-800">
          Hubo conteo. Tienes se queda en ese número; lo de abajo es lo registrado el mismo día.
        </li>
      ) : null}
      {lines.map((line) => (
        <li key={line.label} className="flex items-baseline justify-between gap-3 py-2">
          <p className="text-sm text-slate-700">{line.label}</p>
          <p className={`text-sm font-semibold tabular-nums ${moneyClass(line.amount)}`}>
            {signedMoney(line.amount)}
          </p>
        </li>
      ))}
      <li className="flex items-baseline justify-between gap-3 border-t-2 border-slate-200 pt-3">
        <p className="text-sm font-semibold text-slate-900">Neto cuenta</p>
        <p className={`text-sm font-bold tabular-nums ${moneyClass(day.netAccount)}`}>
          {signedMoney(day.netAccount)}
        </p>
      </li>
      <li className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">Neto caja</p>
        <p className={`text-sm font-bold tabular-nums ${moneyClass(day.netCash)}`}>
          {signedMoney(day.netCash)}
        </p>
      </li>
    </ul>
  );
}

export function MoneyDayLedger({ ledger }: { ledger: MoneyLedger | null }) {
  const [open, setOpen] = useState(true);
  const days = useMemo(
    () =>
      ledger
        ? ledger.days.filter((day) => moneyDayHasActivity(day)).toReversed()
        : [],
    [ledger],
  );

  if (!ledger) return null;

  const accountSales = ledger.totals.cardSales + ledger.totals.transferSales + ledger.totals.onlineSales;
  const accountOut = ledger.totals.purchasesAccount + ledger.totals.expensesAccount + ledger.totals.toCash;

  return (
    <details
      className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <FoldableSummary
        title="Movimientos de dinero"
        hint={`${formatMexicoSpokenDay(ledger.from)} – ${formatMexicoSpokenDay(ledger.to)} · compara la cuenta con el banco`}
        emoji="🏦"
        iconClass="bg-sky-100"
      />

      <p className="text-sm text-slate-600">
        Tienes en cuenta no es el banco: es lo que el tablero espera según TPV, transferencias,
        depósitos y gastos de cuenta. Si un día el banco no se mueve y aquí sí (o al revés), ahí
        está el desfase. El TPV a veces entra al banco al día siguiente; las comisiones del banco
        no están registradas.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Efectivo" value={formatMoney(ledger.totals.cashSales)} hint="Ventas cobradas en caja" />
        <Stat label="TPV" value={formatMoney(ledger.totals.cardSales)} hint="Debería caer en la cuenta" />
        <Stat
          label="Transferencia"
          value={formatMoney(ledger.totals.transferSales)}
          hint="Cobros por transferencia"
        />
        <Stat
          label="Depósitos"
          value={formatMoney(ledger.totals.toAccount)}
          hint="Efectivo que pasó a la cuenta"
        />
        <Stat label="Salió de cuenta" value={formatMoney(accountOut)} hint="Compras, renta y gastos" />
        <Stat
          label="Cuenta esperada"
          value={formatMoney(ledger.closingAccount)}
          hint={`Caja ${formatMoney(ledger.closingCash)}`}
        />
      </div>

      <p className="text-xs text-slate-500">
        Al inicio: caja {formatMoney(ledger.openingCash)} · cuenta {formatMoney(ledger.openingAccount)}
        {ledger.openingAsOf ? ` · último conteo ${formatMexicoSpokenDay(ledger.openingAsOf)}` : ''}
        {accountSales > 0 ? ` · cobros a cuenta ${formatMoney(accountSales)}` : ''}
      </p>

      {days.length === 0 ? (
        <p className="text-sm text-slate-500">No hay movimientos de dinero en este periodo.</p>
      ) : (
        <ul className="space-y-2">
          {days.map((day) => (
            <li key={day.ymd}>
              <details className="group/day rounded-xl border border-slate-100 bg-white">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-3 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatMexicoSpokenDay(day.ymd)}
                      <span className="ml-1 font-normal text-slate-500">{formatMexicoWeekday(day.ymd)}</span>
                      {day.counted ? (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Conteo
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Efectivo {formatMoney(day.cashSales)}
                      {day.cardSales > 0 ? ` · TPV ${formatMoney(day.cardSales)}` : ''}
                      {day.transferSales > 0 ? ` · Transf. ${formatMoney(day.transferSales)}` : ''}
                      {day.onlineSales > 0 ? ` · En línea ${formatMoney(day.onlineSales)}` : ''}
                      {day.toAccount > 0 ? ` · Depósito ${formatMoney(day.toAccount)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Cuenta
                      </p>
                      <p className="text-sm font-bold tabular-nums text-slate-900">
                        {day.runningAccount == null ? '—' : formatMoney(day.runningAccount)}
                      </p>
                      <p className={`text-xs tabular-nums ${moneyClass(day.netAccount)}`}>
                        {signedMoney(day.netAccount)}
                      </p>
                    </div>
                    <svg
                      className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-open/day:rotate-180"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </summary>
                <div className="border-t border-slate-100 px-3 py-3">
                  <DayLines day={day} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
