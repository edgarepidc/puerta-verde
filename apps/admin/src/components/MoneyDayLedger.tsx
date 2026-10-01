'use client';

import { useEffect, useMemo, useState } from 'react';

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

type AuditLine = { label: string; amount: number; always?: boolean };

function yesterdayPockets(ledger: MoneyLedger, ymd: string): {
  cash: number | null;
  account: number | null;
} {
  for (let i = ledger.days.length - 1; i >= 0; i -= 1) {
    const prior = ledger.days[i]!;
    if (prior.ymd >= ymd) continue;
    if (prior.runningCash != null || prior.runningAccount != null) {
      return { cash: prior.runningCash, account: prior.runningAccount };
    }
  }
  return { cash: ledger.openingCash, account: ledger.openingAccount };
}

function AuditLines({
  title,
  today,
  lines,
}: {
  title: string;
  today: number | null;
  lines: AuditLine[];
}) {
  const visible = lines.filter((line) => line.always || Math.abs(line.amount) >= 0.005);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">{title}</p>
      <ul className="mt-2 divide-y divide-emerald-100/80">
        {visible.map((line) => (
          <li key={line.label} className="flex items-baseline justify-between gap-3 py-2">
            <p className="text-sm text-slate-700">{line.label}</p>
            <p className={`text-sm font-semibold tabular-nums ${moneyClass(line.amount)}`}>
              {signedMoney(line.amount)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t-2 border-emerald-200 pt-3">
        <p className="text-sm font-semibold text-slate-900">Hoy</p>
        <p className="text-base font-bold tabular-nums text-slate-900">
          {today == null ? '—' : formatMoney(today)}
        </p>
      </div>
    </div>
  );
}

function DayAudit({ day }: { day: MoneyDayRow }) {
  const cashLines: AuditLine[] = [
    { label: 'Ventas en efectivo', amount: day.cashSales, always: true },
    { label: 'Otros ingresos', amount: day.otherInCash },
    { label: 'Cuenta → caja', amount: day.toCash },
    { label: 'Compras', amount: -day.purchasesCash },
    { label: 'Gastos y renta', amount: -day.expensesCash },
    { label: 'Depósito a cuenta', amount: -day.toAccount },
  ];
  const accountLines: AuditLine[] = [
    { label: 'TPV', amount: day.cardSales, always: true },
    { label: 'Transferencia', amount: day.transferSales, always: true },
    { label: 'Stripe', amount: day.onlineSales, always: true },
    { label: 'Otros ingresos', amount: day.otherInAccount },
    { label: 'Depósito desde caja', amount: day.toAccount },
    { label: 'Cuenta → caja', amount: -day.toCash },
    { label: 'Compras', amount: -day.purchasesAccount },
    { label: 'Gastos y renta', amount: -day.expensesAccount },
  ];

  return (
    <div className="space-y-4">
      {day.counted ? (
        <p className="text-sm text-amber-800">
          Hubo conteo. Hoy es el número del cierre; lo de arriba ya está incluido.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <AuditLines title="Efectivo" today={day.runningCash} lines={cashLines} />
        <AuditLines title="Cuenta" today={day.runningAccount} lines={accountLines} />
      </div>
    </div>
  );
}

export function MoneyDayLedger({ ledger }: { ledger: MoneyLedger | null }) {
  const [open, setOpen] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const days = useMemo(
    () =>
      ledger
        ? ledger.days.filter((day) => moneyDayHasActivity(day)).toReversed()
        : [],
    [ledger],
  );

  useEffect(() => {
    setReviewing(null);
  }, [ledger?.from, ledger?.to]);

  if (!ledger) return null;

  const accountSales = ledger.totals.cardSales + ledger.totals.transferSales + ledger.totals.onlineSales;

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
        Tienes arranca del último cierre. Cada venta, gasto, renta, compra y depósito mueve efectivo o
        cuenta. Si un día el banco no se mueve y aquí sí (o al revés), ahí está el desfase: el TPV a
        veces entra al día siguiente y las comisiones del banco no están registradas.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Efectivo" value={formatMoney(ledger.totals.cashSales)} hint="Ventas cobradas en caja" />
        <Stat label="TPV" value={formatMoney(ledger.totals.cardSales)} hint="Debería caer en la cuenta" />
        <Stat
          label="Transferencia"
          value={formatMoney(ledger.totals.transferSales)}
          hint="Cobros por transferencia"
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
          {days.map((day) => {
            const reviewingThis = reviewing === day.ymd;
            const yesterday = yesterdayPockets(ledger, day.ymd);
            return (
            <li key={day.ymd}>
              <details
                className={
                  reviewingThis
                    ? 'group/day rounded-2xl border-2 border-emerald-500 bg-emerald-50/70 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]'
                    : 'group/day rounded-xl border border-slate-100 bg-white'
                }
                open={reviewingThis}
              >
                <summary
                  className="flex cursor-pointer list-none items-start justify-between gap-3 px-3 py-3 marker:content-none [&::-webkit-details-marker]:hidden"
                  onClick={(event) => {
                    event.preventDefault();
                    setReviewing((current) => (current === day.ymd ? null : day.ymd));
                  }}
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${reviewingThis ? 'text-emerald-950' : 'text-slate-900'}`}>
                      {formatMexicoSpokenDay(day.ymd)}
                      <span className={`ml-1 font-normal ${reviewingThis ? 'text-emerald-800' : 'text-slate-500'}`}>
                        {formatMexicoWeekday(day.ymd)}
                      </span>
                      {reviewingThis ? (
                        <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          Revisando
                        </span>
                      ) : null}
                      {day.counted ? (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Conteo
                        </span>
                      ) : null}
                    </p>
                    {reviewingThis ? null : (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Efectivo {formatMoney(day.cashSales)}
                      {day.cardSales > 0 ? ` · TPV ${formatMoney(day.cardSales)}` : ''}
                      {day.transferSales > 0 ? ` · Transf. ${formatMoney(day.transferSales)}` : ''}
                      {day.onlineSales > 0 ? ` · Stripe ${formatMoney(day.onlineSales)}` : ''}
                      {day.toAccount > 0 ? ` · Depósito ${formatMoney(day.toAccount)}` : ''}
                    </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-start gap-3">
                    <div className="text-right">
                      <p
                        className={`text-[11px] font-semibold uppercase tracking-wide ${
                          reviewingThis ? 'text-emerald-800' : 'text-slate-500'
                        }`}
                      >
                        Efectivo
                      </p>
                      {reviewingThis ? (
                        <>
                          <p className="text-[11px] text-emerald-800">al día de ayer</p>
                          <p className="text-sm font-bold tabular-nums text-slate-900">
                            {yesterday.cash == null ? '—' : formatMoney(yesterday.cash)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-bold tabular-nums text-slate-900">
                            {day.runningCash == null ? '—' : formatMoney(day.runningCash)}
                          </p>
                          <p className={`text-xs tabular-nums ${moneyClass(day.netCash)}`}>
                            {signedMoney(day.netCash)}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-[11px] font-semibold uppercase tracking-wide ${
                          reviewingThis ? 'text-emerald-800' : 'text-slate-500'
                        }`}
                      >
                        Cuenta
                      </p>
                      {reviewingThis ? (
                        <>
                          <p className="text-[11px] text-emerald-800">al día de ayer</p>
                          <p className="text-sm font-bold tabular-nums text-slate-900">
                            {yesterday.account == null ? '—' : formatMoney(yesterday.account)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-bold tabular-nums text-slate-900">
                            {day.runningAccount == null ? '—' : formatMoney(day.runningAccount)}
                          </p>
                          <p className={`text-xs tabular-nums ${moneyClass(day.netAccount)}`}>
                            {signedMoney(day.netAccount)}
                          </p>
                        </>
                      )}
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
                <div className="border-t border-emerald-200/80 px-3 py-3">
                  <DayAudit day={day} />
                </div>
              </details>
            </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
