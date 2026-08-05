'use client';

import { useMemo, useState } from 'react';

import {
  INVENTORY_MOVEMENT_LABELS,
  LOW_STOCK_THRESHOLD,
  MANUAL_INVENTORY_TYPES,
  PRODUCT_UNIT_LABELS,
  type InventoryMovementType,
  type ManualInventoryMovementType,
  type ProductUnit,
} from '@puertaverde/shared';

interface ProductStock {
  id: string;
  stock: number;
  is_available: boolean;
  product: { id: string; name: string; unit: ProductUnit };
}

interface MovementRow {
  id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  notes: string | null;
  created_at: string;
  branch_product: {
    product: { name: string } | null;
  } | null;
}

export function InventoryManager({
  initialProducts,
  initialMovements,
}: {
  initialProducts: ProductStock[];
  initialMovements: MovementRow[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [movements, setMovements] = useState(initialMovements);
  const [branchProductId, setBranchProductId] = useState('');
  const [movementType, setMovementType] = useState<ManualInventoryMovementType>('purchase');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lowStock = useMemo(
    () => products.filter((p) => Number(p.stock) <= LOW_STOCK_THRESHOLD),
    [products],
  );

  async function refresh() {
    const response = await fetch('/api/inventory');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al recargar');
    setProducts(payload.products);
    setMovements(payload.movements);
  }

  async function submitMovement() {
    setSaving(true);
    setError(null);
    const signedQty =
      movementType === 'adjustment' ? quantity : Math.abs(quantity);

    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchProductId,
          movementType,
          quantity: signedQty,
          notes: notes || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo registrar');
      setNotes('');
      setQuantity(1);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {lowStock.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Stock bajo</h2>
          <p className="mt-1 text-sm text-amber-800">
            {lowStock.map((p) => `${p.product.name} (${Number(p.stock)})`).join(' · ')}
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Registrar movimiento</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Producto</span>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={branchProductId}
              onChange={(e) => setBranchProductId(e.target.value)}
            >
              <option value="">Selecciona...</option>
              {products.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.product.name} — stock: {Number(row.stock)}{' '}
                  {PRODUCT_UNIT_LABELS[row.product.unit]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Tipo</span>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as ManualInventoryMovementType)}
            >
              {MANUAL_INVENTORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {INVENTORY_MOVEMENT_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              {movementType === 'adjustment' ? 'Ajuste (+/-)' : 'Cantidad'}
            </span>
            <input
              type="number"
              step="0.001"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Notas</span>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Ej. Compra mercado central, merma por caducidad"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={saving || !branchProductId}
          onClick={submitMovement}
          className="mt-4 rounded-full bg-[var(--pv-green-600)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Registrar'}
        </button>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Stock actual</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Unidad</th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.product.name}</td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      Number(row.stock) <= LOW_STOCK_THRESHOLD ? 'text-amber-700' : 'text-slate-700'
                    }`}
                  >
                    {Number(row.stock)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {PRODUCT_UNIT_LABELS[row.product.unit]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Historial reciente</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Movimiento</th>
                <th className="px-4 py-3 font-medium">Cant.</th>
                <th className="px-4 py-3 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(row.created_at).toLocaleString('es-MX', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3">{row.branch_product?.product?.name ?? '—'}</td>
                  <td className="px-4 py-3">{INVENTORY_MOVEMENT_LABELS[row.movement_type]}</td>
                  <td className="px-4 py-3 font-medium">{Number(row.quantity)}</td>
                  <td className="px-4 py-3 text-slate-500">{row.notes ?? '—'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Sin movimientos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
