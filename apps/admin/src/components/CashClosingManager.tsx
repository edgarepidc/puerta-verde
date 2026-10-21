'use client';

import { useEffect, useState } from 'react';

import {
  cashCloseValidationError,
  expectedCashOnHand,
  expectedCashOnHandForCount,
  formatMoney,
  todayMexicoYmd,
  type CashDrawerLine,
  type MoneyLedger,
} from '@puertaverde/shared';

import { FoldableSummary } from '@/components/ActionChip';
import { CashCloseExpected } from '@/components/CashCloseExpected';
import { DecimalInput } from '@/components/DecimalInput';
import { MoneyDayLedger } from '@/components/MoneyDayLedger';
import { PillField, pillInputClass } from '@/components/PillField';
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

const dayButtonOn = 'rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white';
const dayButtonOff =
  'rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50';
const formulaCard = 'flex min-w-[12rem] flex-1 items-center gap-2.5 pv-glass-card px-3 py-2.5';
const formulaLabel = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const formulaValue = 'text-lg font-bold tabular-nums text-slate-900';
const formulaInput =
  'w-full bg-transparent text-lg font-bold tabular-nums text-slate-900 outline-none disabled:cursor-not-allowed';
const editableTotal =
  'w-full rounded-lg border border-emerald-200 bg-white px-2 py-0.5 text-lg font-bold tabular-nums text-slate-900 outline-none focus:border-[#15803d] disabled:cursor-not-allowed disabled:bg-slate-50';
const actionGlow = '!border-emerald-200 !shadow-[0_4px_16px_rgba(21,128,61,0.22)]';

const CARD_MARK = {
  blue: 'bg-sky-100',
  amber: 'bg-amber-100',
  green: 'bg-emerald-100',
  slate: 'bg-slate-100',
} as const;

