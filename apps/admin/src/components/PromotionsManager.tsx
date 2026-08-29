'use client';

import { useMemo, useState } from 'react';

import {
  PROMOTION_KIND_LABELS,
  PROMOTION_KINDS,
  type PromotionInput,
  type PromotionKind,
} from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';
import { DecimalInput, decimalFromNumber, parseOptionalDecimal } from '@/components/DecimalInput';
import { uploadProductMedia } from '@/lib/upload-image';

interface PromotionRow {
  id: string;
  title: string;
  body: string | null;
  kind: PromotionKind;
  image_url: string | null;
  discount_percent: number | null;
  product_id?: string | null;
  category_id?: string | null;
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
  productId: '',
  categoryId: '',
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

export function PromotionsManager({
  initialPromotions,
  products = [],
  categories = [],
  canManage = true,
}: {
  initialPromotions: PromotionRow[];
  products?: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string }>;
  canManage?: boolean;
}) {
  const [promotions, setPromotions] = useState(initialPromotions);
  const [form, setForm] = useState(emptyForm);
  const [discountText, setDiscountText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPromos, setOpenPromos] = useState(true);

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
    if (!canManage) return;
    setEditingId(null);
    setForm(emptyForm);
    setDiscountText('');
    setError(null);
    setShowForm(true);
  }

  function openEdit(row: PromotionRow) {
    setEditingId(row.id);
    const discount = row.discount_percent ? Number(row.discount_percent) : null;
    setForm({
      title: row.title,
      body: row.body ?? '',
      kind: row.kind,
      imageUrl: row.image_url ?? '',
      discountPercent: discount,
      productId: row.product_id ?? '',
      categoryId: row.category_id ?? '',
      startsAt: toLocalInput(row.starts_at),
      endsAt: toLocalInput(row.ends_at),
      isActive: row.is_active,
    });
    setDiscountText(decimalFromNumber(discount));
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setDiscountText('');
    setError(null);
  }

  async function save() {
    if (!canManage) {
      setError('No tienes permiso para gestionar promociones');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        discountPercent: form.kind === 'discount' ? parseOptionalDecimal(discountText) : null,
        body: form.body || null,
        imageUrl: form.imageUrl || null,
        productId: form.productId || null,
        categoryId: form.categoryId || null,
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

  async function broadcast(promoId: string, title: string) {
    if (!canManage) return;
    if (!confirm(`¿Enviar "${title}" por WhatsApp a clientes suscritos?`)) return;
    setBroadcastingId(promoId);
    setError(null);
    try {
      const response = await fetch(`/api/promotions/${promoId}/broadcast`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo enviar');
      alert(`Promo enviada a ${payload.sent} clientes${payload.failed ? ` (${payload.failed} fallaron)` : ''}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar promo');
    } finally {
      setBroadcastingId(null);
    }
  }

  async function remove(id: string, title: string) {
    if (!canManage) return;
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
    if (!canManage) return;
    const response = await fetch(`/api/promotions/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: row.title,
        body: row.body,
        kind: row.kind,
        imageUrl: row.image_url,
        discountPercent: row.discount_percent ? Number(row.discount_percent) : null,
        productId: row.product_id,
        categoryId: row.category_id,
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
    <details
      className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
      open={openPromos}
      onToggle={(event) => setOpenPromos(event.currentTarget.open)}
    >
      <FoldableSummary
        title="Cartel en la vitrina"
        hint={`${promotions.length} promociones · ${activeCount} activas en la tienda`}
        emoji="🏷️"
        iconClass="bg-emerald-100"
        actions={
          canManage ? (
            <ActionChip tone="emerald" emoji="🏷️" onClick={openCreate}>
              Nueva promoción
            </ActionChip>
          ) : undefined
        }
      />
      {!canManage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo lectura · no tienes permiso para gestionar promociones.
        </p>
      ) : null}

      {showForm && (
        <section className="pv-glass-card p-6">
          <h2 className="text-lg font-semibold">{editingId ? 'Editar promoción' : 'Nueva promoción'}</h2>
          <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-4">
            <label className="block text-sm md:col-span-4">
              <span className="font-medium text-slate-700">Título</span>
              <input
                className="pv-input mt-1"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="block text-sm md:col-span-4">
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
                className="pv-input mt-1 py-1.5 text-sm"
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
            {form.kind === 'discount' ? (
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Descuento (%)</span>
                <DecimalInput
                  placeholder="10"
                  className="pv-input mt-1"
                  value={discountText}
                  onChange={setDiscountText}
                />
              </label>
            ) : null}
            {form.kind === 'discount' ? (
              <>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Producto</span>
                  <select
                    className="pv-input mt-1 py-1.5 text-sm"
                    value={form.productId ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value, categoryId: '' }))}
                  >
                    <option value="">Toda la tienda</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Categoría</span>
                  <select
                    className="pv-input mt-1 py-1.5 text-sm"
                    value={form.categoryId ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value, productId: '' }))}
                  >
                    <option value="">Toda la tienda</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <label className="block text-sm md:col-span-4">
              <span className="font-medium text-slate-700">Imagen</span>
              <input
                className="pv-input mt-1"
                value={form.imageUrl ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="URL o sube un archivo"
              />
              <input
                type="file"
                accept="image/*"
                className="mt-2 block text-sm"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const url = await uploadProductMedia(file, 'promo-media');
                    setForm((f) => ({ ...f, imageUrl: url }));
                    setError(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'No se pudo subir');
                  }
                }}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Inicio (opcional)</span>
              <input
                type="datetime-local"
                className="pv-input mt-1"
                value={form.startsAt ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Fin (opcional)</span>
              <input
                type="datetime-local"
                className="pv-input mt-1"
                value={form.endsAt ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-4">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Activa en la tienda
            </label>
          </div>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionChip tone="emerald" emoji="✅" disabled={saving} onClick={() => void save()}>
              {saving ? 'Guardando…' : 'Guardar'}
            </ActionChip>
            <ActionChip elevated={false} onClick={closeForm}>
              Cancelar
            </ActionChip>
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
              <ActionChip
                elevated={false}
                tone={promo.is_active ? 'emerald' : 'slate'}
                onClick={() => void toggleActive(promo)}
              >
                {promo.is_active ? 'Activa' : 'Inactiva'}
              </ActionChip>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionChip elevated={false} emoji="✏️" onClick={() => openEdit(promo)}>
                Editar
              </ActionChip>
              {promo.is_active ? (
                <ActionChip
                  elevated={false}
                  emoji="💬"
                  disabled={broadcastingId === promo.id}
                  onClick={() => void broadcast(promo.id, promo.title)}
                >
                  {broadcastingId === promo.id ? 'Enviando…' : 'WhatsApp'}
                </ActionChip>
              ) : null}
              <ActionChip
                elevated={false}
                tone="rose"
                emoji="🗑️"
                onClick={() => void remove(promo.id, promo.title)}
              >
                Eliminar
              </ActionChip>
            </div>
          </article>
        ))}
        {promotions.length === 0 ? (
          <p className="text-slate-500 md:col-span-2">No hay promociones. Crea la primera para tus vecinos.</p>
        ) : null}
      </div>
    </details>
  );
}
