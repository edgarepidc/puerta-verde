'use client';

import { useMemo, useState } from 'react';

import { PRODUCT_UNIT_LABELS, formatDecimal, type ProductUnit } from '@puertaverde/shared';

import { ScalePanel } from '@/components/ScalePanel';
import { DecimalInput, parseDecimal } from '@/components/DecimalInput';

interface ProductOption {
  id: string;
  name: string;
  unit: ProductUnit;
}

interface LotRow {
  id: string;
  lot_code: string;
  gtin: string | null;
  supplier_name: string | null;
  pack_date: string | null;
  expires_at: string | null;
  quantity_received: number;
  quantity_remaining: number;
  pti_label: string | null;
  created_at: string;
  branch_product: {
    product: { name: string; unit: ProductUnit } | null;
  } | null;
}

export function LotsManager({
  initialLots,
  products,
  usbScaleEnabled = false,
}: {
  initialLots: LotRow[];
  products: ProductOption[];
  usbScaleEnabled?: boolean;
}) {
  const [lots, setLots] = useState(initialLots);
  const [branchProductId, setBranchProductId] = useState('');
  const [lotCode, setLotCode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');

  const [gtin, setGtin] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [packDate, setPackDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [traceCode, setTraceCode] = useState('');
  const [traceResult, setTraceResult] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLots = useMemo(
    () => lots.filter((l) => Number(l.quantity_remaining) > 0),
    [lots],
  );

  async function refresh() {
    const response = await fetch('/api/lots');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Error al recargar');
    setLots(payload.lots);
  }

  async function receiveLot() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchProductId,
          lotCode,
          quantity: parseDecimal(quantity),
          unitCost: parseDecimal(unitCost) > 0 ? parseDecimal(unitCost) : null,
          gtin: gtin || null,
          supplierName: supplierName || null,
          packDate: packDate || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          notes: notes || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo registrar');
      setLotCode('');
      setQuantity('');
      setUnitCost('');
      setNotes('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar lote');
    } finally {
      setSaving(false);
    }
  }

  async function traceLot() {
    setError(null);
    setTraceResult(null);
    const response = await fetch(`/api/lots?trace=${encodeURIComponent(traceCode.trim())}`);
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? 'Lote no encontrado');
      return;
    }
    setTraceResult(payload.trace);
  }

  return (
    <div className="space-y-8">
      <section className="pv-glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Recibir lote (PTI)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Registra entrada con código de lote, GTIN y trazabilidad PTI. Las ventas consumen lotes por FIFO (primero por caducar).
        </p>

        {usbScaleEnabled ? (
          <div className="mt-4">
            <ScalePanel onWeight={(kg) => setQuantity(String(kg))} />
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Producto</span>
            <select
              className="pv-input mt-1"
              value={branchProductId}
              onChange={(e) => setBranchProductId(e.target.value)}
            >
              <option value="">Selecciona...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({PRODUCT_UNIT_LABELS[p.unit]})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Código de lote *</span>
            <input
              className="pv-input mt-1"
              value={lotCode}
              onChange={(e) => setLotCode(e.target.value)}
              placeholder="LOTE-20250806-A"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Cantidad *</span>
            <DecimalInput
              placeholder="0"
              className="pv-input mt-1"
              value={quantity}
              onChange={setQuantity}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Costo de compra (por unidad) *</span>
            <DecimalInput
              placeholder="0"
              className="pv-input mt-1"
              value={unitCost}
              onChange={setUnitCost}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">GTIN (14 dígitos, PTI)</span>
            <input
              className="pv-input mt-1"
              value={gtin}
              onChange={(e) => setGtin(e.target.value)}
              placeholder="01234567890123"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Proveedor</span>
            <input
              className="pv-input mt-1"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Fecha empaque</span>
            <input
              type="date"
              className="pv-input mt-1"
              value={packDate}
              onChange={(e) => setPackDate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Caducidad</span>
            <input
              type="datetime-local"
              className="pv-input mt-1"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Notas</span>
            <input
              className="pv-input mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={receiveLot}
          className="mt-4 pv-btn-primary px-5 py-2 text-sm disabled:opacity-50"
        >
          {saving ? 'Registrando...' : 'Registrar lote y entrada'}
        </button>
      </section>

      <section className="pv-glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Trazabilidad</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[200px] flex-1 pv-input"
            placeholder="Buscar por código de lote"
            value={traceCode}
            onChange={(e) => setTraceCode(e.target.value)}
          />
          <button
            type="button"
            onClick={traceLot}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            Rastrear
          </button>
        </div>
        {traceResult && (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-50 p-4 text-xs text-slate-800">
            {JSON.stringify(traceResult, null, 2)}
          </pre>
        )}
      </section>

      <section className="pv-glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Lotes activos ({activeLots.length})</h2>
        <ul className="mt-4 divide-y divide-slate-100">
          {activeLots.map((lot) => (
            <li key={lot.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">
                  {lot.lot_code} · {lot.branch_product?.product?.name}
                </p>
                <p className="text-slate-500">
                  Restante {formatDecimal(Number(lot.quantity_remaining))} / {formatDecimal(Number(lot.quantity_received))}
                  {lot.expires_at && ` · caduca ${new Date(lot.expires_at).toLocaleDateString('es-MX')}`}
                </p>
                {lot.pti_label && <p className="font-mono text-xs text-slate-400">{lot.pti_label}</p>}
              </div>
              {lot.gtin && <span className="text-xs text-slate-500">GTIN {lot.gtin}</span>}
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
