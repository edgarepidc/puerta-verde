'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  PRODUCT_UNIT_LABELS,
  STOCK_STATUS_LABELS,
  formatMoney,
  getDefaultLowStockThreshold,
  getDefaultQuantity,
  getQuantityStep,
  getStockStatus,
  isValidMexicanPhone,
  normalizePhone,
  WALK_IN_NAME,
  WALK_IN_PHONE,
  type PaymentMethod,
  type ProductUnit,
} from '@puertaverde/shared';

import { DecimalInput, decimalFromNumber, parseDecimal } from '@/components/DecimalInput';
import { ScalePanel } from '@/components/ScalePanel';
import {
  ThermalReceipt,
  getAutoPrintTicket,
  setAutoPrintTicket,
  type ThermalReceiptData,
} from '@/components/ThermalReceipt';

import { todayMexicoYmd } from '@/lib/mexico-date';
import { printThermalReceipt } from '@/lib/thermal-printer';
import { TICKET_FOOTER } from '@/lib/thermal-ticket';

export interface CounterProduct {
  id: string;
  price: number;
  stock: number;
  piece_stock?: number | null;
  min_stock?: number | null;
  product: {
    id: string;
    name: string;
    unit: ProductUnit;
    sku?: string | null;
    image_url?: string | null;
    weigh_at_fulfillment?: boolean;
  };
}

interface CartItem {
  branchProductId: string;
  /** Kg (or unit) charged */
  quantity: string;
  /** Editable unit price for managers; defaults to catalog price. */
  unitPrice: string;
  saleMode: 'kg' | 'piece';
  pieces: string;
}

