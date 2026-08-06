'use client';

import { useMemo, useState } from 'react';

import {
  PROMOTION_KIND_LABELS,
  PROMOTION_KINDS,
  type PromotionInput,
  type PromotionKind,
} from '@puertaverde/shared';

interface PromotionRow {
  id: string;
  title: string;
  body: string | null;
  kind: PromotionKind;
  image_url: string | null;
  discount_percent: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

const emptyForm: PromotionInput = {
  title: '',
  body: '',
  kind: 'banner',
  imageUrl: '',
  discountPercent: null,
  startsAt: '',
  endsAt: '',
  isActive: true,
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

export function PromotionsManager({ initialPromotions }: { initialPromotions: PromotionRow[] }) {
  const [promotions, setPromotions] = useState(initialPromotions);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCount = useMemo(
    () => promotions.filter((p) => p.is_active).length,
    [promotions],
  );

  async function refresh() {
    const response = await fetch('/api/promotions');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al recargar');
    setPromotions(payload.promotions);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function openEdit(row: PromotionRow) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      body: row.body ?? '',
      kind: row.kind,
      imageUrl: row.image_url ?? '',
      discountPercent: row.discount_percent ? Number(row.discount_percent) : null,
      startsAt: toLocalInput(row.starts_at),
      endsAt: toLocalInput(row.ends_at),
      isActive: row.is_active,
    });
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        body: form.body || null,
        imageUrl: form.imageUrl || null,
        startsAt: toIso(form.startsAt ?? ''),
        endsAt: toIso(form.endsAt ?? ''),
      };
      const response = await fetch(
        editingId ? `/api/promotions/${editingId}` : '/api/promotions',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      await refresh();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`¿Eliminar la promoción "${title}"?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/promotions/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo eliminar');
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: PromotionRow) {
    const response = await fetch(`/api/promotions/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: row.title,
        body: row.body,
        kind: row.kind,
        imageUrl: row.image_url,
        discountPercent: row.discount_percent ? Number(row.discount_percent) : null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        isActive: !row.is_active,
      }),
    });
    if (!response.ok) {
      const result = await response.json();
      alert(result.error ?? 'No se pudo actualizar');
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-2xl font-bold text-slate-900">{promotions.length} promociones</p>
          <p className="text-sm text-slate-500">{activeCount} activas en la tienda pública</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="pv-btn-primary px-5 py-2 text-sm"
        >
          + Nueva promoción
        </button>
      </div>

      {showForm && (
        <section className="pv-glass-card p-6">
          <h2 className="text-lg font-semibold">{editingId ? 'Editar promoción' : 'Nueva promoción'}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Título</span>
              <input
                className="pv-input mt-1"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Mensaje</span>
              <textarea
                rows={3}
                className="pv-input mt-1"
                value={form.body ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Tipo</span>
              <select
                className="pv-input mt-1"
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as PromotionKind }))}
              >
                {PROMOTION_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PROMOTION_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            {form.kind === 'discount' && (
              <label className="block text-sm md:col-span-2">
                <span className="font-medium text-slate-700">Descuento (%)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="pv-input mt-1"
                  value={form.discountPercent ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      discountPercent: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Imagen (URL opcional)</span>
              <input
                className="pv-input mt-1"
                value={form.imageUrl ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Inicio (opcional)</span>
              <input
                type="datetime-local"
                className="pv-input mt-1"
                value={form.startsAt ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Fin (opcional)</span>
              <input
                type="datetime-local"
                className="pv-input mt-1"
                value={form.endsAt ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Activa en la tienda
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="pv-btn-primary px-5 py-2 text-sm disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" onClick={closeForm} className="pv-btn-secondary px-5 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {promotions.map((promo) => (
          <article
            key={promo.id}
            className={`pv-glass-card p-5 ${
              promo.is_active ? 'border-green-200/50' : 'opacity-80'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase text-[var(--pv-green-600)]">
                  {PROMOTION_KIND_LABELS[promo.kind]}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{promo.title}</h3>
                {promo.body && <p className="mt-2 text-sm text-slate-600">{promo.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => toggleActive(promo)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                  promo.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {promo.is_active ? 'Activa' : 'Inactiva'}
              </button>
            </div>
            <div className="mt-4 flex gap-3 text-sm">
              <button type="button" onClick={() => openEdit(promo)} className="text-[var(--pv-green-700)] hover:underline">
                Editar
              </button>
              <button type="button" onClick={() => remove(promo.id, promo.title)} className="text-red-600 hover:underline">
                Eliminar
              </button>
            </div>
          </article>
        ))}
        {promotions.length === 0 && (
          <p className="text-slate-500 md:col-span-2">No hay promociones. Crea la primera para tus vecinos.</p>
        )}
      </div>
    </div>
  );
}
