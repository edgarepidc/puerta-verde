'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNITS,
  calcMarginPercent,
  formatDecimal,
  formatMoney,
  getDefaultLowStockThreshold,
  isLowStock,
  quantityForStockCount,
  type ProductInput,
  type ProductUnit,
} from '@puertaverde/shared';

import { ActionChip, ChevronDownIcon, FoldableSummary } from '@/components/ActionChip';
import { CategorySearchSelect } from '@/components/CategorySearchSelect';
import { CostImportPanel } from '@/components/CostImportPanel';
import {
  DecimalInput,
  decimalFromNumber,
  parseDecimal,
} from '@/components/DecimalInput';
import { ForecastManager } from '@/components/ForecastManager';
import { LowStockThresholdsManager } from '@/components/LowStockThresholdsManager';
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

const emptyForm: ProductInput = {
  name: '',
  categoryId: '',
  imageUrl: '',
  unit: 'kg',
  price: 0,
  shelfLifeDays: null,
  weighAtFulfillment: true,
  isAvailable: true,
  isActive: true,
};

async function uploadImage(file: File) {
  return uploadProductMedia(file, 'product-media');
}

type SortKey = 'name' | 'price' | 'stock' | 'store';
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

function formatStockQty(value: number): string {
  return formatDecimal(value);
}

function VisibilityToggle({
  visible,
  onToggle,
  disabled = false,
  compact = false,
  label,
  outOfStock = false,
}: {
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
  outOfStock?: boolean;
}) {
  const name = label ? `${label} ` : '';
  const ariaLabel = outOfStock
    ? `${name}sin stock, oculto hasta reponer`
    : visible
      ? `${name}visible en tienda. Clic para ocultar`
      : `${name}oculto en tienda. Clic para mostrar`;
  return (
    <button
      type="button"
      aria-pressed={visible}
      aria-label={ariaLabel.trim()}
      title={outOfStock ? 'Sin stock: se oculta solo. Reponer para volver a Visible.' : undefined}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`rounded-full font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
        compact ? 'px-3 py-1 text-xs' : 'px-3 py-1.5 text-xs'
      } ${visible ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}`}
    >
      {visible ? 'Visible' : 'Oculto'}
    </button>
  );
}

