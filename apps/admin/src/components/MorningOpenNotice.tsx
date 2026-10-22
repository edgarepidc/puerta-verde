'use client';

import { useEffect, useState } from 'react';

import type { CashDrawerLine } from '@puertaverde/shared';

import { CashCloseFormula } from '@/components/CashCloseFormula';
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
  openingFloat,
  countedCash,
  cashSales,
  cashLines,
  notes,
}: {
  today: string;
  yesterday: string;
  openingFloat: string;
  countedCash: string;
  cashSales: number;
  cashLines: CashDrawerLine[];
  notes: string;
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
        className="pv-glass-card w-full max-w-5xl p-5 shadow-xl sm:p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Empieza el día</p>
        <h2 id="morning-open-title" className="mt-1 text-xl font-semibold text-slate-900">
          Así quedó ayer
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {spoken}
          {weekday ? ` · ${weekday}` : ''}. Hoy sumas a partir de estos saldos. Ayer ya no se mueve.
        </p>
        <div className="mt-4">
          <CashCloseFormula
            date={yesterday}
            openingFloat={openingFloat}
            onOpeningFloat={() => undefined}
            cashSales={cashSales}
            cashLines={cashLines}
            countedCash={countedCash}
            countEdited
            onCountedCash={() => undefined}
            notes={notes}
            onNotes={() => undefined}
            canEdit={false}
            saving={false}
            saveLabel=""
            savingLabel=""
            onSave={() => undefined}
            error={null}
            countInputId="morning-drawer-count"
            locked
          />
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="pv-btn-account px-5 py-2.5 text-sm"
            onClick={() => {
              markSeen(today);
              setOpen(false);
            }}
          >
            Empezar el día
          </button>
        </div>
      </section>
    </div>
  );
}
