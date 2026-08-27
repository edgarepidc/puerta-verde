'use client';

import { useMemo, useState } from 'react';

import { DecimalInput, decimalFromNumber, parseDecimal } from '@/components/DecimalInput';

interface CategoryThreshold {
  id: string;
  name: string;
  sort_order: number;
  low_stock_threshold: number;
}

function categoryEmoji(name: string) {
  const n = name.toLowerCase();
  if (n.includes('fruta')) return '🍎';
  if (n.includes('verdura')) return '🥬';
  if (n.includes('chile')) return '🌶️';
  if (n.includes('hierba')) return '🌿';
  if (n.includes('semilla') || n.includes('grano')) return '🌾';
  if (n.includes('huevo')) return '🥚';
  if (n.includes('lácteo') || n.includes('lacteo') || n.includes('queso')) return '🧀';
  if (n.includes('pan')) return '🥖';
  return '🧺';
}

export function LowStockThresholdsManager({
  initialCategories,
  canEdit,
}: {
  initialCategories: CategoryThreshold[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState(() =>
    initialCategories.map((row) => ({
      ...row,
      text: decimalFromNumber(Number(row.low_stock_threshold), false),
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = useMemo(
    () =>
      rows.some((row) => {
        const initial = initialCategories.find((c) => c.id === row.id);
        if (!initial) return true;
        return Number(row.text) !== Number(initial.low_stock_threshold);
      }),
    [rows, initialCategories],
  );

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const thresholds = rows.map((row) => ({
        categoryId: row.id,
        threshold: parseDecimal(row.text),
      }));
      if (thresholds.some((t) => !(t.threshold >= 0))) {
        throw new Error('Cada límite debe ser cero o mayor');
      }
      const response = await fetch('/api/stock-thresholds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo guardar');
      const next = (payload.categories ?? []) as CategoryThreshold[];
      setRows(
        next.map((row) => ({
          ...row,
          text: decimalFromNumber(Number(row.low_stock_threshold), false),
        })),
      );
      setSavedAt(new Date().toLocaleTimeString('es-MX'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl"
            aria-hidden
          >
            📉
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Mínimo por categoría</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Se considera stock bajo cuando hay menos de este número. El límite aplica a todos los
              productos de esa categoría en esta sucursal.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {error ? <p className="text-xs text-rose-700">{error}</p> : null}
          {savedAt && !dirty ? <p className="text-xs text-emerald-700">Guardado</p> : null}
          {canEdit ? (
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void save()}
              className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Aún no hay categorías. Créalas en Catálogo.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <label
              key={row.id}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-sm text-slate-700 shadow-sm"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base"
                aria-hidden
              >
                {categoryEmoji(row.name)}
              </span>
              <span className="max-w-[10rem] truncate font-medium">{row.name}</span>
              <DecimalInput
                aria-label={`Mínimo de ${row.name}`}
                disabled={!canEdit}
                className="w-12 border-0 bg-transparent p-0 text-center text-sm font-semibold text-slate-900 outline-none"
                value={row.text}
                onChange={(value) =>
                  setRows((current) =>
                    current.map((item) => (item.id === row.id ? { ...item, text: value } : item)),
                  )
                }
              />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
