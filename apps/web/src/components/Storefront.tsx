'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  applyDiscount,
  formatMoney,
  formatProductQuantity,
  FULFILLMENT_LABELS,
  getActiveDiscountPercent,
  getDefaultQuantity,
  getQuantityStep,
  getStockStatus,
  PRODUCT_UNIT_LABELS,
  STOCK_STATUS_LABELS,
  type FulfillmentType,
  type ProductUnit,
  type PromotionKind,
  validateGuestCheckout,
} from '@puertaverde/shared';

import type { StorefrontProduct } from '@/app/[slug]/page';
import { BrandLogo } from '@/components/BrandLogo';

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
  kind: PromotionKind;
  image_url: string | null;
  discount_percent: number | null;
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
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pickerProduct, setPickerProduct] = useState<StorefrontProduct | null>(null);
  const [pickerQty, setPickerQty] = useState(1);

  const discountPercent = useMemo(() => getActiveDiscountPercent(promotions), [promotions]);

  const categories = useMemo(() => {
    const names = new Set<string>();
    products.forEach((p) => names.add(p.product.category?.name ?? 'General'));
    return ['all', ...Array.from(names).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      const category = product.product.category?.name ?? 'General';
      if (categoryFilter !== 'all' && category !== categoryFilter) return false;
      if (!q) return true;
      return (
        product.product.name.toLowerCase().includes(q) ||
        category.toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryFilter]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );
  const deliveryFee = fulfillmentType === 'delivery' ? Number(branch.delivery_fee) : 0;
  const total = subtotal + deliveryFee;

  function effectivePrice(basePrice: number): number {
    return applyDiscount(basePrice, discountPercent);
  }

  function openPicker(product: StorefrontProduct) {
    const unit = product.product.unit as ProductUnit;
    const status = getStockStatus(Number(product.stock), true);
    if (status === 'out') return;
    setPickerProduct(product);
    setPickerQty(getDefaultQuantity(unit));
  }

  function addToCart(product: StorefrontProduct, quantity: number) {
    const unit = product.product.unit as ProductUnit;
    const price = effectivePrice(Number(product.price));
    setCart((current) => {
      const existing = current.find((item) => item.branchProductId === product.id);
      if (existing) {
        return current.map((item) =>
          item.branchProductId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [
        ...current,
        {
          branchProductId: product.id,
          name: product.product.name,
          unit,
          price,
          quantity,
        },
      ];
    });
    setPickerProduct(null);
  }

  function confirmPicker() {
    if (!pickerProduct) return;
    const maxStock = Number(pickerProduct.stock);
    if (pickerQty > maxStock) {
      setError(`Solo hay ${formatProductQuantity(maxStock, pickerProduct.product.unit as ProductUnit)} disponibles.`);
      return;
    }
    setError(null);
    addToCart(pickerProduct, pickerQty);
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

  const bannerPromos = promotions.filter((p) => p.kind === 'banner' || p.kind === 'bundle');
  const discountPromo = promotions.find((p) => p.kind === 'discount' && p.discount_percent);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-green-100">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo href="/" imageClassName="h-14 w-auto" />
          <div className="text-left sm:text-right">
            <p className="text-sm font-medium text-[var(--pv-green-600)]">{branch.org_name}</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--pv-green-900)]">{branch.name}</h1>
          </div>
        </div>
        <p className="mt-4 text-[var(--pv-green-800)]">
          Pedido mínimo {formatMoney(Number(branch.minimum_order_amount))}
          {Number(branch.delivery_fee) > 0
            ? ` · Envío ${formatMoney(Number(branch.delivery_fee))}`
            : ' · Entrega para vecinos'}
        </p>
        {discountPromo && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            {discountPromo.title} — {Number(discountPromo.discount_percent)}% en todo el catálogo hoy
          </p>
        )}
      </header>

      {bannerPromos.length > 0 && (
        <section className="mb-8 grid gap-4 md:grid-cols-2">
          {bannerPromos.map((promo) => (
            <article
              key={promo.id}
              className="overflow-hidden rounded-2xl bg-[var(--pv-green-700)] text-white"
            >
              {promo.image_url && (
                <div className="relative h-36 w-full">
                  <Image
                    src={promo.image_url}
                    alt={promo.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              )}
              <div className="p-5">
                <h2 className="text-lg font-semibold">{promo.title}</h2>
                {promo.body && <p className="mt-2 text-sm text-green-50">{promo.body}</p>}
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-[var(--pv-green-900)]">Catálogo</h2>
            <input
              type="search"
              placeholder="Buscar fruta, verdura..."
              className="w-full rounded-full border border-green-200 px-4 py-2 text-sm sm:max-w-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setCategoryFilter(category)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  categoryFilter === category
                    ? 'bg-[var(--pv-green-700)] text-white'
                    : 'bg-green-50 text-[var(--pv-green-800)]'
                }`}
              >
                {category === 'all' ? 'Todos' : category}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {filteredProducts.map((product) => {
              const unit = product.product.unit as ProductUnit;
              const status = getStockStatus(Number(product.stock), true);
              const basePrice = Number(product.price);
              const salePrice = effectivePrice(basePrice);
              const hasDiscount = discountPercent > 0 && salePrice < basePrice;

              return (
                <article key={product.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-green-100">
                  {product.product.image_url && (
                    <div className="relative mb-3 h-32 w-full overflow-hidden rounded-xl">
                      <Image
                        src={product.product.image_url}
                        alt={product.product.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs uppercase tracking-wide text-[var(--pv-green-600)]">
                          {product.product.category?.name ?? 'General'}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            status === 'out'
                              ? 'bg-red-100 text-red-700'
                              : status === 'low'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {STOCK_STATUS_LABELS[status]}
                        </span>
                      </div>
                      <h3 className="font-semibold text-[var(--pv-green-900)]">{product.product.name}</h3>
                      <p className="text-sm text-[var(--pv-green-800)]">
                        {hasDiscount ? (
                          <>
                            <span className="mr-2 text-slate-400 line-through">
                              {formatMoney(basePrice)}
                            </span>
                            <span className="font-semibold text-red-700">{formatMoney(salePrice)}</span>
                          </>
                        ) : (
                          formatMoney(basePrice)
                        )}{' '}
                        / {PRODUCT_UNIT_LABELS[unit]}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={status === 'out'}
                      onClick={() => openPicker(product)}
                      className="shrink-0 rounded-full bg-[var(--pv-green-600)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {status === 'out' ? 'Agotado' : 'Agregar'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <p className="rounded-2xl bg-green-50 p-6 text-center text-sm text-[var(--pv-green-800)]">
              No hay productos con ese filtro. Prueba otra categoría o búsqueda.
            </p>
          )}
        </section>

        <aside className="h-fit rounded-3xl bg-white p-5 shadow-sm ring-1 ring-green-100 lg:sticky lg:top-6">
          <h2 className="text-xl font-semibold text-[var(--pv-green-900)]">Tu pedido</h2>
          {cart.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--pv-green-800)]">Agrega productos para continuar.</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {cart.map((item) => (
                <li key={item.branchProductId} className="flex justify-between gap-3">
                  <span>
                    {item.name} × {formatProductQuantity(item.quantity, item.unit)}
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

      {pickerProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--pv-green-900)]">
              {pickerProduct.product.name}
            </h3>
            <p className="mt-1 text-sm text-[var(--pv-green-800)]">
              Disponible: {formatProductQuantity(Number(pickerProduct.stock), pickerProduct.product.unit as ProductUnit)}
            </p>
            <label className="mt-4 block text-sm font-medium">
              Cantidad ({PRODUCT_UNIT_LABELS[pickerProduct.product.unit as ProductUnit]})
              <input
                type="number"
                min={getQuantityStep(pickerProduct.product.unit as ProductUnit)}
                step={getQuantityStep(pickerProduct.product.unit as ProductUnit)}
                max={Number(pickerProduct.stock)}
                className="mt-1 w-full rounded-xl border border-green-200 px-3 py-2"
                value={pickerQty}
                onChange={(e) => setPickerQty(Number(e.target.value))}
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPickerProduct(null)}
                className="flex-1 rounded-full border border-green-200 px-4 py-2 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPicker}
                className="flex-1 rounded-full bg-[var(--pv-green-700)] px-4 py-2 text-sm font-semibold text-white"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
