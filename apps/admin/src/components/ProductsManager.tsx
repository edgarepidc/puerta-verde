'use client';

import { useMemo, useState } from 'react';

import {
  formatMoney,
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNITS,
  type ProductInput,
  type ProductUnit,
} from '@puertaverde/shared';

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface ProductRow {
  id: string;
  price: number;
  stock: number;
  is_available: boolean;
  product: {
    id: string;
    name: string;
    description: string | null;
    unit: ProductUnit;
    is_active: boolean;
    category_id: string | null;
    category: { id: string; name: string } | null;
  };
}

const emptyForm: ProductInput & { newCategoryName: string } = {
  name: '',
  description: '',
  categoryId: '',
  newCategoryName: '',
  unit: 'kg',
  price: 0,
  stock: 0,
  isAvailable: true,
  isActive: true,
};

export function ProductsManager({
  initialProducts,
  initialCategories,
  branchName,
}: {
  initialProducts: ProductRow[];
  initialCategories: Category[];
  branchName: string;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<{ productId: string; branchProductId: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return products;
    return products.filter((row) => {
      const name = row.product.name.toLowerCase();
      const category = row.product.category?.name.toLowerCase() ?? '';
      return name.includes(q) || category.includes(q);
    });
  }, [products, filter]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function openEdit(row: ProductRow) {
    setEditing({ productId: row.product.id, branchProductId: row.id });
    setForm({
      name: row.product.name,
      description: row.product.description ?? '',
      categoryId: row.product.category_id ?? '',
      newCategoryName: '',
      unit: row.product.unit,
      price: Number(row.price),
      stock: Number(row.stock),
      isAvailable: row.is_available,
      isActive: row.product.is_active,
    });
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    setError(null);
  }

  async function refresh() {
    const response = await fetch('/api/products');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'No se pudo recargar');
    setProducts(payload.products);
    setCategories(payload.categories);
  }

  async function saveProduct() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        categoryId: form.categoryId || null,
        newCategoryName: form.newCategoryName.trim() || undefined,
      };

      const response = await fetch(
        editing ? `/api/products/${editing.productId}` : '/api/products',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            editing ? { ...payload, branchProductId: editing.branchProductId } : payload,
          ),
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

  async function deleteProduct(row: ProductRow) {
    if (!confirm(`¿Eliminar "${row.product.name}"?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/products/${row.product.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo eliminar');
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(row: ProductRow) {
    const response = await fetch(`/api/products/${row.product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: row.product.name,
        description: row.product.description,
        categoryId: row.product.category_id,
        unit: row.product.unit,
        price: Number(row.price),
        stock: Number(row.stock),
        isAvailable: !row.is_available,
        isActive: row.product.is_active,
        branchProductId: row.id,
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
          <p className="text-sm text-slate-500">Sucursal: {branchName}</p>
          <p className="text-2xl font-bold text-slate-900">{products.length} productos</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
            placeholder="Buscar producto..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-[var(--pv-green-600)] px-5 py-2 text-sm font-semibold text-white"
          >
            + Nuevo producto
          </button>
        </div>
      </div>

      {showForm && (
        <section className="rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Nombre</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Categoría</span>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={form.categoryId ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">Sin categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Nueva categoría (opcional)</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="Ej. Orgánicos"
                value={form.newCategoryName}
                onChange={(e) => setForm((f) => ({ ...f, newCategoryName: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Unidad</span>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as ProductUnit }))}
              >
                {PRODUCT_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {PRODUCT_UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Precio</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Stock</span>
              <input
                type="number"
                min={0}
                step="0.001"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Descripción</span>
              <textarea
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={form.description ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
              />
              Visible en tienda
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Producto activo
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={saveProduct}
              className="rounded-full bg-[var(--pv-green-600)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Tienda</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{row.product.name}</p>
                  <p className="text-xs text-slate-500">
                    {PRODUCT_UNIT_LABELS[row.product.unit]}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {row.product.category?.name ?? '—'}
                </td>
                <td className="px-4 py-3 font-medium">{formatMoney(Number(row.price))}</td>
                <td className="px-4 py-3">{Number(row.stock)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleAvailability(row)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      row.is_available && row.product.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {row.is_available && row.product.is_active ? 'Visible' : 'Oculto'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="text-[var(--pv-green-700)] hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProduct(row)}
                      className="text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No hay productos que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
