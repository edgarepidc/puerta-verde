'use client';

import { useMemo, useState } from 'react';

import {
  COUPON_DISCOUNT_TYPE_LABELS,
  formatMoney,
  type CouponDiscountType,
} from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';
import { DecimalInput, decimalFromNumber, parseDecimal, parseOptionalDecimal } from '@/components/DecimalInput';

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  max_uses: number | null;
  times_used: number;
  min_order_amount: number | null;
  created_at: string;
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function discountLabel(row: CouponRow): string {
  if (row.discount_type === 'percent') return `${Number(row.discount_value)}%`;
  return formatMoney(Number(row.discount_value));
}

function emptyForm() {
  return {
    code: '',
    description: '',
    discountType: 'percent' as CouponDiscountType,
    discountValue: '10',
    startsAt: '',
    endsAt: '',
    isActive: true,
    maxUses: '',
    minOrderAmount: '',
  };
}

export function CouponsManager({
  initialCoupons,
  canManage,
}: {
  initialCoupons: CouponRow[];
  canManage: boolean;
}) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCupones, setOpenCupones] = useState(true);

  const sorted = useMemo(
    () =>
      [...coupons].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return a.code.localeCompare(b.code);
      }),
    [coupons],
  );

  function startEdit(row: CouponRow) {
    setEditingId(row.id);
    setForm({
      code: row.code,
      description: row.description ?? '',
      discountType: row.discount_type,
      discountValue: decimalFromNumber(Number(row.discount_value), false),
      startsAt: toDateTimeLocal(row.starts_at),
      endsAt: toDateTimeLocal(row.ends_at),
      isActive: row.is_active,
      maxUses: row.max_uses == null ? '' : String(row.max_uses),
      minOrderAmount:
        row.min_order_amount == null
          ? ''
          : decimalFromNumber(Number(row.min_order_amount), false),
    });
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  async function save() {
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      const maxUses = form.maxUses.trim() ? Number(form.maxUses) : null;
      const payload = {
        code: form.code,
        description: form.description.trim() || null,
        discountType: form.discountType,
        discountValue: parseDecimal(form.discountValue, NaN),
        startsAt: fromDateTimeLocal(form.startsAt),
        endsAt: fromDateTimeLocal(form.endsAt),
        isActive: form.isActive,
        maxUses: Number.isFinite(maxUses as number) ? maxUses : null,
        minOrderAmount: parseOptionalDecimal(form.minOrderAmount),
      };

      const response = await fetch(
        editingId ? `/api/coupons/${editingId}` : '/api/coupons',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'No se pudo guardar');

      const coupon = data.coupon as CouponRow;
      setCoupons((current) => {
        if (editingId) {
          return current.map((row) => (row.id === editingId ? coupon : row));
        }
        return [coupon, ...current];
      });
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CouponRow) {
    if (!canManage) return;
    const ok = window.confirm(
      `¿Eliminar el cupón ${row.code}? Si ya se usó en pedidos, solo se desactivará.`,
    );
    if (!ok) return;
    setError(null);
    try {
      const response = await fetch(`/api/coupons/${row.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'No se pudo eliminar');
      if (data.deactivated) {
        setCoupons((current) =>
          current.map((item) => (item.id === row.id ? { ...item, is_active: false } : item)),
        );
      } else {
        setCoupons((current) => current.filter((item) => item.id !== row.id));
      }
      if (editingId === row.id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  return (
    <details
      className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
      open={openCupones}
      onToggle={(event) => setOpenCupones(event.currentTarget.open)}
    >
      <FoldableSummary
        title="Código al cobrar"
        hint="Vigencia para tienda web y mostrador · porcentaje o monto"
        emoji="🎟️"
        iconClass="bg-amber-100"
      />

        {!canManage ? (
          <p className="text-sm text-slate-500">Solo lectura · no tienes permiso para editar cupones.</p>
        ) : null}

        {canManage ? (
          <div className="grid min-w-0 gap-3 md:grid-cols-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Código</span>
              <input
                className="pv-input mt-1 uppercase"
                value={form.code}
                onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
                placeholder="VERANO10"
              />
            </label>
            <label className="block text-sm md:col-span-3">
              <span className="font-medium text-slate-700">Descripción (opcional)</span>
              <input
                className="pv-input mt-1"
                value={form.description}
                onChange={(e) =>
                  setForm((current) => ({ ...current, description: e.target.value }))
                }
                placeholder="Promo de temporada"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Tipo</span>
              <select
                className="pv-input mt-1 py-1.5 text-sm"
                value={form.discountType}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    discountType: e.target.value as CouponDiscountType,
                  }))
                }
              >
                {Object.entries(COUPON_DISCOUNT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Valor {form.discountType === 'percent' ? '(%)' : '($)'}
              </span>
              <DecimalInput
                className="pv-input mt-1"
                value={form.discountValue}
                onChange={(value) => setForm((current) => ({ ...current, discountValue: value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Máx. usos</span>
              <input
                className="pv-input mt-1"
                inputMode="numeric"
                value={form.maxUses}
                onChange={(e) => setForm((current) => ({ ...current, maxUses: e.target.value }))}
                placeholder="Sin límite"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Pedido mínimo $</span>
              <DecimalInput
                className="pv-input mt-1"
                value={form.minOrderAmount}
                onChange={(value) =>
                  setForm((current) => ({ ...current, minOrderAmount: value }))
                }
                placeholder="0"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Vigencia desde</span>
              <input
                type="datetime-local"
                className="pv-input mt-1"
                value={form.startsAt}
                onChange={(e) => setForm((current) => ({ ...current, startsAt: e.target.value }))}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Vigencia hasta</span>
              <input
                type="datetime-local"
                className="pv-input mt-1"
                value={form.endsAt}
                onChange={(e) => setForm((current) => ({ ...current, endsAt: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-4">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((current) => ({ ...current, isActive: e.target.checked }))}
              />
              Cupón activo
            </label>
            {error ? <p className="text-sm text-rose-700 md:col-span-4">{error}</p> : null}
            <div className="flex flex-wrap gap-2 md:col-span-4">
              <ActionChip tone="emerald" emoji="🎟️" disabled={saving} onClick={save}>
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear cupón'}
              </ActionChip>
              {editingId ? (
                <ActionChip elevated={false} disabled={saving} onClick={resetForm}>
                  Cancelar
                </ActionChip>
              ) : null}
            </div>
          </div>
        ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-100">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Descuento</th>
              <th className="px-4 py-3 font-medium">Vigencia</th>
              <th className="px-4 py-3 font-medium">Usos</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              {canManage ? <th className="px-4 py-3 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{row.code}</p>
                  {row.description ? (
                    <p className="text-xs text-slate-500">{row.description}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-800">{discountLabel(row)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {row.starts_at || row.ends_at
                    ? `${row.starts_at ? new Date(row.starts_at).toLocaleString('es-MX') : '—'} → ${
                        row.ends_at ? new Date(row.ends_at).toLocaleString('es-MX') : '—'
                      }`
                    : 'Sin límite'}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-700">
                  {row.times_used}
                  {row.max_uses != null ? ` / ${row.max_uses}` : ''}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      row.is_active
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {row.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                {canManage ? (
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <ActionChip elevated={false} emoji="✏️" onClick={() => startEdit(row)}>
                        Editar
                      </ActionChip>
                      <ActionChip
                        elevated={false}
                        tone="rose"
                        emoji="🗑️"
                        onClick={() => void remove(row)}
                      >
                        Eliminar
                      </ActionChip>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={canManage ? 6 : 5}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  Aún no hay cupones. Crea el primero arriba.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </details>
  );
}
