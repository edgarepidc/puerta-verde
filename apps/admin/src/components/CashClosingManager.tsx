'use client';

import { useEffect, useState } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  cashCloseValidationError,
  expectedCashOnHandForCount,
  formatMoney,
  todayMexicoYmd,
  type CashDrawerLine,
  type MoneyLedger,
} from '@puertaverde/shared';

import { PlainButton, QuietField, TextSummary, quietInputClass } from '@/components/ActionChip';
import { CashCloseExpected } from '@/components/CashCloseExpected';
import { DecimalInput } from '@/components/DecimalInput';
import { MoneyDayLedger } from '@/components/MoneyDayLedger';
import {
  formatMexicoSpokenDay,
  formatMexicoWeekday,
  mexicoCalendarMonthRange,
  yesterdayMexicoYmd,
} from '@/lib/mexico-date';

interface ChannelTotals {
  cash: number;
  card_terminal: number;
  transfer: number;
  online: number;
  orderCount: number;
  total: number;
}

interface CashSummary {
  closingDate: string;
  branchName: string;
  totals: { cash: number; card_terminal: number; transfer: number; online: number };
  channels: { pos: ChannelTotals; web: ChannelTotals };
  orderCount: number;
  grandTotal: number;
  closing: {
    id: string;
    notes: string | null;
    opening_float?: number | null;
    counted_cash?: number | null;
    created_at: string;
  } | null;
  suggestedOpeningFloat?: number | null;
  cashLines?: CashDrawerLine[];
}

const METHOD_KEYS = ['cash', 'card_terminal', 'transfer', 'online'] as const;

interface Withdrawal {
  id: string;
  amount: number;
  withdrawal_date: string;
  withdrawn_at: string;
  notes: string | null;
  destination?: 'cash' | 'account' | null;
}

