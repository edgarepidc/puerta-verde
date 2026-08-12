'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  PRODUCT_UNIT_LABELS,
  formatMoney,
  isValidMexicanPhone,
  type PaymentMethod,
  type ProductUnit,
} from '@puertaverde/shared';

import { ProductSearchSelect } from '@/components/ProductSearchSelect';

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

interface ReceiptItem {
  product_name: string;
  unit?: ProductUnit | string;
  quantity: number;
  unit_price: number;
  line_total: number;
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

const POS_METHODS: PaymentMethod[] = ['cash', 'card_terminal', 'transfer'];

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
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [lines, setLines] = useState<LineDraft[]>([
    { key: '1', branchProductId: '', quantity: 1 },
  ]);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    order: CreatedOrder;
    items: ReceiptItem[];
    whatsappSent: boolean;
  } | null>(null);

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

  function resetForm() {
    setPhone('');
    setName('');
    setNotes('');
    setPaymentMethod('cash');
    setSendWhatsApp(true);
    setLines([{ key: String(Date.now()), branchProductId: '', quantity: 1 }]);
    setLookupHint(null);
    setError(null);
  }

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
          sendWhatsApp,
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
      setReceipt({
        order: payload.order,
        items: payload.items ?? [],
        whatsappSent: Boolean(payload.whatsappSent),
      });
      resetForm();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar venta');
    } finally {
      setSaving(false);
    }
  }

  if (receipt) {
    const methodLabel =
      PAYMENT_METHOD_LABELS[(receipt.order.payment_method as PaymentMethod) ?? 'cash'] ??
      receipt.order.payment_method;
    return (
      <section className="pv-glass-card mb-6 space-y-4 p-6 print:border print:shadow-none" id="pv-receipt">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Ticket #{receipt.order.order_number}</h2>
            <p className="text-sm text-slate-500">
              {receipt.order.customer_name} · {receipt.order.customer_phone}
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500 print:hidden" onClick={() => setReceipt(null)}>
            Cerrar
          </button>
        </div>
        <ul className="space-y-1 text-sm">
          {receipt.items.map((item) => (
            <li key={`${item.product_name}-${item.quantity}`} className="flex justify-between gap-3">
              <span>
                {item.product_name} × {Number(item.quantity)}{' '}
                {item.unit ? PRODUCT_UNIT_LABELS[item.unit as ProductUnit] ?? item.unit : ''}
              </span>
              <span>{formatMoney(Number(item.line_total))}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-slate-200 pt-3 text-sm font-semibold">
          <span>Total · {methodLabel}</span>
          <span>{formatMoney(Number(receipt.order.total))}</span>
        </div>
        {receipt.whatsappSent && (
          <p className="text-xs text-emerald-700">Recibo enviado por WhatsApp.</p>
        )}
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white"
            onClick={() => window.print()}
          >
            Imprimir
          </button>
          <a
            className="rounded-full border border-slate-300 px-4 py-2 text-sm"
            href={`https://wa.me/${receipt.order.customer_phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir WhatsApp
          </a>
          <button
            type="button"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm"
            onClick={() => {
              setReceipt(null);
              setOpen(true);
            }}
          >
            Nueva venta
          </button>
        </div>
      </section>
    );
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
            Busca producto, cobra y entrega. Si el celular ya existe, rellenamos el nombre.
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
              <ProductSearchSelect
                products={products}
                value={line.branchProductId}
                onChange={(id) =>
                  setLines((prev) =>
                    prev.map((row, i) => (i === index ? { ...row, branchProductId: id } : row)),
                  )
                }
              />
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
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Cobro</span>
            <select
              className="pv-input mt-1"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {POS_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sendWhatsApp}
              onChange={(e) => setSendWhatsApp(e.target.checked)}
            />
            Enviar recibo por WhatsApp
          </label>
        </div>
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
