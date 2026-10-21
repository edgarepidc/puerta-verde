'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  cashCloseValidationError,
  type CashDrawerLine,
} from '@puertaverde/shared';

import { ActionChip } from '@/components/ActionChip';
import { CashCloseFormula, resolveDrawerCount } from '@/components/CashCloseFormula';
import { LogoutButton } from '@/components/LogoutButton';
import { formatMexicoSpokenDay, formatMexicoWeekday } from '@/lib/mexico-date';

const SNOOZE_MS = 4 * 60 * 1000;

type PendingDay = {
  closingDate: string;
  totals: { cash: number };
  closing: { notes: string | null } | null;
  suggestedOpeningFloat?: number | null;
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

function reminderName(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first || 'Usuario';
}

export function PendingCashCloseGate({
  date,
  canClose,
  userName = '',
}: {
  date: string;
  canClose: boolean;
  userName?: string;
}) {
  const router = useRouter();
  const [day, setDay] = useState<PendingDay | null>(null);
  const [notes, setNotes] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [countEdited, setCountEdited] = useState(false);
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
        setDay(payload);
        setNotes(payload.closing?.notes ?? '');
        setOpeningFloat(
          payload.suggestedOpeningFloat != null ? String(payload.suggestedOpeningFloat) : '',
        );
        setCountedCash('');
        setCountEdited(false);
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

  async function closeYesterday() {
    if (!canClose || !day) return;
    const drawer = resolveDrawerCount({
      openingFloat,
      cashSales: Number(day.totals.cash ?? 0),
      cashLines: day.cashLines ?? [],
      countedCash,
      countEdited,
    });
    const validation = cashCloseValidationError({
      countedCash: drawer.countValue === '' ? '' : Number(drawer.countValue),
      openingFloat: openingFloat === '' ? '' : Number(openingFloat),
      cashSales: drawer.sales,
      notes,
      cashLines: drawer.lines,
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
          countedCash: drawer.countValue === '' ? null : Number(drawer.countValue),
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
        className="pv-glass-card w-full max-w-5xl p-5 shadow-xl sm:p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Antes de vender</p>
        <h2 id="pending-cash-close-title" className="mt-1 text-xl font-semibold text-slate-900">
          Cierra ayer
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {spoken}
          {weekday ? ` · ${weekday}` : ''}.
        </p>
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <span className="font-semibold">{reminderName(userName)}</span>, no olvides cerrar la caja.
          El dinero debe cuadrar con lo que tenías más lo que se vendió en efectivo.
        </p>

        {loading ? <p className="mt-4 text-sm text-slate-500">Cargando el saldo de ayer…</p> : null}

        {day ? (
          <div className="mt-4">
            <CashCloseFormula
              date={day.closingDate || date}
              openingFloat={openingFloat}
              onOpeningFloat={setOpeningFloat}
              cashSales={Number(day.totals.cash ?? 0)}
              cashLines={day.cashLines ?? []}
              countedCash={countedCash}
              countEdited={countEdited}
              onCountedCash={(value) => {
                setCountEdited(true);
                setCountedCash(value);
              }}
              notes={notes}
              onNotes={setNotes}
              canEdit={canClose}
              saving={saving}
              saveLabel="Cerrar el día"
              savingLabel="Cerrando…"
              onSave={() => void closeYesterday()}
              error={error}
              countInputId="pending-drawer-count"
            />
          </div>
        ) : null}

        {!day && error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        {!canClose ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Pide a quien cierra caja que confirme el efectivo de ayer. Si hay un cliente en el
            mostrador, el aviso vuelve en 4 minutos.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <ActionChip tone="slate" onClick={snooze}>
            Hay un cliente en el mostrador
          </ActionChip>
          {canClose && !day && !loading ? (
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