export function CashClosingManager({
  canManage = true,
  canRevise = false,
}: {
  canManage?: boolean;
  canRevise?: boolean;
}) {
  const todayYmd = todayMexicoYmd();
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [notes, setNotes] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState(false);
  const [moneyLedger, setMoneyLedger] = useState<MoneyLedger | null>(null);
  // Withdrawals
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalNotes, setWithdrawalNotes] = useState('');
  const [savingWithdrawal, setSavingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [openRetiros, setOpenRetiros] = useState(false);

  async function load(date?: string) {
    setLoading(true);
    setError(null);
    const d = date ?? selectedDate;
    const month = mexicoCalendarMonthRange(d);
    try {
      const [cashRes, wdRes, moneyRes] = await Promise.all([
        fetch(`/api/cash-closing?date=${d}`),
        fetch(`/api/cash-withdrawals?date=${d}`),
        fetch(`/api/money-position?from=${month.start}&to=${month.end}`),
      ]);
      const payload = await cashRes.json();
      if (!cashRes.ok) throw new Error(payload.error ?? 'No se pudo cargar la caja');
      setSummary(payload);
      setNotes(payload.closing?.notes ?? '');
      setOpeningFloat(
        payload.closing?.opening_float != null
          ? String(payload.closing.opening_float)
          : payload.suggestedOpeningFloat != null
            ? String(payload.suggestedOpeningFloat)
            : '',
      );
      setCountedCash(
        payload.closing?.counted_cash != null ? String(payload.closing.counted_cash) : '',
      );
      const wdPayload = await wdRes.json();
      setWithdrawals(wdPayload.withdrawals ?? []);
      if (moneyRes.ok) {
        const moneyPayload = await moneyRes.json();
        setMoneyLedger(moneyPayload.ledger ?? null);
      } else {
        setMoneyLedger(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function saveWithdrawal(destination: 'cash' | 'account') {
    const amount = Number(withdrawalAmount);
    if (!amount || amount <= 0) {
      setWithdrawalError('Ingresa un monto válido');
      return;
    }
    setSavingWithdrawal(true);
    setWithdrawalError(null);
    try {
      const response = await fetch('/api/cash-withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          notes: withdrawalNotes,
          date: selectedDate,
          destination,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo registrar');
      setWithdrawals((current) => [payload.withdrawal, ...current]);
      setWithdrawalAmount('');
      setWithdrawalNotes('');
    } catch (err) {
      setWithdrawalError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingWithdrawal(false);
    }
  }

  async function deleteWithdrawal(id: string) {
    try {
      const response = await fetch(`/api/cash-withdrawals?id=${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? 'No se pudo eliminar');
      }
      setWithdrawals((current) => current.filter((w) => w.id !== id));
    } catch (err) {
      setWithdrawalError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  useEffect(() => {
    load(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  async function closeDay() {
    const revising = Boolean(summary?.closing);
    if (revising ? !canRevise : !canManage) {
      setError(
        revising
          ? 'Solo un administrador puede corregir un día ya cerrado'
          : 'No tienes permiso para cerrar caja',
      );
      return;
    }
    const validation = cashCloseValidationError({
      countedCash: countedCash === '' ? '' : Number(countedCash),
      openingFloat: openingFloat === '' ? '' : Number(openingFloat),
      cashSales: Number(summary?.totals.cash ?? 0),
      notes,
      cashLines: summary?.cashLines,
    });
    if (validation) {
      setError(validation);
      return;
    }
    setClosing(true);
    setError(null);
    try {
      const response = await fetch('/api/cash-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          notes,
          openingFloat: openingFloat === '' ? null : Number(openingFloat),
          countedCash: countedCash === '' ? null : Number(countedCash),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo cerrar la caja');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setClosing(false);
    }
  }

  const closeBlocked = Boolean(
    cashCloseValidationError({
      countedCash: countedCash === '' ? '' : Number(countedCash),
      openingFloat: openingFloat === '' ? '' : Number(openingFloat),
      cashSales: Number(summary?.totals.cash ?? 0),
      notes,
      cashLines: summary?.cashLines,
    }),
  );

  const toAccountTotal = withdrawals
    .filter((w) => w.destination !== 'cash')
    .reduce((sum, w) => sum + Number(w.amount), 0);
  const toCashTotal = withdrawals
    .filter((w) => w.destination === 'cash')
    .reduce((sum, w) => sum + Number(w.amount), 0);

  const isToday = selectedDate === todayYmd;
  const dayClosed = Boolean(summary?.closing);
  const canEditClose = dayClosed ? canRevise : canManage;
  const countedNumber =
    countedCash === '' || !Number.isFinite(Number(countedCash)) ? null : Number(countedCash);
  const expectedInDrawer = summary
    ? expectedCashOnHandForCount(
        openingFloat === '' ? 0 : Number(openingFloat),
        Number(summary.totals.cash ?? 0),
        summary.cashLines ?? [],
        countedNumber,
      )
    : 0;
  const drawerGap =
    countedNumber == null ? null : Math.round((countedNumber - expectedInDrawer) * 100) / 100;
  const drawerOff = drawerGap != null && Math.abs(drawerGap) > 0.009;

  return (
    <div className="space-y-6">
      {!canManage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo lectura · no tienes permiso para cerrar caja.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <PlainButton primary={isToday} onClick={() => setSelectedDate(todayYmd)}>
          Hoy
        </PlainButton>
        <PlainButton
          primary={selectedDate === yesterdayMexicoYmd()}
          onClick={() => setSelectedDate(yesterdayMexicoYmd())}
        >
          Ayer
        </PlainButton>
        <label className="w-40 text-sm text-slate-600">
          <span className="sr-only">Elegir día</span>
          <input
            type="date"
            max={todayYmd}
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            className={quietInputClass}
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando caja…</p>
      ) : !summary ? (
        <p className="text-sm text-slate-500">Sin datos para este día.</p>
      ) : null}

      {summary ? (
        <>
      <section className="space-y-4">
        <div>
          <p className="text-sm text-slate-500">
            {formatMexicoSpokenDay(summary.closingDate)}
            {formatMexicoWeekday(summary.closingDate) ? ` · ${formatMexicoWeekday(summary.closingDate)}` : ''}
          </p>
          <h2 className="mt-1 text-sm font-medium text-slate-600">En caja</h2>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-slate-900">
            {formatMoney(expectedInDrawer)}
          </p>
        </div>
        <QuietField label="Efectivo contado" className="max-w-xs">
          <DecimalInput
            className={quietInputClass}
            value={countedCash}
            onChange={setCountedCash}
            disabled={!canEditClose}
            groupThousands
          />
        </QuietField>
        <p className={`text-sm font-medium ${drawerOff ? 'text-rose-700' : 'text-slate-700'}`}>
          {drawerGap == null
            ? 'Cuenta el efectivo de la caja.'
            : drawerOff
              ? drawerGap < 0
                ? `Faltan ${formatMoney(Math.abs(drawerGap))}`
                : `Sobran ${formatMoney(drawerGap)}`
              : 'Cuadra.'}
        </p>
        {drawerOff || summary.closing ? (
          <QuietField label={drawerOff ? 'Por qué no cuadra' : 'Nota'} className="max-w-lg">
            <input
              type="text"
              className={quietInputClass}
              value={notes}
              disabled={!canEditClose}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. faltan $20"
            />
          </QuietField>
        ) : null}
        {canEditClose ? (
          <PlainButton primary disabled={closing || closeBlocked} onClick={closeDay}>
            {summary.closing
              ? closing
                ? 'Guardando…'
                : 'Guardar cambio'
              : closing
                ? 'Cerrando…'
                : 'Cerrar caja'}
          </PlainButton>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {canEditClose && !summary.closing ? (
          <p className="text-sm text-slate-500">
            El conteo queda en el historial del día. Caja y cuenta siguen las ventas y las compras.
          </p>
        ) : null}
        {summary.closing && canRevise ? (
          <p className="text-sm text-slate-500">
            Puedes corregir el conteo o la nota. Caja y cuenta siguen las ventas y las compras.
          </p>
        ) : null}
        {summary.closing && !canRevise ? (
          <p className="text-sm text-slate-500">
            Este día ya quedó registrado. Solo un administrador puede corregirlo.
          </p>
        ) : null}
      </section>

      <details
        className="group border-t border-slate-200 pt-4"
        open={openSource}
        onToggle={(event) => setOpenSource(event.currentTarget.open)}
      >
        <TextSummary
          title="De dónde sale"
          hint="Fondo, ventas en efectivo y lo que salió de la caja"
        />
        <div className="mt-4 max-w-xs">
          <QuietField label="Fondo inicial">
            <DecimalInput
              className={quietInputClass}
              value={openingFloat}
              onChange={setOpeningFloat}
              disabled={!canEditClose}
              groupThousands
            />
          </QuietField>
        </div>
        <div className="mt-4">
          <CashCloseExpected
            openingFloat={openingFloat === '' ? 0 : Number(openingFloat)}
            cashSales={Number(summary.totals.cash)}
            cashLines={summary.cashLines ?? []}
            countedCash={countedNumber}
          />
        </div>
      </details>

      <section className="space-y-3 border-t border-slate-200 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">El día</h2>
          <p className="text-sm tabular-nums text-slate-500">
            {`Total ${formatMoney(summary.grandTotal)} · ${summary.orderCount} ${summary.orderCount === 1 ? 'pago' : 'pagos'}`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {METHOD_KEYS.map((method) => (
            <div key={method}>
              <dt className="text-sm text-slate-500">{PAYMENT_METHOD_LABELS[method]}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                {formatMoney(Number(summary.totals[method] ?? 0))}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <details
        className="group border-t border-slate-200 pt-4"
        open={openRetiros}
        onToggle={(event) => setOpenRetiros(event.currentTarget.open)}
      >
        <TextSummary
          title="Pasar dinero"
          hint={
            withdrawals.length > 0
              ? [
                  toAccountTotal > 0 ? `A cuenta ${formatMoney(toAccountTotal)}` : '',
                  toCashTotal > 0 ? `A efectivo ${formatMoney(toCashTotal)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || `${withdrawals.length} movimiento${withdrawals.length === 1 ? '' : 's'}`
              : 'De caja a cuenta, o de cuenta a caja'
          }
        />
        <div className="mt-4 space-y-4">
          {canManage ? (
            <div className="flex flex-wrap items-end gap-2">
              <QuietField label="Monto" className="w-40">
                <DecimalInput
                  placeholder="0"
                  className={quietInputClass}
                  value={withdrawalAmount}
                  onChange={setWithdrawalAmount}
                />
              </QuietField>
              <QuietField label="Nota" className="min-w-[12rem] flex-1">
                <input
                  type="text"
                  className={quietInputClass}
                  placeholder="Depósito o central"
                  value={withdrawalNotes}
                  onChange={(e) => setWithdrawalNotes(e.target.value)}
                />
              </QuietField>
              <PlainButton
                disabled={savingWithdrawal || !withdrawalAmount}
                onClick={() => void saveWithdrawal('account')}
              >
                {savingWithdrawal ? 'Guardando…' : 'A cuenta'}
              </PlainButton>
              <PlainButton
                disabled={savingWithdrawal || !withdrawalAmount}
                onClick={() => void saveWithdrawal('cash')}
              >
                {savingWithdrawal ? 'Guardando…' : 'A efectivo'}
              </PlainButton>
            </div>
          ) : null}
          {withdrawalError ? <p className="text-sm text-red-600">{withdrawalError}</p> : null}
          {canManage ? (
            <p className="text-sm text-slate-500">
              A cuenta saca el efectivo de la caja. A efectivo lo trae de la cuenta, para comprar en la central.
            </p>
          ) : null}
          {withdrawals.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
              {withdrawals.map((w) => {
                const toCash = w.destination === 'cash';
                return (
                <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums text-slate-900">{formatMoney(Number(w.amount))}</p>
                    <p className="text-xs text-slate-500">
                      {toCash ? 'Cuenta → efectivo' : 'Efectivo → cuenta'}
                      {w.notes ? ` · ${w.notes}` : ''}
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                      onClick={() => void deleteWithdrawal(w.id)}
                      title="Quitar movimiento"
                    >
                      Quitar
                    </button>
                  ) : null}
                </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Sin movimientos registrados hoy.</p>
          )}
        </div>
      </details>

      <MoneyDayLedger ledger={moneyLedger} focusYmd={selectedDate} />
      </>) : null}
    </div>
  );
}
