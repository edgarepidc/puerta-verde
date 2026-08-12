'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  PRODUCT_UNIT_LABELS,
  formatMoney,
  type ProductUnit,
} from '@puertaverde/shared';

import { LowStockBanner } from '@/components/LowStockBanner';

interface ProductOption {
  id: string;
  stock: number;
  product: { id: string; name: string; unit: ProductUnit };
}

interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface PurchaseRow {
  id: string;
  purchased_at: string;
  notes: string | null;
  total_amount: number;
  created_at: string;
  supplier: { id: string; name: string } | null;
  items: Array<{
    id: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    branch_product: {
      id: string;
      product: { name: string; unit: ProductUnit } | null;
    } | null;
  }>;
}

interface CompareRow {
  branch_product_id: string;
  product_name: string;
  unit: string;
  supplier_id: string;
  supplier_name: string;
  purchase_count: number;
  total_quantity: number;
  avg_unit_price: number;
  min_unit_price: number;
  max_unit_price: number;
  last_unit_price: number;
  last_purchased_at: string;
}

interface LineDraft {
  key: string;
  branchProductId: string;
  quantity: number;
  unitPrice: number;
}

type Tab = 'compra' | 'proveedores' | 'comparar' | 'historial';

function todayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function PurchasesManager({
  initialPurchases,
  initialProducts,
  initialSuppliers,
}: {
  initialPurchases: PurchaseRow[];
  initialProducts: ProductOption[];
  initialSuppliers: SupplierRow[];
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('compra');
  const [purchases, setPurchases] = useState(initialPurchases);
  const [products] = useState(initialProducts);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [supplierId, setSupplierId] = useState(initialSuppliers.find((s) => s.is_active)?.id ?? '');
  const [purchasedAt, setPurchasedAt] = useState(todayLocalDate());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([
    { key: '1', branchProductId: '', quantity: 1, unitPrice: 0 },
  ]);

  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');

  const [compareProductId, setCompareProductId] = useState('');
  const [compareDays, setCompareDays] = useState(90);
  const [comparison, setComparison] = useState<CompareRow[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  useEffect(() => {
    const product = searchParams.get('product');
    const tabParam = searchParams.get('tab') as Tab | null;
    if (tabParam && ['compra', 'proveedores', 'comparar', 'historial'].includes(tabParam)) {
      setTab(tabParam);
    }
    if (product && products.some((row) => row.id === product)) {
      setLines([{ key: 'prefill', branchProductId: product, quantity: 1, unitPrice: 0 }]);
      setTab('compra');
    }
  }, [searchParams, products]);

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.is_active), [suppliers]);

  const draftTotal = useMemo(
    () => lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.unitPrice), 0),
    [lines],
  );

  async function refreshPurchases() {
    const response = await fetch('/api/purchases');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al recargar');
    setPurchases(payload.purchases);
    setSuppliers(payload.suppliers);
  }

  async function saveSupplier() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: supplierName,
          phone: supplierPhone || null,
          notes: supplierNotes || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar');
      setSupplierName('');
      setSupplierPhone('');
      setSupplierNotes('');
      await refreshPurchases();
      if (result.supplier?.id) setSupplierId(result.supplier.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar proveedor');
    } finally {
      setSaving(false);
    }
  }

  async function submitPurchase() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          purchasedAt,
          notes: notes || null,
          items: lines.map((line) => ({
            branchProductId: line.branchProductId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo registrar');
      setNotes('');
      setLines([{ key: String(Date.now()), branchProductId: '', quantity: 1, unitPrice: 0 }]);
      await refreshPurchases();
      setTab('historial');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar compra');
    } finally {
      setSaving(false);
    }
  }

  async function loadComparison() {
    setCompareLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(compareDays) });
      if (compareProductId) params.set('branchProductId', compareProductId);
      const response = await fetch(`/api/purchases/compare?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Error al comparar');
      setComparison(payload.comparison ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al comparar precios');
    } finally {
      setCompareLoading(false);
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'compra', label: 'Nueva compra' },
    { id: 'proveedores', label: 'Proveedores' },
    { id: 'comparar', label: 'Comparar precios' },
    { id: 'historial', label: 'Historial' },
  ];

  return (
    <div className="space-y-6">
      <LowStockBanner products={products} href="/inventario" />
      <section className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-5">
        <h2 className="text-base font-semibold text-emerald-950">Cómo se separan estas pantallas</h2>
        <ul className="mt-3 space-y-2 text-sm text-emerald-900/90">
          <li>
            <strong>Compras</strong> — registra compra a proveedor con precio. Sirve para saber quién te
            vende más barato.
          </li>
          <li>
            <strong>
              <Link href="/inventario" className="underline underline-offset-2">
                Inventario
              </Link>
            </strong>{' '}
            — stock actual, mermas y ajustes. No guarda proveedor.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === item.id
                ? 'bg-slate-900 text-white'
                : 'bg-white/70 text-slate-700 hover:bg-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {tab === 'compra' && (
        <section className="pv-glass-card space-y-4 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Registrar compra de materia prima</h2>
          <p className="text-sm text-slate-600">
            Al confirmar, se guarda el precio por proveedor y también entra al stock (como compra en
            Inventario).
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Proveedor *</span>
              <select
                className="pv-input mt-1"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Selecciona...</option>
                {activeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              {activeSuppliers.length === 0 && (
                <button
                  type="button"
                  className="mt-2 text-sm text-emerald-800 underline"
                  onClick={() => setTab('proveedores')}
                >
                  Primero agrega un proveedor
                </button>
              )}
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Fecha de compra</span>
              <input
                type="date"
                className="pv-input mt-1"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Notas</span>
              <input
                className="pv-input mt-1"
                placeholder="Ej. Mercado de abastos, factura 123"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium text-slate-800">Partidas</h3>
              <button
                type="button"
                className="text-sm font-medium text-emerald-800"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { key: String(Date.now()), branchProductId: '', quantity: 1, unitPrice: 0 },
                  ])
                }
              >
                + Agregar producto
              </button>
            </div>

            {lines.map((line, index) => (
              <div
                key={line.key}
                className="grid gap-3 rounded-xl border border-slate-200/80 bg-white/50 p-3 md:grid-cols-[2fr_1fr_1fr_auto]"
              >
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Producto</span>
                  <select
                    className="pv-input mt-1"
                    value={line.branchProductId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, branchProductId: e.target.value } : row,
                        ),
                      )
                    }
                  >
                    <option value="">Selecciona...</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.product.name} ({PRODUCT_UNIT_LABELS[product.product.unit]})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Cantidad</span>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="pv-input mt-1"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, quantity: Number(e.target.value) } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Precio unitario</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="pv-input mt-1"
                    value={line.unitPrice}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, unitPrice: Number(e.target.value) } : row,
                        ),
                      )
                    }
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
            <p className="text-sm text-slate-600">
              Total estimado:{' '}
              <span className="font-semibold text-slate-900">{formatMoney(draftTotal)}</span>
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={submitPurchase}
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Registrar compra'}
            </button>
          </div>
        </section>
      )}

      {tab === 'proveedores' && (
        <section className="space-y-4">
          <div className="pv-glass-card grid gap-4 p-6 md:grid-cols-2">
            <h2 className="text-lg font-semibold text-slate-900 md:col-span-2">Nuevo proveedor</h2>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-slate-700">Nombre *</span>
              <input
                className="pv-input mt-1"
                placeholder="Ej. Central de Abastos, Don Pepe"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Teléfono</span>
              <input
                className="pv-input mt-1"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Notas</span>
              <input
                className="pv-input mt-1"
                value={supplierNotes}
                onChange={(e) => setSupplierNotes(e.target.value)}
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="button"
                disabled={saving}
                onClick={saveSupplier}
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Guardar proveedor'}
              </button>
            </div>
          </div>

          <div className="pv-glass-card overflow-x-auto p-6">
            <h2 className="text-lg font-semibold text-slate-900">Proveedores</h2>
            <table className="mt-4 w-full min-w-[480px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Nombre</th>
                  <th className="pb-2 font-medium">Teléfono</th>
                  <th className="pb-2 font-medium">Notas</th>
                  <th className="pb-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{supplier.name}</td>
                    <td className="py-2 text-slate-600">{supplier.phone || '—'}</td>
                    <td className="py-2 text-slate-600">{supplier.notes || '—'}</td>
                    <td className="py-2 text-slate-600">
                      {supplier.is_active ? 'Activo' : 'Inactivo'}
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-slate-500">
                      Aún no hay proveedores. Agrega el primero arriba.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'comparar' && (
        <section className="pv-glass-card space-y-4 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Comparar precios por proveedor</h2>
          <p className="text-sm text-slate-600">
            Promedio, mínimo y último precio pagado. El proveedor con menor promedio queda primero
            dentro de cada producto.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Producto</span>
              <select
                className="pv-input mt-1"
                value={compareProductId}
                onChange={(e) => setCompareProductId(e.target.value)}
              >
                <option value="">Todos</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Periodo</span>
              <select
                className="pv-input mt-1"
                value={compareDays}
                onChange={(e) => setCompareDays(Number(e.target.value))}
              >
                <option value={30}>Últimos 30 días</option>
                <option value={90}>Últimos 90 días</option>
                <option value={180}>Últimos 180 días</option>
                <option value={365}>Último año</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={compareLoading}
                onClick={loadComparison}
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {compareLoading ? 'Calculando…' : 'Comparar'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[720px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Producto</th>
                  <th className="pb-2 font-medium">Proveedor</th>
                  <th className="pb-2 font-medium">Compras</th>
                  <th className="pb-2 font-medium">Promedio</th>
                  <th className="pb-2 font-medium">Mínimo</th>
                  <th className="pb-2 font-medium">Último</th>
                  <th className="pb-2 font-medium">Última fecha</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr
                    key={`${row.branch_product_id}-${row.supplier_id}`}
                    className="border-t border-slate-100"
                  >
                    <td className="py-2 font-medium text-slate-900">
                      {row.product_name}{' '}
                      <span className="font-normal text-slate-500">
                        / {PRODUCT_UNIT_LABELS[row.unit as ProductUnit] ?? row.unit}
                      </span>
                    </td>
                    <td className="py-2 text-slate-700">{row.supplier_name}</td>
                    <td className="py-2 text-slate-600">{row.purchase_count}</td>
                    <td className="py-2 font-medium text-slate-900">
                      {formatMoney(row.avg_unit_price)}
                    </td>
                    <td className="py-2 text-emerald-800">{formatMoney(row.min_unit_price)}</td>
                    <td className="py-2 text-slate-700">{formatMoney(row.last_unit_price)}</td>
                    <td className="py-2 text-slate-600">
                      {new Date(`${row.last_purchased_at}T12:00:00`).toLocaleDateString('es-MX')}
                    </td>
                  </tr>
                ))}
                {comparison.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-slate-500">
                      {compareLoading
                        ? 'Cargando…'
                        : 'Sin datos aún. Registra compras y pulsa Comparar.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'historial' && (
        <section className="pv-glass-card space-y-4 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Historial de compras</h2>
          <div className="space-y-3">
            {purchases.map((purchase) => (
              <article
                key={purchase.id}
                className="rounded-xl border border-slate-200/80 bg-white/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {purchase.supplier?.name ?? 'Proveedor'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {new Date(`${purchase.purchased_at}T12:00:00`).toLocaleDateString('es-MX')}
                      {purchase.notes ? ` · ${purchase.notes}` : ''}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">
                    {formatMoney(Number(purchase.total_amount))}
                  </p>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {(purchase.items ?? []).map((item) => (
                    <li key={item.id}>
                      {item.branch_product?.product?.name ?? 'Producto'} —{' '}
                      {Number(item.quantity)}{' '}
                      {item.branch_product?.product?.unit
                        ? PRODUCT_UNIT_LABELS[item.branch_product.product.unit]
                        : ''}{' '}
                      × {formatMoney(Number(item.unit_price))}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            {purchases.length === 0 && (
              <p className="text-sm text-slate-500">Todavía no hay compras registradas.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
