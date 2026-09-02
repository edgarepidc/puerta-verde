'use client';

import { useEffect, useMemo, useState } from 'react';

import { PRODUCT_UNIT_LABELS, type ProductUnit } from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';
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

function unitLabelForCategory(
  categoryId: string,
  products: Array<{ categoryId: string | null; unit: ProductUnit }>,
): string | null {
  const units = products.filter((product) => product.categoryId === categoryId).map((product) => product.unit);
  if (units.length === 0) return null;
  const counts = new Map<ProductUnit, number>();
  for (const unit of units) counts.set(unit, (counts.get(unit) ?? 0) + 1);
  let best = units[0];
  let bestCount = 0;
  for (const [unit, count] of counts) {
    if (count > bestCount) {
      best = unit;
      bestCount = count;
    }
  }
  return PRODUCT_UNIT_LABELS[best];
}

export function LowStockThresholdsManager({
  initialCategories,
  canEdit,
  products = [],
}: {
  initialCategories: CategoryThreshold[];
  canEdit: boolean;
  products?: Array<{ categoryId: string | null; unit: ProductUnit }>;
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
  const [openMinimos, setOpenMinimos] = useState(false);

  useEffect(() => {
    if (window.location.hash === '#minimo-categoria') setOpenMinimos(true);
  }, []);

  const unitByCategory = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      const label = unitLabelForCategory(row.id, products);
      if (label) map[row.id] = label;
    }
    return map;
  }, [products, rows]);

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
    <details
      id="minimo-categoria"
      className="group pv-glass-card space-y-4 p-4 sm:p-6"
      open={openMinimos}
      onToggle={(event) => setOpenMinimos(event.currentTarget.open)}
    >
      <FoldableSummary
        title="Mínimo por categoría"
        hint="Se considera stock bajo cuando hay menos de este número. El límite aplica a todos los productos de esa categoría."
        emoji="📉"
        iconClass="bg-amber-100"
        actions={
          canEdit ? (
            <>
              {error ? <p className="text-xs text-rose-700">{error}</p> : null}
              {savedAt && !dirty ? (
                <ActionChip as="span" emoji="✅" elevated={false}>
                  Guardado
                </ActionChip>
              ) : null}
              <ActionChip emoji="✅" disabled={saving || !dirty} onClick={() => void save()}>
                {saving ? 'Guardando…' : 'Guardar'}
              </ActionChip>
            </>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Aún no hay categorías. Créalas en el listado de arriba.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Categoría</th>
                <th className="px-3 py-2.5 text-right font-semibold">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5">
                    <p className="flex items-center gap-2 font-medium text-slate-900">
                      <span aria-hidden>{categoryEmoji(row.name)}</span>
                      {row.name}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {canEdit ? (
                        <DecimalInput
                          aria-label={
                            unitByCategory[row.id]
                              ? `Mínimo de ${row.name} en ${unitByCategory[row.id]}`
                              : `Mínimo de ${row.name}`
                          }
                          className="w-20 rounded-[0.875rem] border border-slate-200 bg-white px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          value={row.text}
                          onChange={(value) =>
                            setRows((current) =>
                              current.map((item) => (item.id === row.id ? { ...item, text: value } : item)),
                            )
                          }
                        />
                      ) : (
                        <span className="tabular-nums font-semibold text-slate-900">{row.text}</span>
                      )}
                      {unitByCategory[row.id] ? (
                        <span className="min-w-[3.25rem] text-left text-xs text-slate-500">
                          {unitByCategory[row.id]}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
