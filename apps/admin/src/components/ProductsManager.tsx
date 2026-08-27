'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNITS,
  calcMarginPercent,
  formatMoney,
  getDefaultLowStockThreshold,
  isLowStock,
  type ProductInput,
  type ProductUnit,
} from '@puertaverde/shared';

import { CategorySearchSelect } from '@/components/CategorySearchSelect';
import { CostImportPanel } from '@/components/CostImportPanel';
import {
  DecimalInput,
  decimalFromNumber,
  parseDecimal,
} from '@/components/DecimalInput';
import { MarketComparePanel } from '@/components/MarketComparePanel';
import { StockMovementHistory, type StockMovementRow } from '@/components/StockMovementHistory';
import { uploadProductMedia } from '@/lib/upload-image';

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
    weigh_at_fulfillment?: boolean;
    category_id: string | null;
    category: { id: string; name: string } | null;
  };
}

type CatalogTab = 'productos' | 'importar';

const emptyForm: ProductInput = {
  name: '',
  categoryId: '',
  imageUrl: '',
  unit: 'kg',
  price: 0,
  shelfLifeDays: null,
  weighAtFulfillment: false,
  isAvailable: true,
  isActive: true,
};

async function uploadImage(file: File) {
  return uploadProductMedia(file, 'product-media');
}

