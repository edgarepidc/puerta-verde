'use client';

import { useEffect, useMemo, useState } from 'react';

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
  const [openMinimos, setOpenMinimos] = useState(false);

  useEffect(() => {
    if (window.location.hash === '#minimo-categoria') setOpenMinimos(true);
  }, []);

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
    </details>
  );
}
