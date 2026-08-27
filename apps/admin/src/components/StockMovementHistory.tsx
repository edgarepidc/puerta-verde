'use client';

import { useMemo, useState } from 'react';

import {
  INVENTORY_MOVEMENT_LABELS,
  type InventoryMovementType,
} from '@puertaverde/shared';

export interface StockMovementRow {
  id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  notes: string | null;
  created_at: string;
  branch_product: { product: { name: string } | null } | null;
}

const STYLE: Record<'waste' | 'adjustment', { emoji: string; badge: string }> = {
  waste: { emoji: '🍂', badge: 'bg-rose-100 text-rose-800' },
  adjustment: { emoji: '⚖️', badge: 'bg-sky-100 text-sky-800' },
};

export function StockMovementHistory({ movements }: { movements: StockMovementRow[] }) {
  const [filter, setFilter] = useState<'all' | 'waste' | 'adjustment'>('all');

  const rows = useMemo(() => {
    const relevant = movements.filter(
      (row) => row.movement_type === 'waste' || row.movement_type === 'adjustment',
    );
    if (filter === 'all') return relevant;
    return relevant.filter((row) => row.movement_type === filter);
  }, [movements, filter]);

  const wasteCount = movements.filter((row) => row.movement_type === 'waste').length;

  return (
    <section id="historial-merma" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Historial de merma y ajustes</h2>
          <p className="text-sm text-slate-500">
            Se registran desde cada producto del catálogo.
            {wasteCount > 0 ? ` ${wasteCount} merma(s) en esta lista.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: 'all' as const, label: 'Todos' },
              { key: 'waste' as const, label: 'Merma' },
              { key: 'adjustment' as const, label: 'Ajuste' },
            ]
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === opt.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Aún no hay mermas ni ajustes. Usa Merma / ajuste en el stock del producto.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const kind = row.movement_type === 'adjustment' ? 'adjustment' : 'waste';
            const style = STYLE[kind];
            const qty = Number(row.quantity);
            const signed = kind === 'waste' ? -Math.abs(qty) : qty;
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${style.badge}`}
                  aria-hidden
                >
                  {style.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {row.branch_product?.product?.name ?? '—'}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>
                      {INVENTORY_MOVEMENT_LABELS[kind]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {new Date(row.created_at).toLocaleString('es-MX', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                    {row.notes ? ` · ${row.notes}` : ''}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-bold ${
                    signed < 0 ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {signed > 0 ? '+' : ''}
                  {signed}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
