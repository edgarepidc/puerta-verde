'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  PRODUCT_UNIT_LABELS,
  formatMoney,
  isValidMexicanPhone,
  type PaymentMethod,
  type ProductUnit,
} from '@puertaverde/shared';

export interface CounterProduct {
  id: string;
  price: number;
  stock: number;
  product: { id: string; name: string; unit: ProductUnit };
}

interface LineDraft {
  key: string;
  branchProductId: string;
  quantity: number;
}

interface CreatedOrder {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  status: string;
  fulfillment_type: 'delivery' | 'pickup';
  total: number;
  payment_status: string;
  payment_method: string | null;
  created_at: string;
  branch_id?: string;
}

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card_terminal', label: 'TPV' },
  { value: 'transfer', label: 'Transferencia' },
];

export function CounterSalePanel({
  products,
  onCreated,
}: {
  products: CounterProduct[];
  onCreated: (order: CreatedOrder) => void;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [lines, setLines] = useState<LineDraft[]>([
    { key: '1', branchProductId: '', quantity: 1 },
  ]);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const total = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const product = productById.get(line.branchProductId);
        if (!product || !(line.quantity > 0)) return sum;
        return sum + Number(product.price) * line.quantity;
      }, 0),
    [lines, productById],
  );

  useEffect(() => {
    if (!open || !isValidMexicanPhone(phone)) {
      setLookupHint(null);
      return;
    }

    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/customers/lookup?phone=${encodeURIComponent(phone)}`);
        const payload = await response.json();
        if (!response.ok) return;
        if (payload.customer) {
          setName((current) => current.trim() || payload.customer.full_name || current);
          const count = payload.recentOrders?.length ?? 0;
          setLookupHint(
            count > 0
              ? `Cliente conocido · ${count} pedido(s) reciente(s)`
              : 'Cliente ya registrado',
          );
        } else {
          setLookupHint('Cliente nuevo');
        }
      } catch {
        setLookupHint(null);
      }
    }, 400);

    return () => window.clearTimeout(handle);
  }, [phone, open]);

  async function submitSale() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone,
          fulfillmentType: 'pickup',
          deliveryNotes: notes || null,
          paymentMethod,
          markDelivered: true,
          items: lines
            .filter((line) => line.branchProductId && line.quantity > 0)
            .map((line) => ({
              branchProductId: line.branchProductId,
              quantity: line.quantity,
            })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo registrar');
      if (payload.order) onCreated(payload.order);
      setPhone('');
      setName('');
      setNotes('');
      setPaymentMethod('cash');
      setLines([{ key: String(Date.now()), branchProductId: '', quantity: 1 }]);
      setLookupHint(null);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar venta');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-500">Web y mostrador en un solo tablero</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
        >
          + Nueva venta (mostrador)
        </button>
      </div>
    );
  }

  return (
    <section className="pv-glass-card mb-6 space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Venta mostrador</h2>
          <p className="text-sm text-slate-500">
            Registra con celular. Si el cliente ya existe, rellenamos el nombre.
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-slate-500 hover:text-slate-800"
          onClick={() => setOpen(false)}
        >
          Cerrar
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Celular *</span>
          <input
            className="pv-input mt-1"
            inputMode="tel"
            placeholder="5512345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {lookupHint && <span className="mt-1 block text-xs text-emerald-700">{lookupHint}</span>}
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Nombre *</span>
          <input
            className="pv-input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del cliente"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="font-medium text-slate-700">Notas</span>
          <input
            className="pv-input mt-1"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
          />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-800">Productos</h3>
          <button
            type="button"
            className="text-sm font-medium text-emerald-800"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                { key: String(Date.now()), branchProductId: '', quantity: 1 },
              ])
            }
          >
            + Agregar
          </button>
        </div>
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="grid gap-3 rounded-xl border border-slate-200/80 bg-white/50 p-3 md:grid-cols-[2fr_1fr_auto]"
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
                    {product.product.name} — {formatMoney(Number(product.price))}/
                    {PRODUCT_UNIT_LABELS[product.product.unit]}
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

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200/70 pt-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Cobro</span>
          <select
            className="pv-input mt-1"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            Total: <span className="font-semibold text-slate-900">{formatMoney(total)}</span>
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={submitSale}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Registrando…' : 'Cobrar y entregar'}
          </button>
        </div>
      </div>
    </section>
  );
}
