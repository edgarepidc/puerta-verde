'use client';

import { useEffect, useState } from 'react';

import { PAYMENT_METHOD_LABELS, formatMoney, todayMexicoYmd } from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';
import { DecimalInput } from '@/components/DecimalInput';

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
}

const METHOD_KEYS = ['cash', 'card_terminal', 'transfer', 'online'] as const;

function parseClosingDate(value: string): Date | null {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  const date = iso ? new Date(`${iso}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSpokenDay(value: string): string {
  const date = parseClosingDate(value);
  if (!date) return value;
  const month = date
    .toLocaleDateString('es-MX', { month: 'short' })
    .replace('.', '')
    .toLowerCase();
  const yy = String(date.getFullYear()).slice(-2);
  return `${date.getDate()} ${month} ${yy}`;
}

function formatWeekday(value: string): string {
  const date = parseClosingDate(value);
  if (!date) return '';
  return date.toLocaleDateString('es-MX', { weekday: 'long' }).toLowerCase();
}

function yesterdayMexicoYmd(): string {
  const today = todayMexicoYmd();
  const d = new Date(`${today}T12:00:00-06:00`);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface Withdrawal {
  id: string;
  amount: number;
  withdrawal_date: string;
  withdrawn_at: string;
  notes: string | null;
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
  const [openRetiros, setOpenRetiros] = useState(false);

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
        payload.closing?.opening_float != null ? String(payload.closing.opening_float) : '',
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

  async function saveWithdrawal() {
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
        body: JSON.stringify({ amount, notes: withdrawalNotes, date: selectedDate }),
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
    setClosing(true);
    setError(null);
    try {
      const response = await fetch('/api/cash-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
  const expectedCash = Number(openingFloat || 0) + Number(summary?.totals.cash ?? 0);
  const cashDiff =
    countedCash === '' ? null : Number(countedCash) - expectedCash;

  const channelCards = [
    { label: 'Mostrador', emoji: '🛒', iconClass: 'bg-emerald-100', value: summary?.channels?.pos },
    { label: 'Tienda web', emoji: '🌐', iconClass: 'bg-sky-100', value: summary?.channels?.web },
  ];

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
              {formatSpokenDay(summary.closingDate)}
            </p>
            <p className="text-xs text-slate-500">{formatWeekday(summary.closingDate)}</p>
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
              ? `Cerrado hoy · ${summary.branchName}`
              : `Fondo, conteo y notas · ${summary.branchName}`
          }
          emoji="🧾"
          iconClass="bg-rose-100"
          actions={
            summary.closing ? (
              <ActionChip as="span" emoji="✅" elevated={false}>
                Cerrado hoy
              </ActionChip>
            ) : undefined
          }
        />

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm font-medium text-slate-700">
              Fondo inicial
              <DecimalInput
                placeholder="0"
                className="pv-input mt-1 w-32"
                value={openingFloat}
                onChange={setOpeningFloat}
                disabled={Boolean(summary.closing)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Efectivo contado
              <DecimalInput
                placeholder="0"
                className="pv-input mt-1 w-32"
                value={countedCash}
                onChange={setCountedCash}
                disabled={Boolean(summary.closing)}
              />
            </label>
            {cashDiff != null ? (
              <>
                <ActionChip as="span" emoji="🧮">
                  Esperado {formatMoney(expectedCash)}
                </ActionChip>
                <ActionChip as="span" tone={cashDiff < 0 ? 'rose' : 'emerald'} emoji={cashDiff < 0 ? '📉' : '📈'}>
                  Diferencia {formatMoney(cashDiff)}
                </ActionChip>
              </>
            ) : null}
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Notas del cierre
            <textarea
              className="pv-input mt-2"
              rows={3}
              value={notes}
              disabled={!canManage || Boolean(summary.closing)}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. faltante de $20 en caja chica"
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {canManage ? (
            <ActionChip
              size="lg"
              emoji="💰"
              tone={summary.closing ? 'slate' : 'emerald'}
              disabled={closing || Boolean(summary.closing)}
              onClick={closeDay}
            >
              {summary.closing ? 'Caja cerrada' : closing ? 'Cerrando…' : 'Cerrar caja del día'}
            </ActionChip>
          ) : null}
        </div>
      </details>

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openRetiros}
        onToggle={(event) => setOpenRetiros(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Retiros de efectivo"
          hint={
            withdrawals.length > 0
              ? `${withdrawals.length} retiro${withdrawals.length === 1 ? '' : 's'} · ${formatMoney(withdrawals.reduce((s, w) => s + Number(w.amount), 0))}`
              : 'Mueve efectivo a la cuenta bancaria'
          }
          emoji="💸"
          iconClass="bg-violet-100"
          actions={
            withdrawals.length > 0 ? (
              <ActionChip as="span" emoji="💜" tone="slate" elevated={false}>
                {formatMoney(withdrawals.reduce((s, w) => s + Number(w.amount), 0))}
              </ActionChip>
            ) : undefined
          }
        />
        <div className="mt-4 space-y-4">
          {canManage ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Monto a retirar
                <DecimalInput
                  placeholder="0"
                  className="pv-input mt-2"
                  value={withdrawalAmount}
                  onChange={setWithdrawalAmount}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Notas (opcional)
                <input
                  type="text"
                  className="pv-input mt-2"
                  placeholder="Ej. depósito bancario"
                  value={withdrawalNotes}
                  onChange={(e) => setWithdrawalNotes(e.target.value)}
                />
              </label>
            </div>
          ) : null}
          {withdrawalError ? <p className="text-sm text-red-600">{withdrawalError}</p> : null}
          {canManage ? (
            <ActionChip
              size="lg"
              emoji="💸"
              tone="slate"
              disabled={savingWithdrawal || !withdrawalAmount}
              onClick={saveWithdrawal}
            >
              {savingWithdrawal ? 'Guardando…' : 'Registrar retiro'}
            </ActionChip>
          ) : null}
          {withdrawals.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums text-slate-900">{formatMoney(Number(w.amount))}</p>
                    {w.notes ? <p className="text-xs text-slate-500">{w.notes}</p> : null}
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                      onClick={() => void deleteWithdrawal(w.id)}
                      title="Eliminar retiro"
                    >
                      ✕
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Sin retiros registrados hoy.</p>
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
