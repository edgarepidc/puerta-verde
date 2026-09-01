'use client';

import { useMemo, useState } from 'react';

import {
  INVENTORY_MOVEMENT_LABELS,
  formatDecimal,
  type InventoryMovementType,
} from '@puertaverde/shared';

import { FoldableSummary } from '@/components/ActionChip';

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

export function StockMovementHistory({
  movements,
  open,
  onToggle,
}: {
  movements: StockMovementRow[];
  open?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'waste' | 'adjustment'>('all');

  const rows = useMemo(() => {
    const relevant = movements.filter(
      (row) => row.movement_type === 'waste' || row.movement_type === 'adjustment',
    );
    if (filter === 'all') return relevant;
    return relevant.filter((row) => row.movement_type === filter);
  }, [movements, filter]);

  const wasteCount = movements.filter((row) => row.movement_type === 'waste').length;
  const adjustCount = movements.filter((row) => row.movement_type === 'adjustment').length;
  const relevantCount = wasteCount + adjustCount;
  const hint =
    relevantCount === 0
      ? 'Mermas y ajustes de esta sucursal'
      : [
          wasteCount > 0 ? `${wasteCount} merma${wasteCount === 1 ? '' : 's'}` : null,
          adjustCount > 0 ? `${adjustCount} ajuste${adjustCount === 1 ? '' : 's'}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <details
      id="historial-merma"
      className="group pv-glass-card space-y-4 p-4 sm:p-6"
      open={open}
      onToggle={(event) => onToggle?.(event.currentTarget.open)}
    >
      <FoldableSummary
        title="Historial"
        hint={hint}
        emoji="📜"
        iconClass="bg-slate-100"
      />

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-slate-500">
            Se registran al editar cada producto.
          </p>
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
                    ? 'border border-emerald-200 bg-white text-emerald-900 shadow-[0_2px_10px_rgba(16,185,129,0.28)]'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            Aún no hay mermas ni ajustes. Ábrelo desde el producto y anota el conteo.
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
                    {formatDecimal(signed)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
