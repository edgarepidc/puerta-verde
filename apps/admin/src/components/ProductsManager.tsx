'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';

import {
  DEMO_PRODUCT_NAMES,
  LOW_STOCK_THRESHOLD,
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNITS,
  calcMarginPercent,
  formatMoney,
  type ProductInput,
  type ProductUnit,
} from '@puertaverde/shared';

import { CostImportPanel } from '@/components/CostImportPanel';

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface ProductRow {
  id: string;
  price: number;
  stock: number;
  min_stock?: number | null;
  avg_unit_cost: number;
  last_unit_cost: number | null;
  is_available: boolean;
  product: {
    id: string;
    name: string;
    description: string | null;
    unit: ProductUnit;
    sku?: string | null;
    image_url?: string | null;
    is_active: boolean;
    shelf_life_days: number | null;
    category_id: string | null;
    category: { id: string; name: string } | null;
  };
}

const emptyForm: ProductInput & { newCategoryName: string } = {
  name: '',
  description: '',
  categoryId: '',
  newCategoryName: '',
  sku: '',
  imageUrl: '',
  unit: 'kg',
  price: 0,
  unitCost: 0,
  stock: 0,
  minStock: LOW_STOCK_THRESHOLD,
  shelfLifeDays: null,
  isAvailable: true,
  isActive: true,
};

