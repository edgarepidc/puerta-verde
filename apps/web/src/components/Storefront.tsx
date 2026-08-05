'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  formatMoney,
  FULFILLMENT_LABELS,
  PRODUCT_UNIT_LABELS,
  type FulfillmentType,
  type ProductUnit,
  validateGuestCheckout,
} from '@puertaverde/shared';

import type { StorefrontProduct } from '@/app/[slug]/page';

interface Building {
  id: string;
  name: string;
  units: Array<{ id: string; identifier: string }>;
}

interface BranchInfo {
  id: string;
  name: string;
  slug: string;
  pickup_instructions: string | null;
  delivery_fee: number;
  minimum_order_amount: number;
  org_name: string;
}

interface Promotion {
  id: string;
  title: string;
  body: string | null;
}

interface CartItem {
  branchProductId: string;
  name: string;
  unit: ProductUnit;
  price: number;
  quantity: number;
}

export function Storefront({
  branch,
  products,
  promotions,
  buildings,
}: {
  branch: BranchInfo;
  products: StorefrontProduct[];
  promotions: Promotion[];
  buildings: Building[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [unitId, setUnitId] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );
  const deliveryFee = fulfillmentType === 'delivery' ? Number(branch.delivery_fee) : 0;
  const total = subtotal + deliveryFee;

  function addToCart(product: StorefrontProduct) {
    setCart((current) => {
      const existing = current.find((item) => item.branchProductId === product.id);
      if (existing) {
        return current.map((item) =>
          item.branchProductId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...current,
        {
          branchProductId: product.id,
          name: product.product.name,
          unit: product.product.unit as ProductUnit,
          price: Number(product.price),
          quantity: 1,
        },
      ];
    });
  }

  async function submitOrder() {
    setError(null);
    const validationError = validateGuestCheckout({
      customerName,
      customerPhone,
      fulfillmentType,
      unitId: fulfillmentType === 'delivery' ? unitId : null,
      deliveryNotes,
      items: cart.map((item) => ({
        branchProductId: item.branchProductId,
        quantity: item.quantity,
      })),
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (subtotal < Number(branch.minimum_order_amount)) {
      setError(`El pedido mínimo es ${formatMoney(Number(branch.minimum_order_amount))}.`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchSlug: branch.slug,
          customerName,
          customerPhone,
          fulfillmentType,
          unitId: fulfillmentType === 'delivery' ? unitId : null,
          deliveryNotes,
          items: cart.map((item) => ({
            branchProductId: item.branchProductId,
            quantity: item.quantity,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo crear el pedido');
      }
      router.push(`/pedido/${payload.trackingToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar pedido');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-green-100">
        <p className="text-sm font-medium text-[var(--pv-green-600)]">{branch.org_name}</p>
        <h1 className="mt-1 text-3xl font-bold text-[var(--pv-green-900)]">{branch.name}</h1>
        <p className="mt-2 text-[var(--pv-green-800)]">
          Pedido mínimo {formatMoney(Number(branch.minimum_order_amount))} · Entrega gratis para vecinos
        </p>
      </header>

      {promotions.length > 0 && (
        <section className="mb-8 grid gap-4 md:grid-cols-2">
          {promotions.map((promo) => (
            <article key={promo.id} className="rounded-2xl bg-[var(--pv-green-700)] p-5 text-white">
              <h2 className="text-lg font-semibold">{promo.title}</h2>
              {promo.body && <p className="mt-2 text-sm text-green-50">{promo.body}</p>}
            </article>
          ))}
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[var(--pv-green-900)]">Catálogo</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {products.map((product) => (
              <article key={product.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-green-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--pv-green-600)]">
                      {product.product.category?.name ?? 'General'}
                    </p>
                    <h3 className="font-semibold text-[var(--pv-green-900)]">{product.product.name}</h3>
                    <p className="text-sm text-[var(--pv-green-800)]">
                      {formatMoney(Number(product.price))} / {PRODUCT_UNIT_LABELS[product.product.unit as ProductUnit]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    className="rounded-full bg-[var(--pv-green-600)] px-4 py-2 text-sm font-medium text-white"
                  >
                    Agregar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="h-fit rounded-3xl bg-white p-5 shadow-sm ring-1 ring-green-100">
          <h2 className="text-xl font-semibold text-[var(--pv-green-900)]">Tu pedido</h2>
          {cart.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--pv-green-800)]">Agrega productos para continuar.</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {cart.map((item) => (
                <li key={item.branchProductId} className="flex justify-between gap-3">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span>{formatMoney(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium">Nombre</label>
            <input
              className="w-full rounded-xl border border-green-200 px-3 py-2"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Tu nombre"
            />
            <label className="block text-sm font-medium">WhatsApp / teléfono</label>
            <input
              className="w-full rounded-xl border border-green-200 px-3 py-2"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="55 1234 5678"
            />
            <label className="block text-sm font-medium">¿Cómo lo recibes?</label>
            <div className="grid grid-cols-2 gap-2">
              {(['delivery', 'pickup'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFulfillmentType(type)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium ${
                    fulfillmentType === type
                      ? 'bg-[var(--pv-green-700)] text-white'
                      : 'bg-green-50 text-[var(--pv-green-800)]'
                  }`}
                >
                  {FULFILLMENT_LABELS[type]}
                </button>
              ))}
            </div>
            {fulfillmentType === 'delivery' ? (
              <>
                <label className="block text-sm font-medium">Departamento</label>
                <select
                  className="w-full rounded-xl border border-green-200 px-3 py-2"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                >
                  <option value="">Selecciona tu depto</option>
                  {buildings.map((building) => (
                    <optgroup key={building.id} label={building.name}>
                      {building.units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {building.name} — {unit.identifier}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </>
            ) : (
              <p className="rounded-xl bg-green-50 p-3 text-sm text-[var(--pv-green-800)]">
                {branch.pickup_instructions ?? 'Pasa a recoger en el local.'}
              </p>
            )}
            <label className="block text-sm font-medium">Notas</label>
            <textarea
              className="w-full rounded-xl border border-green-200 px-3 py-2"
              rows={3}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Ej. sin cebolla, entregar después de las 6pm"
            />
          </div>

          <div className="mt-6 space-y-1 border-t border-green-100 pt-4 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between">
                <span>Envío</span>
                <span>{formatMoney(deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            type="button"
            disabled={submitting || cart.length === 0}
            onClick={submitOrder}
            className="mt-4 w-full rounded-full bg-[var(--pv-green-700)] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Enviando...' : 'Confirmar pedido'}
          </button>
        </aside>
      </div>
    </main>
  );
}
