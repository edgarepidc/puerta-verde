'use client';

import { useEffect, useState } from 'react';

import { formatMoney } from '@puertaverde/shared';

import { ActionChip } from '@/components/ActionChip';
import { formatMexicoSpokenDay, formatMexicoWeekday } from '@/lib/mexico-date';

function seenKey(date: string) {
  return `pv-morning-open:${date}`;
}

function alreadySeen(date: string): boolean {
  try {
    return localStorage.getItem(seenKey(date)) === '1';
  } catch {
    return false;
  }
}

function markSeen(date: string) {
  try {
    localStorage.setItem(seenKey(date), '1');
  } catch {
    /* private mode */
  }
}

export function MorningOpenNotice({
  today,
  yesterday,
  cash,
  account,
}: {
  today: string;
  yesterday: string;
  cash: number;
  account: number;
}) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(!alreadySeen(today));
    setReady(true);
  }, [today]);

  useEffect(() => {
    if (!ready || !open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [ready, open]);

  if (!ready || !open) return null;

  const spoken = formatMexicoSpokenDay(yesterday);
  const weekday = formatMexicoWeekday(yesterday);

  return (
    <div
      className="pv-modal-overlay fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto p-4 sm:items-center"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="morning-open-title"
        className="pv-glass-card w-full max-w-lg p-5 shadow-xl sm:p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Empieza el día</p>
        <h2 id="morning-open-title" className="mt-1 text-xl font-semibold text-slate-900">
          Así quedó ayer
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {spoken}
          {weekday ? ` · ${weekday}` : ''}. Hoy sumas a partir de estos saldos. Ayer ya no se mueve.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
              Efectivo en caja
            </dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(cash)}</dd>
            <dd className="text-xs text-slate-500">Lo que debe haber en el cajón</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white px-3 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              En cuenta
            </dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(account)}</dd>
            <dd className="text-xs text-slate-500">Lo que debería estar en el banco</dd>
          </div>
        </dl>
        <div className="mt-5 flex justify-end">
          <ActionChip
            size="lg"
            emoji="💰"
            tone="emerald"
            onClick={() => {
              markSeen(today);
              setOpen(false);
            }}
          >
            Empezar el día
          </ActionChip>
        </div>
      </section>
    </div>
  );
}