function CardMark({ emoji, tone }: { emoji: string; tone: keyof typeof CARD_MARK }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${CARD_MARK[tone]}`}
      aria-hidden
    >
      {emoji}
    </span>
  );
}

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
  const [countEdited, setCountEdited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moneyLedger, setMoneyLedger] = useState<MoneyLedger | null>(null);
  // Withdrawals
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalNotes, setWithdrawalNotes] = useState('');
  const [savingWithdrawal, setSavingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [openRetiros, setOpenRetiros] = useState(true);

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
      setCountEdited(false);
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

  function resolveCount(edited = countEdited) {
    const sales = Number(summary?.totals.cash ?? 0);
    const lines = summary?.cashLines ?? [];
    const floatNumber = openingFloat === '' ? 0 : Number(openingFloat);
    const expected = expectedCashOnHand(Number.isFinite(floatNumber) ? floatNumber : 0, sales, lines);
    const locked = Boolean(summary?.closing) || edited;
    return {
      expected,
      sales,
      lines,
      countValue: locked ? countedCash : String(expected),
    };
  }

  async function closeDay() {
    const revising = Boolean(summary?.closing);
    const { countValue, sales, lines } = resolveCount();
    if (revising ? !canRevise : !canManage) {
      setError(
        revising
          ? 'Solo un administrador puede corregir un día ya cerrado'
          : 'No tienes permiso para cerrar caja',
      );
      return;
    }
    const validation = cashCloseValidationError({
      countedCash: countValue === '' ? '' : Number(countValue),
      openingFloat: openingFloat === '' ? '' : Number(openingFloat),
      cashSales: sales,
      notes,
      cashLines: lines,
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
          countedCash: countValue === '' ? null : Number(countValue),
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

  const drawer = resolveCount();
  const countedNumber = drawer.countValue === '' ? null : Number(drawer.countValue);
  const shownExpected = expectedCashOnHandForCount(
    openingFloat === '' ? 0 : Number(openingFloat),
    drawer.sales,
    drawer.lines,
    countedNumber,
  );
  const cashDiff =
    countedNumber == null || !Number.isFinite(countedNumber) ? null : countedNumber - shownExpected;
  const countMatches = cashDiff != null && Math.abs(cashDiff) < 0.009;
  const closeBlocked = Boolean(
    cashCloseValidationError({
      countedCash: drawer.countValue === '' ? '' : Number(drawer.countValue),
      openingFloat: openingFloat === '' ? '' : Number(openingFloat),
      cashSales: drawer.sales,
      notes,
      cashLines: drawer.lines,
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

  return (
    <div className="space-y-6">
      {!canManage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo lectura · no tienes permiso para cerrar caja.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={isToday ? dayButtonOn : dayButtonOff}
          onClick={() => setSelectedDate(todayYmd)}
        >
          Hoy
        </button>
        <button
          type="button"
          className={selectedDate === yesterdayMexicoYmd() ? dayButtonOn : dayButtonOff}
          onClick={() => setSelectedDate(yesterdayMexicoYmd())}
        >
          Ayer
        </button>
        <label className="text-sm text-slate-600">
          <span className="sr-only">Elegir día</span>
          <input
            type="date"
            max={todayYmd}
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800"
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
      <div className="flex flex-wrap items-stretch gap-3">
        <div className={formulaCard}>
          <CardMark emoji="📅" tone="blue" />
          <div className="min-w-0 flex-1">
            <p className={formulaLabel}>Día</p>
            <p className={`${formulaValue} leading-snug`}>
              {formatMexicoSpokenDay(summary.closingDate)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{formatMexicoWeekday(summary.closingDate)}</p>
          </div>
        </div>
        <div className={formulaCard}>
          <CardMark emoji="💵" tone="amber" />
          <div className="min-w-0 flex-1">
            <p className={formulaLabel}>Fondo inicial</p>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-lg font-bold text-slate-400">$</span>
              <DecimalInput
                className={formulaInput}
                value={openingFloat}
                onChange={setOpeningFloat}
                disabled={!canEditClose}
                groupThousands
              />
            </div>
          </div>
        </div>
        <span className="self-center px-1 text-2xl font-medium text-slate-400" aria-hidden>
          +
        </span>
        <div className={formulaCard}>
          <CardMark emoji="🛒" tone="green" />
          <div className="min-w-0 flex-1">
            <p className={formulaLabel}>Venta en efectivo</p>
            <p className={formulaValue}>{formatMoney(drawer.sales)}</p>
          </div>
        </div>
        <span className="self-center px-1 text-2xl font-medium text-slate-400" aria-hidden>
          =
        </span>
        <div className={`${formulaCard} min-w-[18rem] flex-[1.35] ${canEditClose ? actionGlow : ''}`}>
          <CardMark emoji="🧮" tone="slate" />
          <div className="min-w-0 flex-1">
            <label className={formulaLabel} htmlFor="drawer-count">
              Debería haber
            </label>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-lg font-bold text-slate-400">$</span>
              <DecimalInput
                id="drawer-count"
                className={editableTotal}
                value={drawer.countValue}
                onChange={(value) => {
                  setCountEdited(true);
                  setCountedCash(value);
                }}
                disabled={!canEditClose}
                groupThousands
              />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <p className="text-xs text-slate-500">Esperado {formatMoney(shownExpected)}</p>
              {cashDiff == null ? (
                <p className="text-right text-xs text-slate-500">Cuenta el efectivo</p>
              ) : (
                <p
                  className={`text-right text-xs font-semibold ${countMatches || cashDiff > 0 ? 'text-emerald-800' : 'text-rose-700'}`}
                >
                  {countMatches ? 'Cuadra' : `Diferencia ${formatMoney(cashDiff)}`}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <CashCloseExpected
        openingFloat={openingFloat === '' ? 0 : Number(openingFloat)}
        cashSales={drawer.sales}
        cashLines={drawer.lines}
        countedCash={drawer.countValue === '' ? null : Number(drawer.countValue)}
        linesOnly
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[16rem] flex-1">
          <span className="text-sm text-slate-600">Notas</span>
          <input
            type="text"
            className="pv-input mt-1 text-sm disabled:bg-slate-50"
            value={notes}
            disabled={!canEditClose}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Si no cuadra, anota por qué"
          />
        </label>
        {canEditClose ? (
          <button
            type="button"
            className="pv-btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
            disabled={closing || closeBlocked}
            onClick={closeDay}
          >
            {summary.closing
              ? closing
                ? 'Guardando…'
                : 'Guardar cambio'
              : closing
                ? 'Cerrando…'
                : 'Cerrar el día'}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {canEditClose && !summary.closing ? (
        <p className="text-sm text-slate-500">
          El conteo queda en el historial del día. Caja y cuenta siguen las ventas y las compras.
        </p>
      ) : null}
      {summary.closing && canRevise ? (
        <p className="text-sm text-slate-500">
          Puedes corregir el total o la nota. Caja y cuenta siguen las ventas y las compras.
        </p>
      ) : null}
      {summary.closing && !canRevise ? (
        <p className="text-sm text-slate-500">
          Este día ya quedó registrado. Solo un administrador puede corregirlo.
        </p>
      ) : null}

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openRetiros}
        onToggle={(event) => setOpenRetiros(event.currentTarget.open)}
      >
        <FoldableSummary
          plain
          title="Movimientos de efectivo"
          hint={
            withdrawals.length > 0
              ? [
                  toAccountTotal > 0 ? `A cuenta ${formatMoney(toAccountTotal)}` : '',
                  toCashTotal > 0 ? `A efectivo ${formatMoney(toCashTotal)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ') ||
                `${withdrawals.length} movimiento${withdrawals.length === 1 ? '' : 's'}`
              : 'De caja a la cuenta, o de la cuenta a caja para la central'
          }
        />
        <div className="mt-4 space-y-4">
          {canManage ? (
            <div className="flex flex-wrap items-end gap-2">
              <PillField label="Monto" icon="$" tone="emerald" className="w-[9.75rem] shrink-0">
                <DecimalInput
                  placeholder="0"
                  className={pillInputClass('emerald')}
                  value={withdrawalAmount}
                  onChange={setWithdrawalAmount}
                />
              </PillField>
              <label className="block min-w-[12rem] flex-1">
                <span className="text-sm text-slate-600">Notas</span>
                <input
                  type="text"
                  className="pv-input mt-1 text-sm"
                  placeholder="Ej. depósito o central"
                  value={withdrawalNotes}
                  onChange={(e) => setWithdrawalNotes(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="pv-btn-account px-5 py-2.5 text-sm"
                disabled={savingWithdrawal || !withdrawalAmount}
                onClick={() => void saveWithdrawal('account')}
              >
                {savingWithdrawal ? 'Guardando…' : 'A cuenta'}
              </button>
              <button
                type="button"
                className="pv-btn-cash px-5 py-2.5 text-sm"
                disabled={savingWithdrawal || !withdrawalAmount}
                onClick={() => void saveWithdrawal('cash')}
              >
                {savingWithdrawal ? 'Guardando…' : 'A efectivo'}
              </button>
            </div>
          ) : null}
          {withdrawalError ? <p className="text-sm text-red-600">{withdrawalError}</p> : null}
          {canManage ? (
            <p className="text-xs text-slate-500">
              Retiro: caja → cuenta. Traer: cuenta → caja, para comprar en la central.
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
                      title="Eliminar movimiento"
                    >
                      ✕
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