async function uploadImage(file: File, bucket: 'product-media' | 'promo-media' = 'product-media') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucket', bucket);
  const response = await fetch('/api/products/upload', { method: 'POST', body: formData });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'No se pudo subir la imagen');
  return payload.url as string;
}

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [categoryName, setCategoryName] = useState('');

  const demoCount = useMemo(
    () =>
      products.filter(
        (row) =>
          DEMO_PRODUCT_NAMES.includes(row.product.name) &&
          (row.product.is_active || row.is_available),
      ).length,
    [products],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return products;
    return products.filter((row) => {
      const name = row.product.name.toLowerCase();
      const category = row.product.category?.name.toLowerCase() ?? '';
      const sku = row.product.sku?.toLowerCase() ?? '';
      return name.includes(q) || category.includes(q) || sku.includes(q);
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
      sku: row.product.sku ?? '',
      imageUrl: row.product.image_url ?? '',
      unit: row.product.unit,
      price: Number(row.price),
      unitCost: Number(row.avg_unit_cost),
      stock: Number(row.stock),
      minStock: Number(row.min_stock ?? LOW_STOCK_THRESHOLD),
      shelfLifeDays: row.product.shelf_life_days ? Number(row.product.shelf_life_days) : null,
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
        sku: form.sku?.trim() || null,
        imageUrl: form.imageUrl?.trim() || null,
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
        sku: row.product.sku,
        imageUrl: row.product.image_url,
        price: Number(row.price),
        minStock: Number(row.min_stock ?? LOW_STOCK_THRESHOLD),
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

  async function archiveDemo() {
    if (!confirm('¿Ocultar el catálogo demo (Aguacate Hass, etc.) para cargar productos reales?')) return;
    setSaving(true);
    try {
      const response = await fetch('/api/products/archive-demo', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo archivar');
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al archivar demo');
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory() {
    const name = categoryName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sortOrder: categories.length + 1 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo crear');
      setCategoryName('');
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al crear categoría');
    } finally {
      setSaving(false);
    }
  }

  async function renameCategory(category: Category) {
    const name = window.prompt('Nuevo nombre', category.name)?.trim();
    if (!name || name === category.name) return;
    const response = await fetch('/api/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: category.id, name }),
    });
    if (!response.ok) {
      const result = await response.json();
      alert(result.error ?? 'No se pudo renombrar');
      return;
    }
    await refresh();
  }

  async function deleteCategory(category: Category) {
    if (!confirm(`¿Eliminar categoría "${category.name}"? Los productos quedan sin categoría.`)) return;
    const response = await fetch(`/api/categories?id=${category.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json();
      alert(result.error ?? 'No se pudo eliminar');
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-6">
      {demoCount > 0 && (
        <section className="pv-callout--amber rounded-2xl p-4">
          <p className="font-medium text-amber-900">
            Hay {demoCount} producto(s) de demostración visibles.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Ocúltalos antes de cargar tu catálogo real para no mezclar precios de prueba.
          </p>
          <button
            type="button"
            onClick={archiveDemo}
            className="mt-3 rounded-full bg-amber-900 px-4 py-2 text-sm text-white"
          >
            Ocultar catálogo demo
          </button>
        </section>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Sucursal: {branchName}</p>
          <p className="text-2xl font-bold text-slate-900">{products.length} productos</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            className="pv-input"
            placeholder="Buscar producto o código..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button type="button" onClick={openCreate} className="pv-btn-primary px-5 py-2 text-sm">
            + Nuevo producto
          </button>
        </div>
      </div>

      <CostImportPanel onImported={refresh} />

      <section className="pv-glass-card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Categorías</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
            <span key={category.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm">
              {category.name}
              <button type="button" className="text-xs text-slate-500" onClick={() => renameCategory(category)}>
                Editar
              </button>
              <button type="button" className="text-xs text-red-600" onClick={() => deleteCategory(category)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex max-w-md gap-2">
          <input
            className="pv-input"
            placeholder="Nueva categoría"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          />
          <button type="button" className="pv-btn-secondary px-4 py-2 text-sm" onClick={saveCategory}>
            Agregar
          </button>
        </div>
      </section>

      {showForm && (
        <section className="pv-glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Nombre</span>
              <input
                className="pv-input mt-1"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Código / PLU</span>
              <input
                className="pv-input mt-1"
                value={form.sku ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="Opcional"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Categoría</span>
              <select
                className="pv-input mt-1"
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
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Nueva categoría (opcional)</span>
              <input
                className="pv-input mt-1"
                placeholder="Ej. Orgánicos"
                value={form.newCategoryName}
                onChange={(e) => setForm((f) => ({ ...f, newCategoryName: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Unidad</span>
              <select
                className="pv-input mt-1"
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
                className="pv-input mt-1"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Costo de compra</span>
              <input
                type="number"
                min={0}
                step={0.01}
                className="pv-input mt-1"
                value={form.unitCost ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, unitCost: Number(e.target.value) }))}
              />
            </label>
            {!editing && (
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Stock inicial</span>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  className="pv-input mt-1"
                  value={form.stock ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))}
                />
                <span className="mt-1 block text-xs text-slate-500">Se registra como inventario inicial.</span>
              </label>
            )}
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Mínimo de stock</span>
              <input
                type="number"
                min={0}
                step="0.001"
                className="pv-input mt-1"
                value={form.minStock ?? LOW_STOCK_THRESHOLD}
                onChange={(e) => setForm((f) => ({ ...f, minStock: Number(e.target.value) }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Vida útil (días, opcional)</span>
              <input
                type="number"
                min={1}
                className="pv-input mt-1"
                placeholder="Ej. 3 para lechuga"
                value={form.shelfLifeDays ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    shelfLifeDays: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Foto</span>
              <div className="mt-2 flex items-center gap-4">
                {form.imageUrl ? (
                  <div className="relative h-16 w-16 overflow-hidden rounded-xl">
                    <Image src={form.imageUrl} alt="" fill className="object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                    Sin foto
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const url = await uploadImage(file);
                      setForm((f) => ({ ...f, imageUrl: url }));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Error al subir imagen');
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </div>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Descripción</span>
              <textarea
                rows={2}
                className="pv-input mt-1"
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

      <div className="pv-glass-card">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Costo</th>
              <th className="px-4 py-3 font-medium">Margen</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Tienda</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {row.product.image_url ? (
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                        <Image src={row.product.image_url} alt="" fill className="object-cover" unoptimized />
                      </div>
                    ) : null}
                    <div>
                      <p className="font-medium text-slate-900">{row.product.name}</p>
                      <p className="text-xs text-slate-500">
                        {PRODUCT_UNIT_LABELS[row.product.unit]}
                        {row.product.sku ? ` · ${row.product.sku}` : ''}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.product.category?.name ?? '—'}</td>
                <td className="px-4 py-3 font-medium">{formatMoney(Number(row.price))}</td>
                <td className="px-4 py-3">{formatMoney(Number(row.avg_unit_cost))}</td>
                <td className="px-4 py-3">
                  {calcMarginPercent(Number(row.price), Number(row.avg_unit_cost)).toFixed(1)}%
                </td>
                <td className="px-4 py-3">
                  {Number(row.stock)}
                  <span className="block text-[11px] text-slate-400">mín. {Number(row.min_stock ?? LOW_STOCK_THRESHOLD)}</span>
                </td>
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
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
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
