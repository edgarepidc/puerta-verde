'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  cashCloseValidationError,
  formatMoney,
  type CashDrawerLine,
} from '@puertaverde/shared';

import { ActionChip } from '@/components/ActionChip';
import { CashCloseExpected } from '@/components/CashCloseExpected';
import { DecimalInput } from '@/components/DecimalInput';
import { LogoutButton } from '@/components/LogoutButton';
import { PillField, PILL_INPUT_CLASS } from '@/components/PillField';
import { formatMexicoSpokenDay, formatMexicoWeekday } from '@/lib/mexico-date';

const SNOOZE_MS = 5 * 60 * 1000;

type PendingSummary = {
  closingDate: string;
  totals: { cash: number };
  orderCount: number;
  grandTotal: number;
  suggestedOpeningFloat: number | null;
  cashLines?: CashDrawerLine[];
};

function snoozeKey(date: string) {
  return `pv-pending-cash-close-snooze:${date}`;
}

function readSnoozeUntil(date: string): number {
  try {
    const raw = sessionStorage.getItem(snoozeKey(date));
    const until = Number(raw);
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

function writeSnoozeUntil(date: string, until: number) {
  try {
    sessionStorage.setItem(snoozeKey(date), String(until));
  } catch {
    /* private mode */
  }
}

function clearSnooze(date: string) {
  try {
    sessionStorage.removeItem(snoozeKey(date));
  } catch {
    /* private mode */
  }
}

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
  const [ready, setReady] = useState(false);
  const [snoozeUntil, setSnoozeUntil] = useState(0);

  useEffect(() => {
    setSnoozeUntil(readSnoozeUntil(date));
    setReady(true);
  }, [date]);

  useEffect(() => {
    if (!ready) return;
    const remaining = snoozeUntil - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setSnoozeUntil(0), remaining);
    return () => window.clearTimeout(timer);
  }, [ready, snoozeUntil]);

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
          clearSnooze(date);
          setClosed(true);
          return;
        }
        setSummary(payload);
        if (payload.suggestedOpeningFloat != null && openingFloat === '') {
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
    // openingFloat is only used to avoid overwriting a typed fondo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, reloadToken]);

  const visible = ready && !closed && snoozeUntil <= Date.now();

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  function snooze() {
    const until = Date.now() + SNOOZE_MS;
    writeSnoozeUntil(date, until);
    setSnoozeUntil(until);
  }

  useEffect(() => {
    if (!visible) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') snooze();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // snooze closes over `date` from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, date]);

  async function closeYesterday() {
    if (!canClose || !summary) return;
    const validation = cashCloseValidationError({
      countedCash: countedCash === '' ? '' : Number(countedCash),
      openingFloat: openingFloat === '' ? '' : Number(openingFloat),
      cashSales: summary.totals.cash,
      notes,
      cashLines: summary.cashLines,
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
      clearSnooze(date);
      setClosed(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  const cashLines = summary?.cashLines ?? [];
  const spoken = formatMexicoSpokenDay(date);
  const weekday = formatMexicoWeekday(date);

  return (
    <div
      className="pv-modal-overlay fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) snooze();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-cash-close-title"
        className="pv-glass-card w-full max-w-lg p-5 shadow-xl sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Cierre pendiente</p>
        <h2 id="pending-cash-close-title" className="mt-1 text-xl font-semibold text-slate-900">
          Cuadra la caja de ayer
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {spoken}
          {weekday ? ` · ${weekday}` : ''}. Cuenta lo que había en caja al terminar ayer (sin las
          ventas de hoy). Si hay una venta en curso, cierra este aviso: vuelve a salir en 5 minutos.
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
              <dd className="text-xs text-slate-500">Más el fondo, menos pagos en efectivo</dd>
            </div>
          </dl>
        ) : null}

        {canClose && summary ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <PillField label="Fondo inicial" icon="$" className="w-[9.75rem] shrink-0">
                <DecimalInput
                  className={PILL_INPUT_CLASS}
                  value={openingFloat}
                  onChange={setOpeningFloat}
                  groupThousands
                />
              </PillField>
              <PillField label="Efectivo contado" icon="$" className="w-[9.75rem] shrink-0">
                <DecimalInput
                  className={PILL_INPUT_CLASS}
                  value={countedCash}
                  onChange={setCountedCash}
                  groupThousands
                />
              </PillField>
              <PillField label="Notas del cierre" icon="📝" className="min-w-[12rem] flex-1">
                <input
                  type="text"
                  className={PILL_INPUT_CLASS}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ej. faltante de $20 en caja chica"
                />
              </PillField>
            </div>
            {countedCash !== '' || cashLines.length > 0 ? (
              <CashCloseExpected
                openingFloat={openingFloat === '' ? 0 : Number(openingFloat)}
                cashSales={summary.totals.cash}
                cashLines={cashLines}
                countedCash={countedCash === '' ? null : Number(countedCash)}
              />
            ) : (
              <p className="text-sm text-slate-500">Cuenta el efectivo de la caja para poder cerrar.</p>
            )}
          </div>
        ) : null}

        {!canClose ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Pide a quien cierra caja que cuente el efectivo de ayer. Puedes cerrar el aviso para
            vender; vuelve a salir en 5 minutos.
          </p>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <ActionChip tone="slate" onClick={snooze}>
            Seguir vendiendo
          </ActionChip>
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
                    cashLines,
                  }),
                )
              }
              onClick={() => void closeYesterday()}
            >
              {saving ? 'Cerrando…' : 'Cuadrar y cerrar ayer'}
            </ActionChip>
          ) : null}
          {canClose && !summary && !loading ? (
            <div className="flex flex-wrap gap-2">
              <LogoutButton />
              <ActionChip tone="slate" onClick={() => setReloadToken((n) => n + 1)}>
                Reintentar
              </ActionChip>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
