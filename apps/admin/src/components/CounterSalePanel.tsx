'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  PRODUCT_UNIT_LABELS,
  STOCK_STATUS_LABELS,
  formatMoney,
  formatProductQuantity,
  getDefaultQuantity,
  getQuantityStep,
  getStockStatus,
  isValidMexicanPhone,
  normalizePhone,
  type PaymentMethod,
  type ProductUnit,
} from '@puertaverde/shared';

export interface CounterProduct {
  id: string;
  price: number;
  stock: number;
  product: { id: string; name: string; unit: ProductUnit; image_url?: string | null };
}

interface CartItem {
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

export function buildTicketText(input: {
  orderNumber: number;
  customerName: string;
  paymentMethod?: string | null;
  statusLabel?: string;
  total: number;
  items: ReceiptItem[];
}) {
  const method =
    PAYMENT_METHOD_LABELS[(input.paymentMethod as PaymentMethod) ?? 'cash'] ??
    input.paymentMethod ??
    'Efectivo';
  const lines = input.items.map((item) => {
    const unit = item.unit ? PRODUCT_UNIT_LABELS[item.unit as ProductUnit] ?? item.unit : '';
    return `• ${item.product_name} ${Number(item.quantity)} ${unit} — ${formatMoney(Number(item.line_total))}`;
  });
  return [
    `Puerta Verde · Ticket #${input.orderNumber}`,
    `Cliente: ${input.customerName}`,
    input.statusLabel ? `Estado: ${input.statusLabel}` : null,
    '',
    ...(lines.length ? lines : ['• (sin partidas)']),
    '',
    `Total: ${formatMoney(input.total)}${input.paymentMethod ? ` (${method})` : ''}`,
    '¡Gracias por tu compra!',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function whatsappTicketHref(phone: string, text: string) {
  const digits = normalizePhone(phone);
  return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`;
}

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
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    order: CreatedOrder;
    items: ReceiptItem[];
    ticketText: string;
  } | null>(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => product.product.name.toLowerCase().includes(q));
  }, [products, search]);

  const total = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const product = productById.get(item.branchProductId);
        if (!product || !(item.quantity > 0)) return sum;
        return sum + Number(product.price) * item.quantity;
      }, 0),
    [cart, productById],
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
    setSearch('');
    setPaymentMethod('cash');
    setSendWhatsApp(true);
    setCart([]);
    setLookupHint(null);
    setError(null);
  }

  function addProduct(product: CounterProduct) {
    const unit = product.product.unit;
    setCart((current) => {
      const existing = current.find((item) => item.branchProductId === product.id);
      if (existing) {
        return current.map((item) =>
          item.branchProductId === product.id
            ? { ...item, quantity: Number((item.quantity + getQuantityStep(unit)).toFixed(3)) }
            : item,
        );
      }
      return [...current, { branchProductId: product.id, quantity: getDefaultQuantity(unit) }];
    });
  }

  function updateQty(productId: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) => (item.branchProductId === productId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0),
    );
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
          sendWhatsApp: false,
          items: cart
            .filter((item) => item.quantity > 0)
            .map((item) => ({
              branchProductId: item.branchProductId,
              quantity: item.quantity,
            })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo registrar');
      if (payload.order) onCreated(payload.order);
      const apiItems = (payload.items ?? []) as ReceiptItem[];
      const items: ReceiptItem[] =
        apiItems.length > 0
          ? apiItems
          : cart.flatMap((item) => {
              const product = productById.get(item.branchProductId);
              if (!product || !(item.quantity > 0)) return [];
              return [
                {
                  product_name: product.product.name,
                  unit: product.product.unit,
                  quantity: item.quantity,
                  unit_price: Number(product.price),
                  line_total: Number(product.price) * item.quantity,
                },
              ];
            });
      const ticketText = buildTicketText({
        orderNumber: Number(payload.order.order_number),
        customerName: payload.order.customer_name,
        paymentMethod: payload.order.payment_method,
        total: Number(payload.order.total),
        items,
      });
      setReceipt({ order: payload.order, items, ticketText });
      if (sendWhatsApp) {
        window.open(whatsappTicketHref(payload.order.customer_phone, ticketText), '_blank');
      }
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
            href={whatsappTicketHref(receipt.order.customer_phone, receipt.ticketText)}
            target="_blank"
            rel="noreferrer"
          >
            Enviar por WhatsApp
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
    <section className="pv-glass-card mb-6 space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Venta mostrador</h2>
          <p className="text-sm text-slate-500">Catálogo compacto, como en la tienda.</p>
        </div>
        <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setOpen(false)}>
          Cerrar
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-3">
          <input
            type="search"
            className="pv-input"
            placeholder="Buscar fruta, verdura..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid max-h-[28rem] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {filteredProducts.map((product) => {
              const unit = product.product.unit;
              const status = getStockStatus(Number(product.stock), true);
              return (
                <article key={product.id} className="rounded-xl border border-slate-200/80 bg-white p-2.5">
                  {product.product.image_url ? (
                    <div className="relative mb-2 h-16 w-full overflow-hidden rounded-lg">
                      <Image
                        src={product.product.image_url}
                        alt={product.product.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="mb-2 flex h-16 items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">
                      Sin foto
                    </div>
                  )}
                  <p className="truncate text-sm font-semibold text-slate-900">{product.product.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatMoney(Number(product.price))} / {PRODUCT_UNIT_LABELS[unit]}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        status === 'out'
                          ? 'bg-red-100 text-red-700'
                          : status === 'low'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {STOCK_STATUS_LABELS[status]}
                    </span>
                    <button
                      type="button"
                      disabled={status === 'out'}
                      onClick={() => addProduct(product)}
                      className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Agregar
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
          <div className="grid gap-3">
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
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800">Tu pedido</h3>
            {cart.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Agrega productos del catálogo.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {cart.map((item) => {
                  const product = productById.get(item.branchProductId);
                  if (!product) return null;
                  const unit = product.product.unit;
                  return (
                    <li key={item.branchProductId} className="rounded-xl bg-white p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-slate-800">{product.product.name}</span>
                        <button
                          type="button"
                          className="text-xs text-slate-400"
                          onClick={() => updateQty(item.branchProductId, 0)}
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="h-7 w-7 rounded-full border border-slate-200"
                            onClick={() =>
                              updateQty(
                                item.branchProductId,
                                Number((item.quantity - getQuantityStep(unit)).toFixed(3)),
                              )
                            }
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            step={getQuantityStep(unit)}
                            className="pv-input w-16 py-1 text-center text-xs"
                            value={item.quantity}
                            onChange={(e) => updateQty(item.branchProductId, Number(e.target.value))}
                          />
                          <button
                            type="button"
                            className="h-7 w-7 rounded-full border border-slate-200"
                            onClick={() =>
                              updateQty(
                                item.branchProductId,
                                Number((item.quantity + getQuantityStep(unit)).toFixed(3)),
                              )
                            }
                          >
                            +
                          </button>
                        </div>
                        <span className="text-xs text-slate-600">
                          {formatProductQuantity(item.quantity, unit)} ·{' '}
                          {formatMoney(Number(product.price) * item.quantity)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Notas (opcional)</span>
            <input
              className="pv-input mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sin cebolla, recoger después…"
            />
          </label>
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
            Abrir WhatsApp con el ticket
          </label>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <span className="text-sm font-semibold text-slate-900">{formatMoney(total)}</span>
            <button
              type="button"
              disabled={saving || cart.length === 0}
              onClick={submitSale}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'Registrando…' : 'Cobrar y entregar'}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
