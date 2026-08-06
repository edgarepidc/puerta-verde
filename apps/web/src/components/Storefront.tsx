'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  ORDER_STATUS_LABELS,
  PRODUCT_UNIT_LABELS,
  STOCK_STATUS_LABELS,
  type FulfillmentType,
  type OrderStatus,
  type ProductUnit,
  type PromotionKind,
  validateGuestCheckout,
} from '@puertaverde/shared';

import type { StorefrontProduct } from '@/app/[slug]/page';
import { BrandLogo } from '@/components/BrandLogo';
import { CartBasketIcon } from '@/components/CartBasketIcon';
import { PromoCarousel, type CarouselSlide } from '@/components/PromoCarousel';

interface Building {
  id: string;
  name: string;
  units: Array<{ id: string; identifier: string }>;
}

interface BranchInfo {
  id: string;
  organization_id: string;
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

interface LookupOrder {
  orderNumber: number;
  status: OrderStatus;
  total: number;
  trackingToken: string;
  createdAt: string;
  branchName: string;
}

const DEFAULT_HERO: CarouselSlide = {
  id: 'default-hero',
  title: 'Frescos del día, a tu puerta',
  body: 'Frutas y verduras seleccionadas. Pide en minutos y recibe en tu edificio.',
  imageUrl: '/brand/store-hero-default.jpg',
};

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
  const [paymentPreference, setPaymentPreference] = useState<'on_delivery' | 'online'>('on_delivery');
  const [pickerProduct, setPickerProduct] = useState<StorefrontProduct | null>(null);
  const [pickerQty, setPickerQty] = useState(1);
  const [pickerMode, setPickerMode] = useState<'add' | 'edit'>('add');
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundOrders, setFoundOrders] = useState<LookupOrder[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [orderPulse, setOrderPulse] = useState(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartListRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

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
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const carouselSlides = useMemo<CarouselSlide[]>(() => {
    const fromPromos = promotions
      .filter((p) => (p.kind === 'banner' || p.kind === 'bundle') && p.image_url)
      .map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        imageUrl: p.image_url as string,
      }));
    if (fromPromos.length > 0) return fromPromos;

    const textPromo = promotions.find((p) => p.kind === 'banner' || p.kind === 'bundle');
    if (textPromo) {
      return [
        {
          id: textPromo.id,
          title: textPromo.title,
          body: textPromo.body,
          imageUrl: DEFAULT_HERO.imageUrl,
        },
      ];
    }
    return [DEFAULT_HERO];
  }, [promotions]);

  const discountPromo = promotions.find((p) => p.kind === 'discount' && p.discount_percent);

  function effectivePrice(basePrice: number): number {
    return applyDiscount(basePrice, discountPercent);
  }

  function openPicker(product: StorefrontProduct) {
    const unit = product.product.unit as ProductUnit;
    const status = getStockStatus(Number(product.stock), true);
    if (status === 'out') return;
    setPickerMode('add');
    setPickerProduct(product);
    setPickerQty(getDefaultQuantity(unit));
  }

  function openEditCartItem(item: CartItem) {
    const product = products.find((row) => row.id === item.branchProductId);
    if (!product) return;
    setPickerMode('edit');
    setPickerProduct(product);
    setPickerQty(item.quantity);
  }

  function removeFromCart(branchProductId: string) {
    setCart((current) => current.filter((item) => item.branchProductId !== branchProductId));
    if (highlightId === branchProductId) setHighlightId(null);
  }

  function adjustCartQty(branchProductId: string, delta: number) {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.branchProductId !== branchProductId) return [item];
        const step = getQuantityStep(item.unit);
        const next = Number((item.quantity + delta * step).toFixed(3));
        if (next <= 0) return [];
        const product = products.find((row) => row.id === branchProductId);
        const maxStock = product ? Number(product.stock) : next;
        return [{ ...item, quantity: Math.min(next, maxStock) }];
      }),
    );
  }

  function confirmPicker() {
    if (!pickerProduct) return;
    const unit = pickerProduct.product.unit as ProductUnit;
    const qty = Number(pickerQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const price = effectivePrice(Number(pickerProduct.price));
    const addedId = pickerProduct.id;
    const mode = pickerMode;
    setCart((current) => {
      const existing = current.find((item) => item.branchProductId === pickerProduct.id);
      if (existing) {
        return current.map((item) =>
          item.branchProductId === pickerProduct.id
            ? {
                ...item,
                quantity: mode === 'edit' ? qty : item.quantity + qty,
                price,
              }
            : item,
        );
      }
      return [
        ...current,
        {
          branchProductId: pickerProduct.id,
          name: pickerProduct.product.name,
          unit,
          price,
          quantity: qty,
        },
      ];
    });
    setPickerProduct(null);
    setPickerMode('add');
    setHighlightId(addedId);
    setOrderPulse(true);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setHighlightId(null);
      setOrderPulse(false);
    }, 1600);
    requestAnimationFrame(() => {
      document.getElementById('pedido')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      cartListRef.current
        ?.querySelector(`[data-cart-id="${addedId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
          paymentPreference,
          items: cart.map((item) => ({
            branchProductId: item.branchProductId,
            quantity: item.quantity,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo crear el pedido');

      if (payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }
      router.push(`/pedido/${payload.trackingToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar pedido');
    } finally {
      setSubmitting(false);
    }
  }

  async function searchOrders() {
    setLookupLoading(true);
    setLookupError(null);
    try {
      const response = await fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: lookupPhone, branchSlug: branch.slug }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo buscar');
      setFoundOrders(payload.orders ?? []);
      if (!(payload.orders ?? []).length) {
        setLookupError('No encontramos pedidos con ese teléfono.');
      }
    } catch (err) {
      setFoundOrders([]);
      setLookupError(err instanceof Error ? err.message : 'Error al buscar');
    } finally {
      setLookupLoading(false);
    }
  }

  return (
    <>
      <div className="pv-ambient" aria-hidden />
      <div className="relative min-h-screen">
        <header className="pv-store-nav sticky top-0 z-40 backdrop-blur-md">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5 sm:py-3">
            <BrandLogo href={`/${branch.slug}`} imageClassName="h-20 w-auto sm:h-24" priority />
            <nav className="pv-store-nav__menu hidden md:flex" aria-label="Menú de la tienda">
              <a href="#inicio" className="pv-store-link">
                Inicio
              </a>
              <a href="#catalogo" className="pv-store-link">
                Catálogo
              </a>
              <button type="button" onClick={() => setOrdersOpen(true)} className="pv-store-link">
                Mis pedidos
              </button>
              <a href="#pedido" className="pv-store-link inline-flex items-center gap-1.5">
                <CartBasketIcon className="h-4 w-4" />
                Carrito
              </a>
            </nav>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOrdersOpen(true)}
                className="pv-btn-ghost px-3 py-2 text-xs sm:text-sm md:hidden"
              >
                Pedidos
              </button>
              <a
                href="#pedido"
                className="pv-btn-primary relative inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:px-4 sm:text-sm"
              >
                <CartBasketIcon className="h-4 w-4" tone="onPrimary" />
                <span>Carrito</span>
                {cartCount > 0 ? (
                  <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums sm:text-xs">
                    {cartCount}
                  </span>
                ) : null}
              </a>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          <section id="inicio" className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--pv-green-600)]">{branch.org_name}</p>
                <h1 className="text-2xl font-bold text-[var(--pv-green-900)] sm:text-3xl">
                  {branch.name}
                </h1>
              </div>
              <p className="text-sm text-slate-600">
                Mínimo {formatMoney(Number(branch.minimum_order_amount))}
                {Number(branch.delivery_fee) > 0
                  ? ` · Envío ${formatMoney(Number(branch.delivery_fee))}`
                  : ' · Entrega a vecinos'}
              </p>
            </div>

            <PromoCarousel slides={carouselSlides} />

            {discountPromo && (
              <p className="pv-callout--amber px-4 py-3 text-sm font-medium">
                {discountPromo.title} — {Number(discountPromo.discount_percent)}% en todo el catálogo
              </p>
            )}
          </section>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.7fr_1fr]">
            <section id="catalogo" className="space-y-4 scroll-mt-24">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-semibold text-[var(--pv-green-900)]">Catálogo</h2>
                <input
                  type="search"
                  placeholder="Buscar fruta, verdura..."
                  className="pv-input w-full sm:max-w-xs"
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
                    className={`pv-pill ${
                      categoryFilter === category ? 'pv-pill--active' : 'pv-pill--inactive'
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
                    <article
                      key={product.id}
                      className="pv-glass-card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="relative h-36 w-full bg-gradient-to-br from-green-50 to-emerald-100">
                        {product.product.image_url ? (
                          <Image
                            src={product.product.image_url}
                            alt={product.product.name}
                            fill
                            className="object-cover transition duration-300 group-hover:scale-[1.03]"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_30%_30%,#bbf7d4,transparent_55%),radial-gradient(circle_at_70%_70%,#86efac,transparent_50%)]" />
                        )}
                      </div>
                      <div className="p-4">
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
                        <h3 className="mt-1 font-semibold text-[var(--pv-green-900)]">
                          {product.product.name}
                        </h3>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <p className="text-sm text-[var(--pv-green-800)]">
                            {hasDiscount ? (
                              <>
                                <span className="mr-2 text-slate-400 line-through">
                                  {formatMoney(basePrice)}
                                </span>
                                <span className="font-semibold text-red-700">
                                  {formatMoney(salePrice)}
                                </span>
                              </>
                            ) : (
                              <span className="font-semibold">{formatMoney(basePrice)}</span>
                            )}{' '}
                            / {PRODUCT_UNIT_LABELS[unit]}
                          </p>
                          <button
                            type="button"
                            disabled={status === 'out'}
                            onClick={() => openPicker(product)}
                            className="pv-btn-primary shrink-0 px-3 py-2 text-xs disabled:cursor-not-allowed sm:text-sm"
                          >
                            {status === 'out' ? 'Agotado' : 'Agregar'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {filteredProducts.length === 0 && (
                <p className="pv-callout p-6 text-center text-sm">
                  No hay productos con ese filtro. Prueba otra categoría o búsqueda.
                </p>
              )}
            </section>

            <aside
              id="pedido"
              className={`pv-glass-panel h-fit scroll-mt-24 p-5 lg:sticky lg:top-24 ${
                orderPulse ? 'pv-order-panel--pulse' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 ring-1 ring-green-100">
                  <CartBasketIcon className="h-8 w-8" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-[var(--pv-green-900)]">Tu pedido</h2>
                  <p className="text-xs text-slate-500">
                    {cart.length === 0
                      ? 'Aún vacío'
                      : `${cart.length} producto${cart.length === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>
              {cart.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-green-200 bg-green-50/50 px-4 py-6 text-center">
                  <CartBasketIcon className="mx-auto h-14 w-14 opacity-80" />
                  <p className="mt-3 text-sm text-[var(--pv-green-800)]">
                    Agrega productos del catálogo para continuar.
                  </p>
                </div>
              ) : (
                <ul ref={cartListRef} className="mt-4 space-y-2 text-sm">
                  {cart.map((item) => (
                    <li
                      key={item.branchProductId}
                      data-cart-id={item.branchProductId}
                      className={`rounded-xl border border-green-100/80 bg-white px-2.5 py-2.5 ${
                        highlightId === item.branchProductId ? 'pv-cart-item--flash' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--pv-green-900)]">{item.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatMoney(item.price)} / {PRODUCT_UNIT_LABELS[item.unit]}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.branchProductId)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Quitar ${item.name}`}
                          title="Quitar"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50">
                          <button
                            type="button"
                            onClick={() => adjustCartQty(item.branchProductId, -1)}
                            className="px-2.5 py-1 text-base font-semibold text-slate-600 hover:text-[var(--pv-green-800)]"
                            aria-label="Disminuir cantidad"
                          >
                            −
                          </button>
                          <span className="min-w-[3.5rem] px-1 text-center text-xs font-medium tabular-nums text-slate-700">
                            {formatProductQuantity(item.quantity, item.unit)}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustCartQty(item.branchProductId, 1)}
                            className="px-2.5 py-1 text-base font-semibold text-slate-600 hover:text-[var(--pv-green-800)]"
                            aria-label="Aumentar cantidad"
                          >
                            +
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditCartItem(item)}
                            className="text-xs font-semibold text-[var(--pv-green-700)] hover:underline"
                          >
                            Editar
                          </button>
                          <span className="font-semibold tabular-nums text-[var(--pv-green-900)]">
                            {formatMoney(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 space-y-3">
                <label className="block text-sm font-medium">Nombre</label>
                <input
                  className="pv-input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Tu nombre"
                />
                <label className="block text-sm font-medium">WhatsApp / teléfono</label>
                <input
                  className="pv-input"
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
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        fulfillmentType === type ? 'pv-pill--active' : 'pv-pill--inactive'
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
                      className="pv-input"
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
                  <p className="pv-callout p-3 text-sm">
                    {branch.pickup_instructions ?? 'Pasa a recoger en el local.'}
                  </p>
                )}
                <label className="block text-sm font-medium">Forma de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentPreference('on_delivery')}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                      paymentPreference === 'on_delivery' ? 'pv-pill--active' : 'pv-pill--inactive'
                    }`}
                  >
                    Al entregar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentPreference('online')}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                      paymentPreference === 'online' ? 'pv-pill--active' : 'pv-pill--inactive'
                    }`}
                  >
                    Pagar en línea
                  </button>
                </div>
                <label className="block text-sm font-medium">Notas</label>
                <textarea
                  className="pv-input"
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
                className="pv-btn-primary mt-4 w-full px-4 py-3"
              >
                {submitting
                  ? 'Enviando...'
                  : paymentPreference === 'online'
                    ? 'Continuar al pago'
                    : 'Confirmar pedido'}
              </button>
            </aside>
          </div>
        </main>

        <footer className="mt-10 border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--pv-green-900)]">{branch.org_name}</p>
              <p>{branch.name}</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <a href="#catalogo" className="hover:text-[var(--pv-green-700)]">
                Catálogo
              </a>
              <button
                type="button"
                onClick={() => setOrdersOpen(true)}
                className="hover:text-[var(--pv-green-700)]"
              >
                Mis pedidos
              </button>
              <a href="#pedido" className="hover:text-[var(--pv-green-700)]">
                Carrito
              </a>
            </div>
          </div>
        </footer>
      </div>

      {pickerProduct && (
        <div className="pv-modal-overlay fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div className="pv-glass-panel w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-[var(--pv-green-900)]">
              {pickerMode === 'edit' ? 'Editar cantidad' : pickerProduct.product.name}
            </h3>
            <p className="mt-1 text-sm text-[var(--pv-green-800)]">
              {pickerMode === 'edit' ? pickerProduct.product.name : null}
              {pickerMode === 'edit' ? ' · ' : null}
              Disponible:{' '}
              {formatProductQuantity(
                Number(pickerProduct.stock),
                pickerProduct.product.unit as ProductUnit,
              )}
            </p>
            <label className="mt-4 block text-sm font-medium">
              Cantidad ({PRODUCT_UNIT_LABELS[pickerProduct.product.unit as ProductUnit]})
              <input
                type="number"
                min={getQuantityStep(pickerProduct.product.unit as ProductUnit)}
                step={getQuantityStep(pickerProduct.product.unit as ProductUnit)}
                max={Number(pickerProduct.stock)}
                className="pv-input mt-1"
                value={pickerQty}
                onChange={(e) => setPickerQty(Number(e.target.value))}
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPickerProduct(null);
                  setPickerMode('add');
                }}
                className="pv-btn-secondary flex-1 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              {pickerMode === 'edit' ? (
                <button
                  type="button"
                  onClick={() => {
                    removeFromCart(pickerProduct.id);
                    setPickerProduct(null);
                    setPickerMode('add');
                  }}
                  className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Quitar
                </button>
              ) : null}
              <button
                type="button"
                onClick={confirmPicker}
                className="pv-btn-primary flex-1 px-4 py-2 text-sm"
              >
                {pickerMode === 'edit' ? 'Guardar' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ordersOpen && (
        <div className="pv-modal-overlay fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <div className="pv-glass-panel w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--pv-green-900)]">Mis pedidos</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Consulta con el mismo teléfono del pedido. Sin crear cuenta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrdersOpen(false)}
                className="text-slate-500 hover:text-slate-800"
              >
                ✕
              </button>
            </div>
            <label className="mt-4 block text-sm font-medium">
              Teléfono / WhatsApp
              <input
                className="pv-input mt-1"
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
                placeholder="55 1234 5678"
              />
            </label>
            <button
              type="button"
              disabled={lookupLoading}
              onClick={searchOrders}
              className="pv-btn-primary mt-3 w-full px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {lookupLoading ? 'Buscando...' : 'Buscar pedidos'}
            </button>
            {lookupError && <p className="mt-3 text-sm text-red-600">{lookupError}</p>}
            <ul className="mt-4 space-y-3">
              {foundOrders.map((order) => (
                <li key={order.trackingToken} className="pv-glass-item rounded-xl p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">#{order.orderNumber}</p>
                      <p className="text-xs text-slate-500">
                        {ORDER_STATUS_LABELS[order.status]} ·{' '}
                        {new Date(order.createdAt).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                    <span className="font-medium">{formatMoney(Number(order.total))}</span>
                  </div>
                  <Link
                    href={`/pedido/${order.trackingToken}`}
                    className="mt-2 inline-block text-[var(--pv-green-700)] hover:underline"
                  >
                    Ver seguimiento →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
