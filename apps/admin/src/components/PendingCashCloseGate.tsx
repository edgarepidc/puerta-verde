'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { cashPositionCloseError, formatMoney } from '@puertaverde/shared';

import { ActionChip } from '@/components/ActionChip';
import { DecimalInput } from '@/components/DecimalInput';
import { LogoutButton } from '@/components/LogoutButton';
import { PillField, pillInputClass } from '@/components/PillField';
import { formatMexicoSpokenDay, formatMexicoWeekday } from '@/lib/mexico-date';

const SNOOZE_MS = 4 * 60 * 1000;

type PendingSummary = {
  closingDate: string;
  expectedCash: number;
  expectedAccount: number;
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
        if (typeof payload.expectedCash === 'number' && countedCash === '') {
          setCountedCash(String(payload.expectedCash));
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
    // countedCash is only read so a typed count is not overwritten on reload.
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

  async function closeYesterday() {
    if (!canClose || !summary) return;
    const validation = cashPositionCloseError({
      countedCash: countedCash === '' ? '' : Number(countedCash),
      expectedCash: summary.expectedCash,
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
          countedCash: countedCash === '' ? null : Number(countedCash),
          confirmDrawer: true,
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
  const countedNumber = countedCash === '' ? null : Number(countedCash);
  const gap =
    summary && countedNumber != null && Number.isFinite(countedNumber)
      ? Math.round((countedNumber - summary.expectedCash) * 100) / 100
      : null;
  const off = gap != null && Math.abs(gap) > 0.009;

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
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Antes de vender</p>
        <h2 id="pending-cash-close-title" className="mt-1 text-xl font-semibold text-slate-900">
          Cierra ayer
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {spoken}
          {weekday ? ` · ${weekday}` : ''}. Cuenta el efectivo. La cuenta no se cuenta: es lo que
          debería estar en el banco. Al confirmar, las ventas de hoy ya no mueven este saldo.
        </p>

        {loading ? <p className="mt-4 text-sm text-slate-500">Cargando el saldo de ayer…</p> : null}

        {summary ? (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                Efectivo que debías tener
              </dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(summary.expectedCash)}
              </dd>
              <dd className="text-xs text-slate-500">Cuenta los billetes</dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white px-3 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Cuenta que debías tener
              </dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(summary.expectedAccount)}
              </dd>
              <dd className="text-xs text-slate-500">No se cuenta. Revísala en el banco</dd>
            </div>
          </dl>
        ) : null}

        {canClose && summary ? (
          <div className="mt-4 space-y-3">
            <PillField label="Efectivo contado" icon="$" tone="emerald">
              <DecimalInput
                className={pillInputClass('emerald')}
                value={countedCash}
                onChange={setCountedCash}
                groupThousands
              />
            </PillField>
            {gap != null ? (
              <p className={`text-sm font-medium ${off ? 'text-rose-700' : 'text-emerald-800'}`}>
                {off
                  ? gap < 0
                    ? `Faltan ${formatMoney(Math.abs(gap))}. Anota por qué y cierra igual.`
                    : `Sobran ${formatMoney(gap)}. Anota por qué y cierra igual.`
                  : 'Cuadra. Al cerrar, ayer queda congelado.'}
              </p>
            ) : (
              <p className="text-sm text-slate-500">Cuenta el efectivo de la caja para poder cerrar.</p>
            )}
            {off ? (
              <PillField label="Por qué no cuadra" icon="📝" tone="sky">
                <input
                  type="text"
                  className={pillInputClass('sky')}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ej. faltan $20 en caja chica"
                />
              </PillField>
            ) : null}
          </div>
        ) : null}

        {!canClose ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Pide a quien cierra caja que confirme el efectivo de ayer. Si hay un cliente en el
            mostrador, el aviso vuelve en 4 minutos.
          </p>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <ActionChip tone="slate" onClick={snooze}>
            Hay un cliente en el mostrador
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
                  cashPositionCloseError({
                    countedCash: countedCash === '' ? '' : Number(countedCash),
                    expectedCash: summary.expectedCash,
                    notes,
                  }),
                )
              }
              onClick={() => void closeYesterday()}
            >
              {saving ? 'Cerrando…' : 'Cerrar ayer'}
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
