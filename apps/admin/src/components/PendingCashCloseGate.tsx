'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  cashCloseValidationError,
  expectedCashOnHand,
  formatMoney,
} from '@puertaverde/shared';

import { ActionChip } from '@/components/ActionChip';
import { DecimalInput } from '@/components/DecimalInput';
import { LogoutButton } from '@/components/LogoutButton';
import { formatMexicoSpokenDay, formatMexicoWeekday } from '@/lib/mexico-date';

type PendingSummary = {
  closingDate: string;
  totals: { cash: number };
  orderCount: number;
  grandTotal: number;
  suggestedOpeningFloat: number | null;
};

export function PendingCashCloseGate({
  date,
  canClose,
}: {
  date: string;
  canClose: boolean;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [notes, setNotes] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/cash-closing?date=${date}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar la caja de ayer');
        if (cancelled) return;
        if (payload.closing) {
          setClosed(true);
          return;
        }
        setSummary(payload);
        if (payload.suggestedOpeningFloat != null) {
          setOpeningFloat(String(payload.suggestedOpeningFloat));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [date, reloadToken]);

  useEffect(() => {
    if (closed) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [closed]);

  async function closeYesterday() {
    if (!canClose || !summary) return;
    const validation = cashCloseValidationError({
      countedCash: countedCash === '' ? '' : Number(countedCash),
      openingFloat: openingFloat === '' ? '' : Number(openingFloat),
      cashSales: summary.totals.cash,
      notes,
    });
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/cash-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          notes,
          openingFloat: openingFloat === '' ? null : Number(openingFloat),
          countedCash: countedCash === '' ? null : Number(countedCash),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo cerrar la caja');
      setClosed(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  if (closed) return null;

  const expected = expectedCashOnHand(
    openingFloat === '' ? 0 : Number(openingFloat),
    summary?.totals.cash ?? 0,
  );
  const cashDiff = countedCash === '' ? null : Number(countedCash) - expected;
  const spoken = formatMexicoSpokenDay(date);
  const weekday = formatMexicoWeekday(date);

  return (
    <div
      className="pv-modal-overlay fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto p-4 sm:items-center"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-cash-close-title"
        className="pv-glass-card w-full max-w-lg p-5 shadow-xl sm:p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Cierre pendiente</p>
        <h2 id="pending-cash-close-title" className="mt-1 text-xl font-semibold text-slate-900">
          Cuadra la caja de ayer
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {spoken}
          {weekday ? ` · ${weekday}` : ''}. Cuenta lo que había en caja al terminar ayer (sin las
          ventas de hoy) antes de seguir.
        </p>

        {loading ? <p className="mt-4 text-sm text-slate-500">Cargando ventas de ayer…</p> : null}

        {summary ? (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ventas</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
                {formatMoney(summary.grandTotal)}
              </dd>
              <dd className="text-xs text-slate-500">
                {summary.orderCount} pago{summary.orderCount === 1 ? '' : 's'}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Efectivo vendido
              </dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
                {formatMoney(summary.totals.cash)}
              </dd>
              <dd className="text-xs text-slate-500">Más el fondo, lo esperado</dd>
            </div>
          </dl>
        ) : null}

        {canClose && summary ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Fondo inicial
                <DecimalInput
                  className="pv-input mt-1 w-36"
                  value={openingFloat}
                  onChange={setOpeningFloat}
                  groupThousands
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Efectivo contado
                <DecimalInput
                  className="pv-input mt-1 w-36"
                  value={countedCash}
                  onChange={setCountedCash}
                  groupThousands
                />
              </label>
            </div>
            {cashDiff != null ? (
              <p className={`text-sm font-medium ${cashDiff < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                Esperado {formatMoney(expected)} · diferencia {formatMoney(cashDiff)}
              </p>
            ) : (
              <p className="text-sm text-slate-500">Cuenta el efectivo de la caja para poder cerrar.</p>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Notas {cashDiff != null && cashDiff !== 0 ? '(obligatorias si no cuadra)' : '(si hay diferencia)'}
              <textarea
                className="pv-input mt-2"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ej. faltante de $20 en caja chica"
              />
            </label>
          </div>
        ) : null}

        {!canClose ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Pide a quien cierra caja que entre y cuente el efectivo de ayer. Mientras tanto no se
            puede seguir en el admin.
          </p>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {!canClose || (!summary && !loading) ? <LogoutButton /> : <span />}
          {canClose && summary ? (
            <ActionChip
              size="lg"
              emoji="💰"
              tone="emerald"
              disabled={
                saving ||
                loading ||
                Boolean(
                  cashCloseValidationError({
                    countedCash: countedCash === '' ? '' : Number(countedCash),
                    openingFloat: openingFloat === '' ? '' : Number(openingFloat),
                    cashSales: summary.totals.cash,
                    notes,
                  }),
                )
              }
              onClick={() => void closeYesterday()}
            >
              {saving ? 'Cerrando…' : 'Cuadrar y cerrar ayer'}
            </ActionChip>
          ) : null}
          {canClose && !summary && !loading ? (
            <ActionChip tone="slate" onClick={() => setReloadToken((n) => n + 1)}>
              Reintentar
            </ActionChip>
          ) : null}
        </div>
      </section>
    </div>
  );
}
