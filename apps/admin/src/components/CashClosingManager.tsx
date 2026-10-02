'use client';

import { useEffect, useState } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  cashCloseValidationError,
  formatMoney,
  todayMexicoYmd,
  type CashDrawerLine,
} from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';
import { CashCloseExpected } from '@/components/CashCloseExpected';
import { DecimalInput } from '@/components/DecimalInput';
import { PillField, pillInputClass } from '@/components/PillField';
import { formatMexicoSpokenDay, formatMexicoWeekday, yesterdayMexicoYmd } from '@/lib/mexico-date';

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

export function CashClosingManager({ canManage = true }: { canManage?: boolean }) {
  const todayYmd = todayMexicoYmd();
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [notes, setNotes] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCaja, setOpenCaja] = useState(true);
  const [openDesglose, setOpenDesglose] = useState(false);
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
    try {
      const [cashRes, wdRes] = await Promise.all([
        fetch(`/api/cash-closing?date=${d}`),
        fetch(`/api/cash-withdrawals?date=${d}`),
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
    if (!canManage) {
      setError('No tienes permiso para cerrar caja');
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

  const otherTotal =
    Number(summary?.totals.card_terminal ?? 0) +
    Number(summary?.totals.transfer ?? 0) +
    Number(summary?.totals.online ?? 0);
  const closeBlocked = Boolean(
    cashCloseValidationError({
      countedCash: countedCash === '' ? '' : Number(countedCash),
      openingFloat: openingFloat === '' ? '' : Number(openingFloat),
      cashSales: Number(summary?.totals.cash ?? 0),
      notes,
      cashLines: summary?.cashLines,
    }),
  );

  const channelCards = [
    { label: 'Mostrador', emoji: '🛒', iconClass: 'bg-emerald-100', value: summary?.channels?.pos },
    { label: 'Tienda web', emoji: '🌐', iconClass: 'bg-sky-100', value: summary?.channels?.web },
  ];

  const toAccountTotal = withdrawals
    .filter((w) => w.destination !== 'cash')
    .reduce((sum, w) => sum + Number(w.amount), 0);
  const toCashTotal = withdrawals
    .filter((w) => w.destination === 'cash')
    .reduce((sum, w) => sum + Number(w.amount), 0);

  const isToday = selectedDate === todayYmd;

  return (
    <div className="space-y-6">
      {!canManage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo lectura · no tienes permiso para cerrar caja.
        </p>
      ) : null}

      {/* Day filter */}
      <div className="flex flex-wrap items-center gap-2">
        <ActionChip
          tone={isToday ? 'emerald' : 'slate'}
          elevated={isToday}
          onClick={() => setSelectedDate(todayYmd)}
        >
          Hoy
        </ActionChip>
        <ActionChip
          tone={selectedDate === yesterdayMexicoYmd() ? 'emerald' : 'slate'}
          elevated={selectedDate === yesterdayMexicoYmd()}
          onClick={() => setSelectedDate(yesterdayMexicoYmd())}
        >
          Ayer
        </ActionChip>
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          <span>📅</span>
          <input
            type="date"
            max={todayYmd}
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            className="pv-input h-8 py-1 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando caja…</p>
      ) : !summary ? (
        <p className="text-sm text-slate-500">Sin datos para este día.</p>
      ) : null}

      {summary ? (<><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="pv-glass-card flex gap-3 p-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xl"
            aria-hidden
          >
            📅
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Día
            </p>
            <p className="mt-0.5 text-xl font-bold leading-snug text-slate-900">
              {formatMexicoSpokenDay(summary.closingDate)}
            </p>
            <p className="text-xs text-slate-500">{formatMexicoWeekday(summary.closingDate)}</p>
          </div>
        </div>
        <div className="pv-glass-card flex gap-3 p-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl"
            aria-hidden
          >
            💰
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Total del día
            </p>
            <p className="mt-0.5 text-xl font-bold text-emerald-800">
              {formatMoney(summary.grandTotal)}
            </p>
            <p className="text-xs text-slate-500">
              {summary.orderCount} pago{summary.orderCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="pv-glass-card flex gap-3 p-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xl"
            aria-hidden
          >
            💵
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Efectivo
            </p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">
              {formatMoney(summary.totals.cash ?? 0)}
            </p>
            <p className="text-xs text-slate-500">Debería haber en caja</p>
          </div>
        </div>
        <div className="pv-glass-card flex gap-3 p-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl"
            aria-hidden
          >
            💳
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Otros pagos
            </p>
            <p className="mt-0.5 text-xl font-bold text-amber-800">{formatMoney(otherTotal)}</p>
            <p className="text-xs text-slate-500">
              {METHOD_KEYS.filter((method) => method !== 'cash')
                .map((method) => PAYMENT_METHOD_LABELS[method])
                .join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openCaja}
        onToggle={(event) => setOpenCaja(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Cerrar caja"
          hint={
            summary.closing
              ? `Cerrado · ${summary.branchName}`
              : `Fondo, conteo y notas · ${summary.branchName}`
          }
          emoji="🧾"
          iconClass="bg-rose-100"
          actions={
            summary.closing ? (
              <ActionChip as="span" emoji="✅" elevated={false}>
                Cerrado
              </ActionChip>
            ) : undefined
          }
        />

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <PillField
              label="Fondo inicial"
              icon="$"
              tone="slate"
              className="w-[9.75rem] shrink-0"
              disabled={Boolean(summary.closing)}
            >
              <DecimalInput
                className={pillInputClass('slate')}
                value={openingFloat}
                onChange={setOpeningFloat}
                disabled={Boolean(summary.closing)}
                groupThousands
              />
            </PillField>
            <PillField
              label="Efectivo contado"
              icon="$"
              tone="emerald"
              className="w-[9.75rem] shrink-0"
              disabled={Boolean(summary.closing)}
            >
              <DecimalInput
                className={pillInputClass('emerald')}
                value={countedCash}
                onChange={setCountedCash}
                disabled={Boolean(summary.closing)}
                groupThousands
              />
            </PillField>
            <PillField
              label="Notas del cierre"
              icon="📝"
              tone="sky"
              className="min-w-[10rem] flex-1"
              disabled={!canManage || Boolean(summary.closing)}
            >
              <input
                type="text"
                className={pillInputClass('sky')}
                value={notes}
                disabled={!canManage || Boolean(summary.closing)}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Obligatorias si hay diferencia, ej. faltante de $20"
              />
            </PillField>
            {canManage ? (
              <ActionChip
                className="shrink-0"
                emoji="💰"
                tone={summary.closing ? 'slate' : 'amber'}
                disabled={closing || Boolean(summary.closing) || closeBlocked}
                onClick={closeDay}
              >
                {summary.closing ? 'Caja cerrada' : closing ? 'Cerrando…' : 'Cerrar caja del día'}
              </ActionChip>
            ) : null}
          </div>
          {countedCash !== '' || (summary.cashLines?.length ?? 0) > 0 ? (
            <CashCloseExpected
              openingFloat={openingFloat === '' ? 0 : Number(openingFloat)}
              cashSales={Number(summary.totals.cash)}
              cashLines={summary.cashLines ?? []}
              countedCash={countedCash === '' ? null : Number(countedCash)}
            />
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {canManage && !summary.closing ? (
            <p className="text-xs text-slate-500">
              El conteo es obligatorio. Si no cuadra, anota por qué.
            </p>
          ) : null}
        </div>
      </details>

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openRetiros}
        onToggle={(event) => setOpenRetiros(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Movimientos de efectivo"
          hint={
            withdrawals.length > 0
              ? `${withdrawals.length} movimiento${withdrawals.length === 1 ? '' : 's'}`
              : 'De caja a la cuenta, o de la cuenta a caja para la central'
          }
          emoji="💸"
          iconClass="bg-violet-100"
          actions={
            withdrawals.length > 0 ? (
              <>
                {toAccountTotal > 0 ? (
                  <ActionChip as="span" emoji="💜" tone="slate" elevated={false}>
                    A cuenta {formatMoney(toAccountTotal)}
                  </ActionChip>
                ) : null}
                {toCashTotal > 0 ? (
                  <ActionChip as="span" emoji="💵" tone="emerald" elevated={false}>
                    A efectivo {formatMoney(toCashTotal)}
                  </ActionChip>
                ) : null}
              </>
            ) : undefined
          }
        />
        <div className="mt-4 space-y-4">
          {canManage ? (
            <div className="flex flex-wrap items-end gap-2">
              <PillField label="Monto" icon="$" tone="amber" className="w-[9.75rem] shrink-0">
                <DecimalInput
                  placeholder="0"
                  className={pillInputClass('amber')}
                  value={withdrawalAmount}
                  onChange={setWithdrawalAmount}
                />
              </PillField>
              <PillField label="Notas (opcional)" icon="📝" tone="slate" className="min-w-[10rem] flex-1">
                <input
                  type="text"
                  className={pillInputClass('slate')}
                  placeholder="Ej. depósito o central"
                  value={withdrawalNotes}
                  onChange={(e) => setWithdrawalNotes(e.target.value)}
                />
              </PillField>
              <ActionChip
                className="shrink-0"
                emoji="💸"
                tone="sky"
                disabled={savingWithdrawal || !withdrawalAmount}
                onClick={() => void saveWithdrawal('account')}
              >
                {savingWithdrawal ? 'Guardando…' : 'Registrar retiro'}
              </ActionChip>
              <ActionChip
                className="shrink-0"
                emoji="💵"
                tone="emerald"
                disabled={savingWithdrawal || !withdrawalAmount}
                onClick={() => void saveWithdrawal('cash')}
              >
                {savingWithdrawal ? 'Guardando…' : 'Traer a efectivo'}
              </ActionChip>
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

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openDesglose}
        onToggle={(event) => setOpenDesglose(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Desglose"
          hint="Mostrador y tienda web"
          emoji="📊"
          iconClass="bg-violet-100"
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {channelCards.map((channel) => (
            <div key={channel.label} className="rounded-xl border border-slate-100 bg-white p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${channel.iconClass}`}
                  aria-hidden
                >
                  {channel.emoji}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{channel.label}</h3>
                  <p className="text-sm text-slate-500">
                    {channel.value?.orderCount ?? 0} venta
                    {(channel.value?.orderCount ?? 0) === 1 ? '' : 's'} ·{' '}
                    {formatMoney(channel.value?.total ?? 0)}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {METHOD_KEYS.map((method) => (
                  <li key={method} className="flex justify-between gap-3">
                    <span>{PAYMENT_METHOD_LABELS[method]}</span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(channel.value?.[method] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
      </>) : null}
    </div>
  );
}
