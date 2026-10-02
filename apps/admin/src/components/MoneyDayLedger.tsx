'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  formatMoney,
  moneyDayAuditMovements,
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

const DAY_GRID =
  'grid grid-cols-[minmax(0,1fr)_6.25rem_6.25rem_1.25rem] items-start gap-x-4';

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

function pocketAmount(value: number | null): string {
  return value == null ? '—' : formatMoney(value);
}

function PocketHead({
  label,
  amount,
  reviewing,
}: {
  label: string;
  amount: number | null;
  reviewing: boolean;
}) {
  return (
    <div className="w-full text-right">
      <p
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          reviewing ? 'text-emerald-800' : 'text-slate-500'
        }`}
      >
        {label}
      </p>
      <p
        className={`text-sm font-bold tabular-nums ${
          reviewing ? 'text-emerald-950' : 'text-slate-900'
        }`}
      >
        {pocketAmount(amount)}
      </p>
    </div>
  );
}

function DayAudit({
  day,
  yesterday,
}: {
  day: MoneyDayRow;
  yesterday: { cash: number | null; account: number | null };
}) {
  const movements = moneyDayAuditMovements(day);

  return (
    <div className="border-t border-emerald-200/80 px-3 pb-3 pt-1">
      <div className={DAY_GRID}>
        <p className="py-1.5 text-sm text-emerald-900/80">ayer tenías</p>
        <p className="py-1.5 text-right text-sm font-bold tabular-nums text-slate-900">
          {pocketAmount(yesterday.cash)}
        </p>
        <p className="py-1.5 text-right text-sm font-bold tabular-nums text-slate-900">
          {pocketAmount(yesterday.account)}
        </p>
        <span />
        {movements.map((row, index) => {
          const cash = Math.abs(row.cash) >= 0.005 ? row.cash : null;
          const account = Math.abs(row.account) >= 0.005 ? row.account : null;
          return (
            <div key={`${row.label}-${index}`} className="contents">
              <p className="py-1.5 text-sm text-slate-700">{row.label}</p>
              <p
                className={`py-1.5 text-right text-sm font-semibold tabular-nums ${
                  cash != null ? moneyClass(cash) : ''
                }`}
              >
                {cash != null ? signedMoney(cash) : ''}
              </p>
              <p
                className={`py-1.5 text-right text-sm font-semibold tabular-nums ${
                  account != null ? moneyClass(account) : ''
                }`}
              >
                {account != null ? signedMoney(account) : ''}
              </p>
              <span />
            </div>
          );
        })}
        <div className="col-span-4 mt-1 border-t-2 border-emerald-200" />
        <p className="pt-3 text-sm font-semibold text-slate-900">Total al día de hoy</p>
        <p className="pt-3 text-right text-base font-bold tabular-nums text-slate-900">
          {pocketAmount(day.runningCash)}
        </p>
        <p className="pt-3 text-right text-base font-bold tabular-nums text-slate-900">
          {pocketAmount(day.runningAccount)}
        </p>
        <span />
      </div>
    </div>
  );
}

export function MoneyDayLedger({
  ledger,
  focusYmd,
}: {
  ledger: MoneyLedger | null;
  focusYmd?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(focusYmd ?? null);
  const days = useMemo(
    () =>
      ledger
        ? ledger.days.filter((day) => moneyDayHasActivity(day)).toReversed()
        : [],
    [ledger],
  );

  useEffect(() => {
    setReviewing(focusYmd ?? null);
  }, [ledger?.from, ledger?.to, focusYmd]);

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
                  className={`${DAY_GRID} cursor-pointer list-none px-3 py-3 marker:content-none [&::-webkit-details-marker]:hidden`}
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
                    <p className="mt-0.5 text-xs text-slate-500">
                      Efectivo {formatMoney(day.cashSales)}
                      {day.cardSales > 0 ? ` · TPV ${formatMoney(day.cardSales)}` : ''}
                      {day.transferSales > 0 ? ` · Transf. ${formatMoney(day.transferSales)}` : ''}
                      {day.onlineSales > 0 ? ` · Stripe ${formatMoney(day.onlineSales)}` : ''}
                      {day.toAccount > 0 ? ` · Depósito ${formatMoney(day.toAccount)}` : ''}
                    </p>
                  </div>
                  <PocketHead label="Efectivo" amount={day.runningCash} reviewing={reviewingThis} />
                  <PocketHead label="Cuenta" amount={day.runningAccount} reviewing={reviewingThis} />
                  <svg
                    className="mt-1 h-4 w-4 shrink-0 justify-self-end text-slate-400 transition group-open/day:rotate-180"
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
                </summary>
                <DayAudit day={day} yesterday={yesterday} />
              </details>
            </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
