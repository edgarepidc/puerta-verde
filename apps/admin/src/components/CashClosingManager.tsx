'use client';

import { useEffect, useState } from 'react';

import { PAYMENT_METHOD_LABELS, formatMoney, type PaymentMethod } from '@puertaverde/shared';

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

const METHOD_KEYS: PaymentMethod[] = ['cash', 'card_terminal', 'transfer', 'online'];

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

export function CashClosingManager({ canManage = true }: { canManage?: boolean }) {
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [notes, setNotes] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCaja, setOpenCaja] = useState(true);
  const [openDesglose, setOpenDesglose] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/cash-closing');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar la caja');
      setSummary(payload);
      setNotes(payload.closing?.notes ?? '');
      setOpeningFloat(
        payload.closing?.opening_float != null ? String(payload.closing.opening_float) : '',
      );
      setCountedCash(
        payload.closing?.counted_cash != null ? String(payload.closing.counted_cash) : '',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando caja del día...</p>;
  }

  if (!summary) return null;

  const otherTotal =
    Number(summary.totals.card_terminal ?? 0) +
    Number(summary.totals.transfer ?? 0) +
    Number(summary.totals.online ?? 0);
  const expectedCash = Number(openingFloat || 0) + Number(summary.totals.cash);
  const cashDiff =
    countedCash === '' ? null : Number(countedCash) - expectedCash;

  const channelCards = [
    { label: 'Mostrador', emoji: '🛒', iconClass: 'bg-emerald-100', value: summary.channels?.pos },
    { label: 'Tienda web', emoji: '🌐', iconClass: 'bg-sky-100', value: summary.channels?.web },
  ];

  return (
    <div className="space-y-6">
      {!canManage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo lectura · no tienes permiso para cerrar caja.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
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
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Fondo inicial
              <DecimalInput
                placeholder="0"
                className="pv-input mt-2"
                value={openingFloat}
                onChange={setOpeningFloat}
                disabled={Boolean(summary.closing)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Efectivo contado
              <DecimalInput
                placeholder="0"
                className="pv-input mt-2"
                value={countedCash}
                onChange={setCountedCash}
                disabled={Boolean(summary.closing)}
              />
            </label>
          </div>
          {cashDiff != null ? (
            <div className="flex flex-wrap gap-2">
              <ActionChip as="span" emoji="🧮">
                Esperado {formatMoney(expectedCash)}
              </ActionChip>
              <ActionChip as="span" tone={cashDiff < 0 ? 'rose' : 'emerald'} emoji={cashDiff < 0 ? '📉' : '📈'}>
                Diferencia {formatMoney(cashDiff)}
              </ActionChip>
            </div>
          ) : null}
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
    </div>
  );
}