type SortKey = 'name' | 'category' | 'price' | 'cost' | 'margin' | 'stock' | 'store';
type SortDir = 'asc' | 'desc';

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = '',
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (column: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th className={`px-3 py-2 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 text-left hover:text-slate-800"
      >
        {label}
        <span className={`text-xs ${active ? 'text-slate-800' : 'text-slate-300'}`} aria-hidden>
          {active && sortDir === 'desc' ? '↓' : '↑'}
        </span>
      </button>
    </th>
  );
}

export function ProductsManager({
  initialProducts,
  initialCategories,
  branchName,
  canManage = true,
  canAdjustInventory = false,
  initialMovements = [],
}: {
  initialProducts: ProductRow[];
  initialCategories: Category[];
  branchName: string;
  canManage?: boolean;
  canAdjustInventory?: boolean;
  initialMovements?: StockMovementRow[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [movements, setMovements] = useState(initialMovements);
  const [form, setForm] = useState(emptyForm);
  const [priceText, setPriceText] = useState('');
  const [shelfLifeText, setShelfLifeText] = useState('');
  const [editing, setEditing] = useState<{ productId: string; branchProductId: string } | null>(null);
  const [editingRow, setEditingRow] = useState<ProductRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<CatalogTab>('productos');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [stockRow, setStockRow] = useState<ProductRow | null>(null);
  const [countedText, setCountedText] = useState('');
  const [stockNotes, setStockNotes] = useState('');
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockSaving, setStockSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const q = search.trim().toLowerCase();
    const filtered = products.filter((row) => {
      if (categoryFilter === 'none') {
        if (row.product.category_id) return false;
      } else if (categoryFilter !== 'all' && row.product.category_id !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${row.product.name} ${row.product.sku ?? ''} ${row.product.category?.name ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
    return [...filtered].sort((a, b) => {
      const cmp = (left: string | number, right: string | number) => {
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left).localeCompare(String(right), 'es', { sensitivity: 'base' }) * dir;
        }
        return (Number(left) - Number(right)) * dir;
      };
      switch (sortKey) {
        case 'category':
          return cmp(a.product.category?.name ?? '', b.product.category?.name ?? '');
        case 'price':
          return cmp(Number(a.price), Number(b.price));
        case 'cost':
          return cmp(Number(a.avg_unit_cost), Number(b.avg_unit_cost));
        case 'margin':
          return cmp(
            calcMarginPercent(Number(a.price), Number(a.avg_unit_cost)),
            calcMarginPercent(Number(b.price), Number(b.avg_unit_cost)),
          );
        case 'stock':
          return cmp(Number(a.stock), Number(b.stock));
        case 'store': {
          const aVisible = a.is_available && a.product.is_active ? 1 : 0;
          const bVisible = b.is_available && b.product.is_active ? 1 : 0;
          return cmp(aVisible, bVisible);
        }
        default:
          return cmp(a.product.name, b.product.name);
      }
    });
  }, [products, search, categoryFilter, sortKey, sortDir]);

  function toggleSort(column: SortKey) {
    if (sortKey === column) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(column);
    setSortDir(column === 'name' || column === 'category' ? 'asc' : 'desc');
  }

  useEffect(() => {
    if (!showForm && !stockRow) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (stockRow) {
        closeStock();
        return;
      }
      setShowForm(false);
      setEditing(null);
      setEditingRow(null);
      setForm(emptyForm);
      setPriceText('');
      setShelfLifeText('');
      setError(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm, stockRow]);

  function openCreate() {
    setEditing(null);
    setEditingRow(null);
    setForm(emptyForm);
    setPriceText('');
    setShelfLifeText('');
    setError(null);
    setShowForm(true);
  }

  function openEdit(row: ProductRow) {
    setEditing({ productId: row.product.id, branchProductId: row.id });
    setEditingRow(row);
    const price = Number(row.price);
    setForm({
      name: row.product.name,
      categoryId: row.product.category_id ?? '',
      imageUrl: row.product.image_url ?? '',
      unit: row.product.unit,
      price,
      shelfLifeDays: row.product.shelf_life_days ? Number(row.product.shelf_life_days) : null,
      weighAtFulfillment: Boolean(row.product.weigh_at_fulfillment),
      isAvailable: row.is_available,
      isActive: row.product.is_active,
    });
    setPriceText(decimalFromNumber(price));
    setShelfLifeText(
      row.product.shelf_life_days ? String(Number(row.product.shelf_life_days)) : '',
    );
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setEditingRow(null);
    setForm(emptyForm);
    setPriceText('');
    setShelfLifeText('');
    setError(null);
  }

  async function refresh() {
    const [productsRes, inventoryRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/inventory'),
    ]);
    const payload = await productsRes.json();
    if (!productsRes.ok) throw new Error(payload.error ?? 'No se pudo recargar');
    setProducts(payload.products);
    setCategories(payload.categories);
    if (inventoryRes.ok) {
      const inventory = await inventoryRes.json();
      setMovements(inventory.movements ?? []);
    }
  }

  async function saveProduct() {
    if (!canManage) {
      setError('No tienes permiso para gestionar el catálogo');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        unit: form.unit,
        price: parseDecimal(priceText),
        categoryId: form.categoryId || null,
        imageUrl: form.imageUrl?.trim() || null,
        shelfLifeDays: shelfLifeText.trim() ? parseDecimal(shelfLifeText) : null,
        weighAtFulfillment: Boolean(form.weighAtFulfillment),
        isAvailable: form.isAvailable,
        isActive: form.isAvailable,
        description: editingRow?.product.description ?? null,
        sku: editingRow?.product.sku ?? null,
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

  function openPhotoPicker() {
    photoInputRef.current?.click();
  }

  async function handlePhotoSelected(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir imagen');
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  async function deleteProduct(row: ProductRow) {
    const twins = products.filter(
      (other) =>
        other.id !== row.id &&
        other.product.unit === row.product.unit &&
        other.product.name.trim().toLowerCase() === row.product.name.trim().toLowerCase(),
    );
    const keeper = [...twins].sort((a, b) => Number(b.stock) - Number(a.stock))[0];

    if (keeper) {
      const ok = window.confirm(
        `Hay otro «${row.product.name}» (stock ${Number(keeper.stock)}).\n\n` +
          `¿Unir este (stock ${Number(row.stock)}) en ese, pasar compras/ventas y eliminar el duplicado?`,
      );
      if (!ok) return;
      setSaving(true);
      try {
        const response = await fetch('/api/products/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromBranchProductId: row.id,
            intoBranchProductId: keeper.id,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'No se pudo unir/eliminar');
        await refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Error al eliminar');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!confirm(`¿Eliminar "${row.product.name}"?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/products/${row.product.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchProductId: row.id }),
      });
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
    const nextVisible = !(row.is_available && row.product.is_active);
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
        minStock: Number(
          row.min_stock ??
            getDefaultLowStockThreshold({
              unit: row.product.unit,
              name: row.product.name,
              categoryName: row.product.category?.name,
            }),
        ),
        isAvailable: nextVisible,
        isActive: nextVisible,
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

  function closeStock() {
    setStockRow(null);
    setCountedText('');
    setStockNotes('');
    setStockError(null);
    setStockSaving(false);
  }

  function openStock(row: ProductRow) {
    setStockRow(row);
    setCountedText(decimalFromNumber(Number(row.stock), false));
    setStockNotes('');
    setStockError(null);
  }

  async function submitStock(kind: 'waste' | 'adjustment') {
    if (!stockRow || !canAdjustInventory) return;
    const system = Number(stockRow.stock);
    const counted = parseDecimal(countedText);
    if (!Number.isFinite(counted) || counted < 0) {
      setStockError('Indica un conteo válido (0 o más).');
      return;
    }
    const delta = Number((counted - system).toFixed(3));
    if (delta === 0) {
      setStockError('El conteo es igual al stock del sistema.');
      return;
    }
    if (kind === 'waste' && delta >= 0) {
      setStockError('La merma solo baja stock. Si hay de más, usa ajustar al conteo.');
      return;
    }
    setStockSaving(true);
    setStockError(null);
    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchProductId: stockRow.id,
          movementType: kind,
          quantity: kind === 'waste' ? Math.abs(delta) : delta,
          notes:
            stockNotes.trim() ||
            (kind === 'waste'
              ? `Merma desde catálogo (sistema ${system} → conteo ${counted})`
              : `Ajuste desde catálogo (sistema ${system} → conteo ${counted})`),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo registrar');
      await refresh();
      closeStock();
    } catch (err) {
      setStockError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setStockSaving(false);
    }
  }

  async function createCategory(name: string, selectInForm = false) {
    if (!canManage) {
      setError('No tienes permiso para gestionar el catálogo');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, sortOrder: categories.length + 1 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo crear');
      const created = result.category as Category | undefined;
      if (created) {
        setCategories((prev) =>
          prev.some((row) => row.id === created.id) ? prev : [...prev, created],
        );
        if (selectInForm) setForm((f) => ({ ...f, categoryId: created.id }));
      }
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al crear categoría');
    } finally {
      setSaving(false);
    }
  }

  const cost = Number(editingRow?.last_unit_cost ?? editingRow?.avg_unit_cost ?? 0);

  return (
    <div className="space-y-6">
      {!canManage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Solo lectura · no tienes permiso para editar el catálogo.
        </p>
      ) : null}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => void handlePhotoSelected(e.target.files?.[0])}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Sucursal: {branchName}</p>
          <p className="text-2xl font-bold text-slate-900">
            {sorted.length === products.length
              ? `${products.length} productos`
              : `${sorted.length} de ${products.length} productos`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'productos' ? (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar productos"
              className="h-10 w-40 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 sm:w-52"
            />
          ) : null}
          {canManage ? (
            <>
              <button
                type="button"
                onClick={() => setTab(tab === 'importar' ? 'productos' : 'importar')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  tab === 'importar'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab === 'importar' ? 'Ver productos' : 'Importar Excel'}
              </button>
              {tab === 'productos' ? (
                <button type="button" onClick={openCreate} className="pv-btn-primary px-5 py-2 text-sm">
                  + Agregar producto
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {tab === 'productos' && categories.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'Todas' },
            ...categories.map((category) => ({ id: category.id, label: category.name })),
            ...(products.some((row) => !row.product.category_id)
              ? [{ id: 'none', label: 'Sin categoría' }]
              : []),
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setCategoryFilter(chip.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                categoryFilter === chip.id
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'importar' && <CostImportPanel onImported={refresh} />}

      {tab === 'productos' && (
        <div className="pv-glass-card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <SortHeader label="Producto" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Categoría" column="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Precio" column="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Costo" column="cost" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Margen" column="margin" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader
                    label="Stock"
                    column="stock"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    className="min-w-[13rem]"
                  />
                  <SortHeader label="Tienda" column="store" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="px-3 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const stock = Number(row.stock);
                  const minStock = Number(
                    row.min_stock ??
                      getDefaultLowStockThreshold({
                        unit: row.product.unit,
                        name: row.product.name,
                        categoryName: row.product.category?.name,
                      }),
                  );
                  const low = isLowStock({
                    stock,
                    unit: row.product.unit,
                    minStock: row.min_stock,
                    name: row.product.name,
                    categoryName: row.product.category?.name,
                  });
                  return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {row.product.image_url ? (
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                            <Image src={row.product.image_url} alt="" fill className="object-cover" unoptimized />
                          </div>
                        ) : null}
                        <div>
                          <p className="font-medium text-slate-900">{row.product.name}</p>
                          <p className="text-xs text-slate-500">{PRODUCT_UNIT_LABELS[row.product.unit]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{row.product.category?.name ?? '—'}</td>
                    <td className="px-3 py-3 font-medium">{formatMoney(Number(row.price))}</td>
                    <td className="px-3 py-3 text-slate-500">{formatMoney(Number(row.avg_unit_cost))}</td>
                    <td className="px-3 py-3 text-slate-500">
                      {calcMarginPercent(Number(row.price), Number(row.avg_unit_cost)).toFixed(1)}%
                    </td>
                    <td className="min-w-[13rem] whitespace-nowrap px-3 py-3">
                      <p className={low ? 'font-semibold text-amber-800' : 'text-slate-800'}>
                        {stock} {PRODUCT_UNIT_LABELS[row.product.unit]}
                        <span className="ml-2 font-normal text-slate-500">mín. {minStock}</span>
                      </p>
                      {canAdjustInventory ? (
                        <button
                          type="button"
                          onClick={() => openStock(row)}
                          className="mt-1 text-left text-[11px] font-medium text-emerald-800 hover:underline"
                        >
                          Merma / ajuste
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
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
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="pv-btn-secondary px-3 py-1 text-xs"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {search.trim() || categoryFilter !== 'all'
                        ? 'Ningún producto coincide con la búsqueda o categoría.'
                        : 'Aún no hay productos en el catálogo.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
      )}

      {showForm && (
        <div
          className="pv-modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          role="presentation"
          onClick={closeForm}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            className="pv-glass-card my-4 w-full max-w-3xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="product-modal-title" className="text-lg font-semibold text-slate-900">
                {editing ? 'Editar producto' : 'Agregar producto'}
              </h2>
              <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={closeForm}>
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-sm md:col-span-2">
                <span className="font-medium text-slate-700">Nombre</span>
                <input
                  autoFocus
                  className="pv-input mt-1"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Categoría</span>
                <CategorySearchSelect
                  categories={categories}
                  value={form.categoryId ?? ''}
                  onChange={(id) => setForm((f) => ({ ...f, categoryId: id }))}
                  onCreate={(name) => void createCategory(name, true)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Unidad</span>
                <select
                  className="pv-input mt-1"
                  value={form.unit}
                  onChange={(e) =>
                    setForm((f) => {
                      const unit = e.target.value as ProductUnit;
                      return {
                        ...f,
                        unit,
                        weighAtFulfillment: unit === 'kg' ? f.weighAtFulfillment : false,
                      };
                    })
                  }
                >
                  {PRODUCT_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {PRODUCT_UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Precio de venta</span>
                <DecimalInput
                  min={0}
                  placeholder="0"
                  className="pv-input mt-1"
                  value={priceText}
                  onChange={(value) => {
                    setPriceText(value);
                    setForm((f) => ({ ...f, price: parseDecimal(value) }));
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Vida útil (días, opcional)</span>
                <DecimalInput
                  placeholder="Ej. 3 para lechuga"
                  className="pv-input mt-1"
                  value={shelfLifeText}
                  onChange={setShelfLifeText}
                />
              </label>
              <div className="block text-sm md:col-span-2">
                <span className="font-medium text-slate-700">Foto</span>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {form.imageUrl ? (
                    <div className="relative h-16 w-16 overflow-hidden rounded-xl">
                      <Image src={form.imageUrl} alt="" fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                      Sin foto
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={openPhotoPicker}
                    className="pv-btn-secondary px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {uploading ? 'Subiendo…' : form.imageUrl ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {form.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, imageUrl: '' }))}
                      className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      Eliminar foto
                    </button>
                  )}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isAvailable}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isAvailable: e.target.checked, isActive: e.target.checked }))
                  }
                />
                Visible en tienda
              </label>
              <label className="flex items-start gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(form.weighAtFulfillment)}
                  disabled={form.unit !== 'kg'}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weighAtFulfillment: e.target.checked }))
                  }
                />
                <span>
                  <span className="font-medium text-slate-800">Pesar al preparar (pedir por pieza)</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    El cliente pide piezas; al preparar capturas el peso en kg y el total se calcula con el
                    precio por kilo. Solo aplica si la unidad es kg.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4">
              <MarketComparePanel
                productName={form.name}
                unit={form.unit}
                currentPrice={parseDecimal(priceText)}
                cost={cost}
                onPriceChange={(price) => {
                  setForm((f) => ({ ...f, price }));
                  setPriceText(decimalFromNumber(price, false));
                }}
              />
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
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
              {editingRow && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    closeForm();
                    void deleteProduct(editingRow);
                  }}
                  className="rounded-full border border-red-200 bg-red-50 px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Eliminar producto
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {stockRow && (
        <div
          className="pv-modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          role="presentation"
          onClick={closeStock}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-modal-title"
            className="pv-glass-card my-4 w-full max-w-md p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="stock-modal-title" className="text-lg font-semibold text-slate-900">
                Merma / ajuste
              </h2>
              <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={closeStock}>
                Cerrar
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">{stockRow.product.name}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Stock en sistema</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {Number(stockRow.stock)} {PRODUCT_UNIT_LABELS[stockRow.product.unit]}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Mínimo / deberías tener</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {Number(
                    stockRow.min_stock ??
                      getDefaultLowStockThreshold({
                        unit: stockRow.product.unit,
                        name: stockRow.product.name,
                        categoryName: stockRow.product.category?.name,
                      }),
                  )}{' '}
                  {PRODUCT_UNIT_LABELS[stockRow.product.unit]}
                </dd>
              </div>
            </dl>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-700">Conteo físico</span>
              <DecimalInput
                className="pv-input mt-1"
                value={countedText}
                onChange={setCountedText}
                placeholder="Lo que hay ahora"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="font-medium text-slate-700">Nota (opcional)</span>
              <input
                className="pv-input mt-1"
                value={stockNotes}
                onChange={(e) => setStockNotes(e.target.value)}
                placeholder="Ej. merma por madurez, conteo de anaquel"
              />
            </label>
            {(() => {
              const system = Number(stockRow.stock);
              const counted = parseDecimal(countedText, system);
              const delta = Number((counted - system).toFixed(3));
              if (!countedText.trim() || delta === 0) return null;
              return (
                <p className={`mt-3 text-sm ${delta < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                  Diferencia: {delta > 0 ? '+' : ''}
                  {delta} {PRODUCT_UNIT_LABELS[stockRow.product.unit]}
                </p>
              );
            })()}
            {stockError ? <p className="mt-3 text-sm text-red-600">{stockError}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={stockSaving}
                onClick={() => void submitStock('waste')}
                className="rounded-full bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {stockSaving ? 'Guardando…' : 'Registrar merma'}
              </button>
              <button
                type="button"
                disabled={stockSaving}
                onClick={() => void submitStock('adjustment')}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {stockSaving ? 'Guardando…' : 'Ajustar al conteo'}
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === 'productos' ? <StockMovementHistory movements={movements} /> : null}
    </div>
  );
}