export function ProductsManager({
  initialProducts,
  initialCategories,
  branchName,
  canManage = true,
  canAdjustInventory = false,
  initialMovements = [],
  initialForecast = [],
  initialThresholdCategories = [],
  canEditStockThresholds = false,
}: {
  initialProducts: ProductRow[];
  initialCategories: Category[];
  branchName: string;
  canManage?: boolean;
  canAdjustInventory?: boolean;
  initialMovements?: StockMovementRow[];
  initialForecast?: Array<{
    branch_product_id: string;
    product_name: string;
    unit: ProductUnit;
    current_stock: number;
    min_stock: number;
    avg_daily_sales: number;
    forecast_demand: number;
    suggested_reorder: number;
    days_until_stockout: number | null;
  }>;
  initialThresholdCategories?: Array<{
    id: string;
    name: string;
    sort_order: number;
    low_stock_threshold: number;
  }>;
  canEditStockThresholds?: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [movements, setMovements] = useState(initialMovements);
  const [form, setForm] = useState(emptyForm);
  const [priceText, setPriceText] = useState('');
  const [editing, setEditing] = useState<{ productId: string; branchProductId: string } | null>(null);
  const [editingRow, setEditingRow] = useState<ProductRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [stockRow, setStockRow] = useState<ProductRow | null>(null);
  const [countedText, setCountedText] = useState('');
  const [stockNotes, setStockNotes] = useState('');
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockSaving, setStockSaving] = useState(false);
  const [openProductos, setOpenProductos] = useState(true);
  const [openHistorial, setOpenHistorial] = useState(false);
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
      const hay = `${row.product.name} ${row.product.category?.name ?? ''}`.toLowerCase();
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
        case 'price':
          return cmp(Number(a.price), Number(b.price));
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
    setSortDir(column === 'name' ? 'asc' : 'desc');
  }

  useEffect(() => {
    if (!showForm) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      closeForm();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm]);

  function openCreate() {
    setEditing(null);
    setEditingRow(null);
    setForm(emptyForm);
    setPriceText('');
    setError(null);
    setShowForm(true);
    closeStock();
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
    setError(null);
    setShowForm(true);
    setStockRow(row);
    setCountedText(formatStockQty(Number(row.stock)));
    setStockNotes('');
    setStockError(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setEditingRow(null);
    setForm(emptyForm);
    setPriceText('');
    setError(null);
    closeStock();
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
        shelfLifeDays: editingRow?.product.shelf_life_days ?? null,
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
        `Hay otro «${row.product.name}» (stock ${formatDecimal(Number(keeper.stock))}).\n\n` +
          `¿Unir este (stock ${formatDecimal(Number(row.stock))}) en ese, pasar compras/ventas y eliminar el duplicado?`,
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

  async function setAvailability(row: ProductRow, nextVisible: boolean) {
    const currentlyVisible = row.is_available && row.product.is_active;
    if (currentlyVisible === nextVisible) return;
    setProducts((current) =>
      current.map((item) =>
        item.id === row.id
          ? {
              ...item,
              is_available: nextVisible,
              product: { ...item.product, is_active: nextVisible },
            }
          : item,
      ),
    );
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
      setProducts((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                is_available: currentlyVisible,
                product: { ...item.product, is_active: currentlyVisible },
              }
            : item,
        ),
      );
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
          quantity: quantityForStockCount({ system, counted, kind }),
          notes:
            stockNotes.trim() ||
            (kind === 'waste'
              ? `Merma desde catálogo (sistema ${formatStockQty(system)} → conteo ${formatStockQty(counted)})`
              : `Ajuste desde catálogo (sistema ${formatStockQty(system)} → conteo ${formatStockQty(counted)})`),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo registrar');
      const [productsRes, inventoryRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/inventory'),
      ]);
      const payload = await productsRes.json();
      if (productsRes.ok) {
        setProducts(payload.products);
        setCategories(payload.categories);
        const updated = (payload.products as ProductRow[]).find((row) => row.id === stockRow.id);
        if (updated) {
          setStockRow(updated);
          setEditingRow(updated);
          setCountedText(formatStockQty(Number(updated.stock)));
        }
      }
      if (inventoryRes.ok) {
        const inventory = await inventoryRes.json();
        setMovements(inventory.movements ?? []);
      }
      setStockNotes('');
      setStockError(null);
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

      <details
        className="group pv-glass-card space-y-4 p-4 sm:p-6"
        open={openProductos}
        onToggle={(event) => setOpenProductos(event.currentTarget.open)}
      >
        <FoldableSummary
          title="Productos"
          hint={
            sorted.length === products.length
              ? `${products.length} en ${branchName}`
              : `${sorted.length} de ${products.length} · ${branchName}`
          }
          emoji="🥬"
          iconClass="bg-emerald-100"
          actions={
            <>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar…"
                aria-label="Buscar productos"
                className="h-9 w-36 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 sm:w-44"
              />
              {canManage ? (
                <>
                  <ActionChip
                    icon={
                      showImport ? (
                        <span className="inline-flex rotate-180">
                          <ChevronDownIcon />
                        </span>
                      ) : undefined
                    }
                    emoji={showImport ? undefined : '📋'}
                    onClick={() => setShowImport((open) => !open)}
                  >
                    {showImport ? 'Cerrar lista' : 'Cargar lista'}
                  </ActionChip>
                  <ActionChip tone="emerald" emoji="🥬" onClick={openCreate}>
                    Agregar producto
                  </ActionChip>
                </>
              ) : null}
            </>
          }
        />

        <div className="mt-4 space-y-4">
          {categories.length > 0 ? (
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
                      ? 'border border-emerald-200 bg-white text-emerald-900 shadow-[0_2px_10px_rgba(16,185,129,0.28)]'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}

          {showImport ? <CostImportPanel onImported={refresh} /> : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <SortHeader label="Producto" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Precio" column="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Stock" column="stock" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Visible" column="store" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const stock = Number(row.stock);
                  const low = isLowStock({
                    stock,
                    unit: row.product.unit,
                    minStock: row.min_stock,
                    name: row.product.name,
                    categoryName: row.product.category?.name,
                  });
                  const visible = row.is_available && row.product.is_active;
                  return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/80"
                    onClick={() => openEdit(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openEdit(row);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-3 py-3">
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
                            {row.product.category?.name ? ` · ${row.product.category.name}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium">{formatMoney(Number(row.price))}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <p className={low ? 'font-semibold text-amber-800' : 'text-slate-800'}>
                        {formatStockQty(stock)} {PRODUCT_UNIT_LABELS[row.product.unit]}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <VisibilityToggle
                        compact
                        visible={visible}
                        outOfStock={stock <= 0}
                        disabled={!canManage || stock <= 0}
                        label={row.product.name}
                        onToggle={() => void setAvailability(row, !visible)}
                      />
                    </td>
                  </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      {search.trim() || categoryFilter !== 'all'
                        ? 'Ningún producto coincide con la búsqueda o categoría.'
                        : 'Aún no hay productos.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>

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
            className="pv-glass-card my-4 flex w-max max-w-[calc(100vw-2rem)] flex-col p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="product-modal-title" className="text-lg font-semibold text-slate-900">
                {editing ? 'Editar producto' : 'Agregar producto'}
              </h2>
              <ActionChip
                icon={
                  <span className="inline-flex rotate-180">
                    <ChevronDownIcon />
                  </span>
                }
                onClick={closeForm}
              >
                Cerrar
              </ActionChip>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Nombre</span>
                <input
                  autoFocus
                  className="pv-input mt-1"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <div className="flex flex-wrap items-end gap-3">
              <label className="block w-40 shrink-0 text-sm">
                <span className="font-medium text-slate-700">Categoría</span>
                <CategorySearchSelect
                  categories={categories}
                  value={form.categoryId ?? ''}
                  onChange={(id) => setForm((f) => ({ ...f, categoryId: id }))}
                  onCreate={(name) => void createCategory(name, true)}
                />
              </label>
              <label className="block w-28 shrink-0 text-sm">
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
                        weighAtFulfillment:
                          unit === 'kg' ? (f.unit === 'kg' ? Boolean(f.weighAtFulfillment) : true) : false,
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
              <label className="block w-36 shrink-0 text-sm">
                <span className="font-medium text-slate-700">Precio de venta</span>
                <div className="mt-1 inline-flex w-full items-center gap-2 rounded-full border border-emerald-200 bg-white py-1 pl-1 pr-3 shadow-[0_2px_10px_rgba(16,185,129,0.28)] focus-within:bg-emerald-50">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800"
                    aria-hidden
                  >
                    $
                  </span>
                  <DecimalInput
                    min={0}
                    placeholder="0"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-emerald-900 outline-none"
                    value={priceText}
                    onChange={(value) => {
                      setPriceText(value);
                      setForm((f) => ({ ...f, price: parseDecimal(value) }));
                    }}
                  />
                </div>
              </label>
              {editingRow && cost > 0 ? (
                <div className="flex flex-wrap items-center gap-2 pb-0.5">
                  <ActionChip as="span" emoji="🧾">
                    Costo {formatMoney(cost)}
                  </ActionChip>
                  <ActionChip as="span" tone="emerald" emoji="%">
                    Margen{' '}
                    {calcMarginPercent(
                      parseDecimal(priceText) || Number(editingRow.price),
                      cost,
                    ).toFixed(0)}
                    %
                  </ActionChip>
                </div>
              ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {form.imageUrl ? (
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                      <Image src={form.imageUrl} alt="" fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400"
                      aria-hidden
                    >
                      📷
                    </span>
                  )}
                  <ActionChip elevated={false} disabled={uploading} onClick={openPhotoPicker}>
                    {uploading ? 'Subiendo…' : form.imageUrl ? 'Cambiar foto' : 'Subir foto'}
                  </ActionChip>
                  {form.imageUrl ? (
                    <ActionChip
                      tone="rose"
                      elevated={false}
                      onClick={() => setForm((f) => ({ ...f, imageUrl: '' }))}
                    >
                      Eliminar foto
                    </ActionChip>
                  ) : null}
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-slate-800">Visible en tienda</p>
                <VisibilityToggle
                  visible={form.isAvailable}
                  outOfStock={Number(editingRow?.stock ?? 0) <= 0 && Boolean(editing)}
                  disabled={Number(editingRow?.stock ?? 0) <= 0 && Boolean(editing)}
                  onToggle={() =>
                    setForm((f) => ({
                      ...f,
                      isAvailable: !f.isAvailable,
                      isActive: !f.isAvailable,
                    }))
                  }
                />
              </div>
              {form.unit === 'kg' ? (
              <label className="flex items-start gap-2 text-sm">
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
                  <span className="font-medium text-slate-800">Se pide por pieza y se pesa al cobrar</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    El cliente pide piezas; tú pesas en kg y el total sale del precio por kilo.
                  </span>
                </span>
              </label>
              ) : null}
            </div>

            <details className="group mt-4 min-w-0 w-full overflow-hidden rounded-xl border border-slate-200 bg-white/60 p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-base"
                    aria-hidden
                  >
                    🏪
                  </span>
                  Comparar con súper
                </span>
                <ActionChip as="span" icon={<ChevronDownIcon />} className="shrink-0">
                  <span className="group-open:hidden">Desplegar</span>
                  <span className="hidden group-open:inline">Cerrar</span>
                </ActionChip>
              </summary>
              <div className="mt-3 w-0 min-w-full overflow-x-auto">
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
            </details>

            {editingRow && canAdjustInventory && stockRow ? (
              <details className="group mt-3 min-w-0 w-full overflow-hidden rounded-xl border border-slate-200 bg-white/60 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-800">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-base"
                      aria-hidden
                    >
                      🍂
                    </span>
                    Ajuste de stock
                    <span className="font-normal text-slate-500">
                      En sistema {formatStockQty(Number(stockRow.stock))}{' '}
                      {PRODUCT_UNIT_LABELS[stockRow.product.unit]}
                      {' · '}
                      mínimo{' '}
                      {formatStockQty(
                        Number(
                          stockRow.min_stock ??
                            getDefaultLowStockThreshold({
                              unit: stockRow.product.unit,
                              name: stockRow.product.name,
                              categoryName: stockRow.product.category?.name,
                            }),
                        ),
                      )}{' '}
                      {PRODUCT_UNIT_LABELS[stockRow.product.unit]}
                    </span>
                  </span>
                  <ActionChip as="span" icon={<ChevronDownIcon />} className="shrink-0">
                    <span className="group-open:hidden">Desplegar</span>
                    <span className="hidden group-open:inline">Cerrar</span>
                  </ActionChip>
                </summary>
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Conteo físico</span>
                      <DecimalInput
                        className="pv-input mt-1"
                        value={countedText}
                        onChange={setCountedText}
                        placeholder="Lo que hay ahora"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Nota (opcional)</span>
                      <input
                        className="pv-input mt-1"
                        value={stockNotes}
                        onChange={(e) => setStockNotes(e.target.value)}
                        placeholder="Ej. merma por madurez"
                      />
                    </label>
                  </div>
                  {(() => {
                    const system = Number(stockRow.stock);
                    const counted = parseDecimal(countedText, system);
                    const delta = Number((counted - system).toFixed(2));
                    if (!countedText.trim() || delta === 0) return null;
                    return (
                      <p className={`text-sm ${delta < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                        Diferencia: {delta > 0 ? '+' : ''}
                        {formatStockQty(delta)} {PRODUCT_UNIT_LABELS[stockRow.product.unit]}
                      </p>
                    );
                  })()}
                  {stockError ? <p className="text-sm text-red-600">{stockError}</p> : null}
                  <div className="flex flex-wrap gap-3">
                    <ActionChip
                      size="lg"
                      tone="rose"
                      emoji="🍂"
                      disabled={stockSaving}
                      onClick={() => void submitStock('waste')}
                    >
                      {stockSaving ? 'Guardando…' : 'Registrar merma'}
                    </ActionChip>
                    <ActionChip
                      size="lg"
                      tone="sky"
                      emoji="⚖️"
                      disabled={stockSaving}
                      onClick={() => void submitStock('adjustment')}
                    >
                      {stockSaving ? 'Guardando…' : 'Ajustar al conteo'}
                    </ActionChip>
                  </div>
                </div>
              </details>
            ) : null}

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

      <ForecastManager
        initialForecast={initialForecast}
        stockProducts={products.map((row) => ({
          id: row.id,
          stock: Number(row.stock),
          min_stock: row.min_stock,
          product: {
            name: row.product.name,
            unit: row.product.unit,
            category: row.product.category,
          },
        }))}
      />
      <LowStockThresholdsManager
        canEdit={canEditStockThresholds}
        initialCategories={initialThresholdCategories}
        products={products.map((row) => ({
          categoryId: row.product.category_id ?? row.product.category?.id ?? null,
          unit: row.product.unit,
        }))}
      />

      <StockMovementHistory
        movements={movements}
        open={openHistorial}
        onToggle={setOpenHistorial}
      />
    </div>
  );
}