interface ReceiptItem {
  product_name: string;
  unit?: ProductUnit | string;
  quantity: number;
  ordered_quantity?: number | null;
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
  amountReceived?: number | null;
  changeDue?: number | null;
  items: ReceiptItem[];
}) {
  const method =
    PAYMENT_METHOD_LABELS[(input.paymentMethod as PaymentMethod) ?? 'cash'] ??
    input.paymentMethod ??
    'Efectivo';
  const lines = input.items.map((item) => {
    const unit = item.unit ? PRODUCT_UNIT_LABELS[item.unit as ProductUnit] ?? item.unit : '';
    const pieceNote =
      item.ordered_quantity != null && Number(item.ordered_quantity) > 0
        ? `${Number(item.ordered_quantity)} pza · `
        : '';
    return `• ${item.product_name} ${pieceNote}${Number(item.quantity)} ${unit} — ${formatMoney(Number(item.line_total))}`;
  });
  const cashLines =
    input.paymentMethod === 'cash' &&
    input.amountReceived != null &&
    Number.isFinite(Number(input.amountReceived))
      ? [
          `Recibido: ${formatMoney(Number(input.amountReceived))}`,
          `Cambio: ${formatMoney(Number(input.changeDue ?? 0))}`,
        ]
      : [];
  return [
    `Puerta Verde · Ticket #${input.orderNumber}`,
    `Cliente: ${input.customerName}`,
    input.statusLabel ? `Estado: ${input.statusLabel}` : null,
    '',
    ...(lines.length ? lines : ['• (sin partidas)']),
    '',
    `Total: ${formatMoney(input.total)}`,
    `Forma de pago: ${method}`,
    ...cashLines,
    '¡Gracias por tu compra!',
    '',
    TICKET_FOOTER,
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
  branchName,
  canEditPrice = false,
  usbScaleEnabled = false,
  printerChip,
  queueHint,
}: {
  products: CounterProduct[];
  onCreated: (order: CreatedOrder, items: ReceiptItem[]) => void;
  branchName?: string;
  canEditPrice?: boolean;
  /** When true, shows USB/serial scale connect UI (Configuración → Báscula). */
  usbScaleEnabled?: boolean;
  printerChip?: ReactNode;
  /** Shown when collapsed and the board has open orders. */
  queueHint?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [soldOn, setSoldOn] = useState(() => todayMexicoYmd());
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [printTicket, setPrintTicket] = useState(true);
  const [walkIn, setWalkIn] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [orderPulse, setOrderPulse] = useState(false);
  const [flashToken, setFlashToken] = useState(0);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartListRef = useRef<HTMLUListElement | null>(null);
  const cartPanelRef = useRef<HTMLElement | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    order: CreatedOrder;
    items: ReceiptItem[];
    ticketText: string;
    amountReceived?: number | null;
    changeDue?: number | null;
  } | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (product) =>
        product.product.name.toLowerCase().includes(q) ||
        (product.product.sku ?? '').toLowerCase().includes(q),
    );
  }, [products, search]);

  const total = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const product = productById.get(item.branchProductId);
        const qty = parseDecimal(item.quantity);
        if (!product || !(qty > 0)) return sum;
        const unitPrice = parseDecimal(item.unitPrice, Number(product.price));
        if (!(unitPrice >= 0)) return sum;
        return sum + unitPrice * qty;
      }, 0),
    [cart, productById],
  );
  const payableTotal = Math.max(0, Math.round((total - couponDiscount) * 100) / 100);

  const receivedAmount = parseDecimal(amountReceived);
  const changeDue =
    paymentMethod === 'cash' && amountReceived.trim() !== '' && receivedAmount >= payableTotal
      ? Math.round((receivedAmount - payableTotal) * 100) / 100
      : null;
  const cashShort =
    paymentMethod === 'cash' &&
    amountReceived.trim() !== '' &&
    receivedAmount < payableTotal;

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

  useEffect(() => {
    setPrintTicket(getAutoPrintTicket());
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!highlightId || flashToken === 0) return;
    const id = highlightId;
    const handle = window.setTimeout(() => {
      const row = cartListRef.current?.querySelector(
        `[data-cart-id="${id}"]`,
      ) as HTMLElement | null;
      if (row) {
        row.classList.remove('pv-cart-item--flash');
        void row.offsetWidth;
        row.classList.add('pv-cart-item--flash');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      const input = cartListRef.current?.querySelector(
        `[data-cart-focus="${id}"]`,
      ) as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
    }, 30);
    return () => window.clearTimeout(handle);
  }, [highlightId, flashToken]);

  function flashCartItem(addedId: string) {
    setHighlightId(addedId);
    setOrderPulse(true);
    setFlashToken((n) => n + 1);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setHighlightId(null);
      setOrderPulse(false);
      cartListRef.current
        ?.querySelectorAll('.pv-cart-item--flash')
        .forEach((el) => el.classList.remove('pv-cart-item--flash'));
    }, 1600);
  }

  function resetForm() {
    setPhone('');
    setName('');
    setNotes('');
    setSearch('');
    setPaymentMethod('cash');
    setAmountReceived('');
    setSoldOn(todayMexicoYmd());
    setSendWhatsApp(true);
    setWalkIn(false);
    setCart([]);
    setCouponCode('');
    setCouponDiscount(0);
    setCouponApplied(null);
    setLookupHint(null);
    setError(null);
  }

  async function applyCoupon() {
    setCouponBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, subtotal: total }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Cupón no válido');
      setCouponDiscount(Number(payload.discount) || 0);
      setCouponApplied(payload.code ?? couponCode.trim().toUpperCase());
    } catch (err) {
      setCouponDiscount(0);
      setCouponApplied(null);
      setError(err instanceof Error ? err.message : 'Cupón no válido');
    } finally {
      setCouponBusy(false);
    }
  }

  function clearCoupon() {
    setCouponCode('');
    setCouponDiscount(0);
    setCouponApplied(null);
  }

  function addProduct(product: CounterProduct) {
    const unit = product.product.unit;
    const catalogPrice = decimalFromNumber(Number(product.price), false);
    const weigh = Boolean(product.product.weigh_at_fulfillment) && unit === 'kg';
    setCart((current) => {
      const existing = current.find((item) => item.branchProductId === product.id);
      if (existing) {
        if (existing.saleMode === 'piece') {
          const nextPieces = Number(
            (parseDecimal(existing.pieces || '1') + 1).toFixed(0),
          );
          return current.map((item) =>
            item.branchProductId === product.id
              ? { ...item, pieces: String(Math.max(1, nextPieces)) }
              : item,
          );
        }
        const next = Number(
          (parseDecimal(existing.quantity) + getQuantityStep(unit)).toFixed(3),
        );
        return current.map((item) =>
          item.branchProductId === product.id ? { ...item, quantity: String(next) } : item,
        );
      }
      return [
        ...current,
        {
          branchProductId: product.id,
          quantity: weigh ? '' : String(getDefaultQuantity(unit)),
          unitPrice: catalogPrice,
          saleMode: weigh ? 'piece' : 'kg',
          pieces: weigh ? '1' : '',
        },
      ];
    });
    flashCartItem(product.id);
  }

  function setSaleMode(productId: string, saleMode: 'kg' | 'piece') {
    setCart((current) =>
      current.map((item) => {
        if (item.branchProductId !== productId) return item;
        if (saleMode === 'piece') {
          return {
            ...item,
            saleMode,
            pieces: item.pieces && parseDecimal(item.pieces) > 0 ? item.pieces : '1',
            quantity: item.quantity,
          };
        }
        return { ...item, saleMode, pieces: '' };
      }),
    );
  }

  function updatePieces(productId: string, pieces: string) {
    setCart((current) =>
      current.map((item) => (item.branchProductId === productId ? { ...item, pieces } : item)),
    );
  }

  function updateQty(productId: string, quantity: string) {
    // Keep the line while editing (e.g. clearing "1" to type "2"); only "Quitar" removes it.
    setCart((current) =>
      current.map((item) => (item.branchProductId === productId ? { ...item, quantity } : item)),
    );
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((item) => item.branchProductId !== productId));
    if (highlightId === productId) setHighlightId(null);
  }

  function bumpQty(productId: string, delta: number) {
    const product = productById.get(productId);
    const unit = product?.product.unit ?? 'kg';
    const step = getQuantityStep(unit);
    setCart((current) =>
      current.flatMap((item) => {
        if (item.branchProductId !== productId) return [item];
        if (item.saleMode === 'piece') return [item];
        const next = Number((parseDecimal(item.quantity) + delta * step).toFixed(3));
        if (next <= 0) return [];
        return [{ ...item, quantity: String(next) }];
      }),
    );
  }

  function updateUnitPrice(productId: string, unitPrice: string) {
    setCart((current) =>
      current.map((item) => (item.branchProductId === productId ? { ...item, unitPrice } : item)),
    );
  }

  function commitUnitPrice(productId: string) {
    setCart((current) =>
      current.map((item) => {
        if (item.branchProductId !== productId) return item;
        const product = productById.get(productId);
        const price = parseDecimal(item.unitPrice, Number(product?.price ?? 0));
        if (!(price >= 0)) {
          return { ...item, unitPrice: decimalFromNumber(Number(product?.price ?? 0), false) };
        }
        return { ...item, unitPrice: decimalFromNumber(price, false) };
      }),
    );
  }

  function commitQty(productId: string) {
    setCart((current) =>
      current.map((item) => {
        if (item.branchProductId !== productId) return item;
        const qty = parseDecimal(item.quantity);
        if (item.saleMode === 'piece') {
          return { ...item, quantity: qty > 0 ? String(qty) : '' };
        }
        // Empty / invalid while editing → restore unit default (1), don't drop the line.
        return { ...item, quantity: qty > 0 ? String(qty) : String(getDefaultQuantity()) };
      }),
    );
  }

  async function submitSale() {
    setSaving(true);
    setError(null);
    setPrintError(null);
    try {
      if (paymentMethod === 'cash' && payableTotal > 0 && (!amountReceived.trim() || receivedAmount < payableTotal)) {
        throw new Error('Indica con cuánto paga el cliente (debe cubrir el total).');
      }

      for (const item of cart) {
        const product = productById.get(item.branchProductId);
        if (!product) continue;
        const qty = parseDecimal(item.quantity);
        if (item.saleMode === 'piece') {
          const pieces = parseDecimal(item.pieces);
          if (!(pieces > 0)) throw new Error(`Indica las piezas de ${product.product.name}.`);
          if (!(qty > 0)) {
            throw new Error(`Captura el peso en kg de ${product.product.name}.`);
          }
          const pieceStock = Number(product.piece_stock ?? 0);
          if (pieceStock > 0 && pieces > pieceStock) {
            throw new Error(
              `Solo quedan ${pieceStock} pieza(s) de ${product.product.name}.`,
            );
          }
        } else if (!(qty > 0)) {
          throw new Error(`Cantidad inválida para ${product.product.name}.`);
        }
      }

      const cashReceived =
        paymentMethod === 'cash' && amountReceived.trim() !== ''
          ? Math.round(receivedAmount * 100) / 100
          : null;
      const cashChange =
        cashReceived != null ? Math.round((cashReceived - payableTotal) * 100) / 100 : null;

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: walkIn ? name.trim() || WALK_IN_NAME : name,
          customerPhone: walkIn ? WALK_IN_PHONE : phone,
          walkIn,
          fulfillmentType: 'pickup',
          deliveryNotes: notes || null,
          paymentMethod,
          soldOn,
          markDelivered: true,
          sendWhatsApp: false,
          couponCode: couponApplied || couponCode.trim() || null,
          items: cart
            .map((item) => {
              const product = productById.get(item.branchProductId);
              const quantity = parseDecimal(item.quantity);
              const catalog = Number(product?.price ?? 0);
              const unitPrice = parseDecimal(item.unitPrice, catalog);
              const pieces = parseDecimal(item.pieces);
              return {
                branchProductId: item.branchProductId,
                quantity,
                ...(item.saleMode === 'piece' && pieces > 0
                  ? { orderedQuantity: pieces }
                  : {}),
                ...(canEditPrice && Number.isFinite(unitPrice) && unitPrice >= 0
                  ? { unitPrice }
                  : {}),
              };
            })
            .filter((item) => item.quantity > 0),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo registrar');
      const apiItems = (payload.items ?? []) as ReceiptItem[];
      const items: ReceiptItem[] =
        apiItems.length > 0
          ? apiItems
          : cart.flatMap((item) => {
              const product = productById.get(item.branchProductId);
              const qty = parseDecimal(item.quantity);
              if (!product || !(qty > 0)) return [];
              const unitPrice = parseDecimal(item.unitPrice, Number(product.price));
              const pieces = parseDecimal(item.pieces);
              return [
                {
                  product_name: product.product.name,
                  unit: product.product.unit,
                  quantity: qty,
                  ordered_quantity:
                    item.saleMode === 'piece' && pieces > 0 ? pieces : null,
                  unit_price: unitPrice,
                  line_total: unitPrice * qty,
                },
              ];
            });
      if (payload.order) onCreated(payload.order, items);
      const ticketText = buildTicketText({
        orderNumber: Number(payload.order.order_number),
        customerName: payload.order.customer_name,
        paymentMethod: payload.order.payment_method,
        total: Number(payload.order.total),
        amountReceived: cashReceived,
        changeDue: cashChange,
        items,
      });
      const ticket: ThermalReceiptData = {
        storeName: branchName,
        orderNumber: Number(payload.order.order_number),
        soldAt: payload.order.created_at,
        customerName: payload.order.customer_name,
        customerPhone: payload.order.customer_phone,
        paymentMethod: payload.order.payment_method,
        total: Number(payload.order.total),
        amountReceived: cashReceived,
        changeDue: cashChange,
        items,
      };
      setReceipt({
        order: payload.order,
        items,
        ticketText,
        amountReceived: cashReceived,
        changeDue: cashChange,
      });
      if (printTicket) {
        try {
          await printThermalReceipt(ticket);
        } catch (err) {
          setPrintError(
            err instanceof Error
              ? err.message
              : 'No se pudo imprimir. Conecta la impresora y pulsa Imprimir ticket.',
          );
        }
      }
      setCart([]);
      clearCoupon();
      if (sendWhatsApp && !walkIn) {
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
    const preview: ThermalReceiptData = {
      storeName: branchName,
      orderNumber: Number(receipt.order.order_number),
      soldAt: receipt.order.created_at,
      customerName: receipt.order.customer_name,
      customerPhone: receipt.order.customer_phone,
      paymentMethod: receipt.order.payment_method,
      total: Number(receipt.order.total),
      amountReceived: receipt.amountReceived,
      changeDue: receipt.changeDue,
      items: receipt.items,
    };
    return (
      <section className="pv-glass-card mb-6 space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Ticket #{receipt.order.order_number}</h2>
            <p className="text-sm text-slate-500">Listo para la impresora de 58 mm</p>
          </div>
          <button type="button" className="text-sm text-slate-500" onClick={() => setReceipt(null)}>
            Cerrar
          </button>
        </div>
        <div className="flex justify-center bg-slate-50 py-4">
          <ThermalReceipt data={preview} className="pv-thermal-preview" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white"
            onClick={async () => {
              setPrintError(null);
              try {
                await printThermalReceipt(preview, { connectIfNeeded: true });
              } catch (err) {
                setPrintError(
                  err instanceof Error ? err.message : 'No se pudo imprimir el ticket.',
                );
              }
            }}
          >
            Imprimir ticket
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
        {printError ? <p className="text-xs text-rose-700">{printError}</p> : null}
      </section>
    );
  }

  if (!open) {
    return (
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="shrink-0">
          <h1 className="text-xl font-semibold text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-500">
            {queueHint ? queueHint : 'Web y mostrador en un solo tablero'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {printerChip}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 whitespace-nowrap rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            + Nueva venta
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="pv-glass-card mb-3 space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Venta mostrador</h2>
          <p className="text-sm text-slate-500">
            {queueHint
              ? `${queueHint}. Cierra este panel para ver la cola completa.`
              : 'Catálogo compacto, como en la tienda.'}
          </p>
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
              const status = getStockStatus(
                Number(product.stock),
                true,
                Number(
                  product.min_stock ??
                    getDefaultLowStockThreshold({
                      unit: product.product.unit,
                      name: product.product.name,
                    }),
                ),
              );
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
                    {product.product.weigh_at_fulfillment ? ' · pieza o kg' : ''}
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

        <aside
          ref={cartPanelRef}
          className={`space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 ${
            orderPulse ? 'pv-order-panel--pulse' : ''
          }`}
        >
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} />
              Cliente de paso (sin celular)
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Celular {walkIn ? '(opcional)' : '*'}</span>
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
              <span className="font-medium text-slate-700">Nombre {walkIn ? '(opcional)' : '*'}</span>
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
              <>
              {usbScaleEnabled && cart.some((item) => item.saleMode === 'piece') ? (
                <div className="mt-2">
                  <ScalePanel
                    onWeight={(kg) => {
                      const target =
                        cart.find(
                          (item) =>
                            item.saleMode === 'piece' && !(parseDecimal(item.quantity) > 0),
                        ) ?? cart.find((item) => item.saleMode === 'piece');
                      if (target) {
                        updateQty(target.branchProductId, String(Number(kg.toFixed(3))));
                      }
                    }}
                  />
                </div>
              ) : null}
              <ul ref={cartListRef} className="mt-2 space-y-2">
                {cart.map((item) => {
                  const product = productById.get(item.branchProductId);
                  if (!product) return null;
                  const unit = product.product.unit;
                  const weigh =
                    Boolean(product.product.weigh_at_fulfillment) && unit === 'kg';
                  const pieceStock = Number(product.piece_stock ?? 0);
                  return (
                    <li
                      key={item.branchProductId}
                      data-cart-id={item.branchProductId}
                      className={`rounded-xl bg-white p-2 text-sm ${
                        highlightId === item.branchProductId ? 'pv-cart-item--flash' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-medium text-slate-800">{product.product.name}</span>
                          {weigh && pieceStock > 0 ? (
                            <p className="text-[11px] text-slate-500">
                              {pieceStock} pza · {Number(product.stock)} kg
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="text-xs text-slate-400"
                          onClick={() => removeFromCart(item.branchProductId)}
                        >
                          Quitar
                        </button>
                      </div>
                      {weigh ? (
                        <div className="mt-2 flex gap-1">
                          <button
                            type="button"
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              item.saleMode === 'piece'
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-200 text-slate-600'
                            }`}
                            onClick={() => setSaleMode(item.branchProductId, 'piece')}
                          >
                            Por pieza
                          </button>
                          <button
                            type="button"
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              item.saleMode === 'kg'
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-200 text-slate-600'
                            }`}
                            onClick={() => setSaleMode(item.branchProductId, 'kg')}
                          >
                            Por kg
                          </button>
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        {item.saleMode === 'piece' ? (
                          <>
                            <label className="flex items-center gap-1 text-xs text-slate-600">
                              <span>Pza</span>
                              <DecimalInput
                                data-cart-focus={item.branchProductId}
                                className="pv-input w-14 py-1 text-center text-xs"
                                value={item.pieces}
                                onChange={(value) => updatePieces(item.branchProductId, value)}
                              />
                            </label>
                            <label className="flex items-center gap-1 text-xs text-slate-600">
                              <span>Kg</span>
                              <DecimalInput
                                className="pv-input w-16 py-1 text-center text-xs"
                                value={item.quantity}
                                onChange={(value) => updateQty(item.branchProductId, value)}
                                onBlur={() => commitQty(item.branchProductId)}
                                placeholder="0"
                              />
                            </label>
                          </>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="h-7 w-7 rounded-full border border-slate-200"
                              onClick={() => bumpQty(item.branchProductId, -1)}
                            >
                              −
                            </button>
                            <DecimalInput
                              data-cart-focus={item.branchProductId}
                              className="pv-input w-16 py-1 text-center text-xs"
                              value={item.quantity}
                              onChange={(value) => updateQty(item.branchProductId, value)}
                              onBlur={() => commitQty(item.branchProductId)}
                            />
                            <button
                              type="button"
                              className="h-7 w-7 rounded-full border border-slate-200"
                              onClick={() => bumpQty(item.branchProductId, 1)}
                            >
                              +
                            </button>
                          </div>
                        )}
                        {canEditPrice ? (
                          <label className="flex items-center gap-1 text-xs text-slate-600">
                            <span>$/</span>
                            <DecimalInput
                              className="pv-input w-16 py-1 text-center text-xs"
                              value={item.unitPrice}
                              onChange={(value) => updateUnitPrice(item.branchProductId, value)}
                              onBlur={() => commitUnitPrice(item.branchProductId)}
                              aria-label={`Precio por ${PRODUCT_UNIT_LABELS[unit]}`}
                            />
                          </label>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {formatMoney(Number(product.price))} / {PRODUCT_UNIT_LABELS[unit]}
                          </span>
                        )}
                        <span className="ml-auto text-xs font-medium text-slate-700">
                          {formatMoney(
                            parseDecimal(item.unitPrice, Number(product.price)) *
                              parseDecimal(item.quantity),
                          )}
                        </span>
                      </div>
                      {item.saleMode === 'piece' && !(parseDecimal(item.quantity) > 0) ? (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Captura el peso en kg.
                        </p>
                      ) : null}
                      {canEditPrice &&
                      Math.abs(
                        parseDecimal(item.unitPrice, Number(product.price)) - Number(product.price),
                      ) > 0.0005 ? (
                        <p className="mt-1 text-[10px] text-amber-700">
                          Lista: {formatMoney(Number(product.price))} / {PRODUCT_UNIT_LABELS[unit]}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              </>
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
            <span className="font-medium text-slate-700">Fecha de la venta</span>
            <input
              type="date"
              className="pv-input mt-1"
              value={soldOn}
              max={todayMexicoYmd()}
              onChange={(e) => setSoldOn(e.target.value || todayMexicoYmd())}
            />
            {soldOn !== todayMexicoYmd() ? (
              <span className="mt-1 block text-xs text-amber-700">
                Se registrará con esta fecha (caja y utilidades).
              </span>
            ) : (
              <span className="mt-1 block text-xs text-slate-500">
                Por defecto hoy; cámbiala si registras un día anterior.
              </span>
            )}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Cobro</span>
            <select
              className="pv-input mt-1"
              value={paymentMethod}
              onChange={(e) => {
                const next = e.target.value as PaymentMethod;
                setPaymentMethod(next);
                if (next !== 'cash') setAmountReceived('');
              }}
            >
              {POS_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </label>
          {paymentMethod === 'cash' ? (
            <div className="space-y-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">¿Con cuánto paga?</span>
                <DecimalInput
                  className="pv-input mt-1"
                  value={amountReceived}
                  onChange={setAmountReceived}
                  placeholder={payableTotal > 0 ? String(payableTotal) : '0'}
                />
              </label>
              {cashShort ? (
                <p className="text-xs text-rose-700">
                  Faltan {formatMoney(Math.round((payableTotal - receivedAmount) * 100) / 100)}.
                </p>
              ) : null}
              {changeDue != null ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Cambio</span>
                  <span className="font-semibold text-emerald-800">{formatMoney(changeDue)}</span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Escribe el billete o monto recibido.</p>
              )}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={printTicket}
              onChange={(e) => {
                setPrintTicket(e.target.checked);
                setAutoPrintTicket(e.target.checked);
              }}
            />
            Imprimir ticket al cobrar (58 mm)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sendWhatsApp && !walkIn}
              disabled={walkIn}
              onChange={(e) => setSendWhatsApp(e.target.checked)}
            />
            Abrir WhatsApp con el ticket
          </label>
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <label className="block text-sm font-medium text-slate-700">Cupón</label>
            <div className="flex gap-2">
              <input
                className="pv-input flex-1 uppercase"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value);
                  if (couponApplied) {
                    setCouponApplied(null);
                    setCouponDiscount(0);
                  }
                }}
                placeholder="CÓDIGO"
              />
              {couponApplied ? (
                <button
                  type="button"
                  className="rounded-full border border-slate-300 px-3 py-2 text-xs"
                  onClick={clearCoupon}
                >
                  Quitar
                </button>
              ) : (
                <button
                  type="button"
                  disabled={couponBusy || !couponCode.trim() || total <= 0}
                  className="rounded-full bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={applyCoupon}
                >
                  {couponBusy ? '…' : 'Aplicar'}
                </button>
              )}
            </div>
            {couponApplied ? (
              <p className="text-xs text-emerald-700">
                {couponApplied} · −{formatMoney(couponDiscount)}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <div>
              {couponDiscount > 0 ? (
                <p className="text-xs text-slate-500">
                  Subtotal {formatMoney(total)} · Desc. −{formatMoney(couponDiscount)}
                </p>
              ) : null}
              <span className="text-sm font-semibold text-slate-900">{formatMoney(payableTotal)}</span>
            </div>
            <button
              type="button"
              disabled={
                saving ||
                cart.length === 0 ||
                (paymentMethod === 'cash' && (cashShort || !amountReceived.trim()))
              }
              onClick={submitSale}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving
                ? 'Registrando…'
                : changeDue != null
                  ? `Cobrar · cambio ${formatMoney(changeDue)}`
                  : 'Cobrar y entregar'}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
