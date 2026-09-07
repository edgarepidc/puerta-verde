'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  PAYMENT_METHOD_LABELS,
  POS_PAYMENT_METHODS,
  PRODUCT_UNIT_LABELS,
  STOCK_STATUS_LABELS,
  formatDecimal,
  formatMoney,
  getDefaultLowStockThreshold,
  getDefaultQuantity,
  getQuantityStep,
  getStockStatus,
  isPaymentMethod,
  isSplitPaymentMethod,
  isValidMexicanPhone,
  normalizePhone,
  parsePaymentSplits,
  primaryPaymentMethod,
  resolvePosCustomer,
  SPLIT_PAYMENT_METHODS,
  validatePaymentSplits,
  type PosPaymentMethod,
  type ProductUnit,
  type SplitPaymentMethod,
} from '@puertaverde/shared';

import { ActionChip, ChevronDownIcon } from '@/components/ActionChip';
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

interface LineEditorDraft {
  productId: string;
  saleMode: 'kg' | 'piece';
  quantity: string;
  pieces: string;
  unitPrice: string;
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
  payment_splits?: unknown;
  created_at: string;
  branch_id?: string;
}

export function buildTicketText(input: {
  orderNumber: number;
  customerName: string;
  paymentMethod?: string | null;
  paymentSplits?: unknown;
  statusLabel?: string;
  total: number;
  amountReceived?: number | null;
  changeDue?: number | null;
  items: ReceiptItem[];
}) {
  const splits = parsePaymentSplits(input.paymentSplits);
  const method =
    splits.length >= 2
      ? splits
          .map((split) => `${PAYMENT_METHOD_LABELS[split.method]} ${formatMoney(split.amount)}`)
          .join(' + ')
      : isPaymentMethod(input.paymentMethod)
        ? PAYMENT_METHOD_LABELS[input.paymentMethod]
        : input.paymentMethod ?? 'Efectivo';
  const lines = input.items.map((item) => {
    const unit = item.unit ? PRODUCT_UNIT_LABELS[item.unit as ProductUnit] ?? item.unit : '';
    const pieceNote =
      item.ordered_quantity != null && Number(item.ordered_quantity) > 0
        ? `${Number(item.ordered_quantity)} pza · `
        : '';
    return `• ${item.product_name} ${pieceNote}${formatDecimal(Number(item.quantity))} ${unit} — ${formatMoney(Number(item.line_total))}`;
  });
  const cashLines =
    (input.paymentMethod === 'cash' || splits.some((split) => split.method === 'cash')) &&
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
  boardFilters,
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
  /** Filter chips for Hoy / Por atender / canal — sit in the collapsed toolbar. */
  boardFilters?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('cash');
  const [paymentSplits, setPaymentSplits] = useState<
    Array<{ method: SplitPaymentMethod; amount: string }>
  >([]);
  const [amountReceived, setAmountReceived] = useState('');
  const [exactAmount, setExactAmount] = useState(false);
  const [soldOn, setSoldOn] = useState(() => todayMexicoYmd());
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [printTicket, setPrintTicket] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [orderPulse, setOrderPulse] = useState(false);
  const [flashToken, setFlashToken] = useState(0);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartListRef = useRef<HTMLUListElement | null>(null);
  const cartPanelRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const lineModalRef = useRef<HTMLElement | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lineDraft, setLineDraft] = useState<LineEditorDraft | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
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
  const splitMode = paymentSplits.length >= 2;
  const parsedSplits = paymentSplits
    .map((row) => ({ method: row.method, amount: parseDecimal(row.amount) }))
    .filter((row) => row.amount > 0);
  const cashDue = splitMode
    ? parsedSplits.find((row) => row.method === 'cash')?.amount ?? 0
    : paymentMethod === 'cash'
      ? payableTotal
      : 0;
  const splitAllocated = Math.round(
    paymentSplits.reduce((sum, row) => sum + parseDecimal(row.amount), 0) * 100,
  ) / 100;
  const splitRemaining = Math.round((payableTotal - splitAllocated) * 100) / 100;

  const receivedAmount = parseDecimal(amountReceived);
  const changeDue =
    cashDue > 0 && amountReceived.trim() !== '' && receivedAmount >= cashDue
      ? Math.round((receivedAmount - cashDue) * 100) / 100
      : null;
  const cashShort =
    cashDue > 0 && amountReceived.trim() !== '' && receivedAmount < cashDue;
  const hasCustomerPhone = isValidMexicanPhone(phone);

  useEffect(() => {
    if (!exactAmount || cashDue <= 0) return;
    setAmountReceived(decimalFromNumber(cashDue, false) || '0');
  }, [exactAmount, cashDue]);

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
          const fullName = String(payload.customer.full_name ?? '').trim();
          if (fullName) setName(fullName);
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
    if (!lineDraft) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLineEditor();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [Boolean(lineDraft)]);

  useEffect(() => {
    if (!lineDraft) return;
    const handle = window.setTimeout(() => {
      const input = lineModalRef.current?.querySelector(
        '[data-line-qty]',
      ) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 40);
    return () => window.clearTimeout(handle);
  }, [lineDraft?.productId]);

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

  function nextSplitMethod(used: SplitPaymentMethod[]): SplitPaymentMethod | null {
    return SPLIT_PAYMENT_METHODS.find((method) => !used.includes(method)) ?? null;
  }

  function addPaymentSplit() {
    if (paymentMethod === 'on_account') {
      setPaymentMethod('cash');
    }
    const first: SplitPaymentMethod = isSplitPaymentMethod(paymentMethod)
      ? paymentMethod
      : 'cash';
    if (paymentSplits.length === 0) {
      const second = nextSplitMethod([first]);
      if (!second) return;
      setPaymentSplits([
        { method: first, amount: '' },
        { method: second, amount: '' },
      ]);
      return;
    }
    const used = paymentSplits.map((row) => row.method);
    const extra = nextSplitMethod(used);
    if (!extra) return;
    setPaymentSplits((current) => [...current, { method: extra, amount: '' }]);
  }

  function updateSplitMethod(index: number, method: SplitPaymentMethod) {
    setPaymentSplits((current) =>
      current.map((row, i) => (i === index ? { ...row, method } : row)),
    );
    if (index === 0) setPaymentMethod(method);
  }

  function updateSplitAmount(index: number, amount: string) {
    setPaymentSplits((current) => {
      const next = current.map((row, i) => (i === index ? { ...row, amount } : row));
      if (next.length === 2) {
        const other = index === 0 ? 1 : 0;
        const remainder = Math.round((payableTotal - parseDecimal(amount)) * 100) / 100;
        if (remainder >= 0) {
          next[other] = { ...next[other], amount: remainder > 0 ? decimalFromNumber(remainder, false) : '' };
        }
      }
      return next;
    });
  }

  function removeSplit(index: number) {
    setPaymentSplits((current) => {
      const next = current.filter((_, i) => i !== index);
      if (next.length < 2) {
        if (next[0]) setPaymentMethod(next[0].method);
        return [];
      }
      return next;
    });
  }

  function resetForm() {
    setPhone('');
    setName('');
    setNotes('');
    setSearch('');
    setPaymentMethod('cash');
    setPaymentSplits([]);
    setAmountReceived('');
    setExactAmount(false);
    setSoldOn(todayMexicoYmd());
    setSendWhatsApp(true);
    setCart([]);
    setLineDraft(null);
    setLineError(null);
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

  function openLineEditor(product: CounterProduct) {
    const unit = product.product.unit;
    const weigh = Boolean(product.product.weigh_at_fulfillment) && unit === 'kg';
    const existing = cart.find((item) => item.branchProductId === product.id);
    setLineError(null);
    if (existing) {
      setLineDraft({
        productId: product.id,
        saleMode: existing.saleMode,
        quantity: existing.quantity,
        pieces: existing.pieces,
        unitPrice: existing.unitPrice,
      });
      return;
    }
    setLineDraft({
      productId: product.id,
      saleMode: weigh ? 'piece' : 'kg',
      quantity: weigh ? '' : String(getDefaultQuantity(unit)),
      pieces: weigh ? '1' : '',
      unitPrice: decimalFromNumber(Number(product.price), false),
    });
  }

  function closeLineEditor() {
    setLineDraft(null);
    setLineError(null);
  }

  function confirmLineEditor() {
    if (!lineDraft) return;
    const product = productById.get(lineDraft.productId);
    if (!product) {
      closeLineEditor();
      return;
    }
    const qty = parseDecimal(lineDraft.quantity);
    const price = parseDecimal(lineDraft.unitPrice, Number(product.price));
    if (!(price >= 0)) {
      setLineError('Precio no válido.');
      return;
    }
    if (lineDraft.saleMode === 'piece') {
      const pieces = parseDecimal(lineDraft.pieces);
      if (!(pieces > 0)) {
        setLineError(`Indica las piezas de ${product.product.name}.`);
        return;
      }
      if (!(qty > 0)) {
        setLineError(`Captura el peso en kg de ${product.product.name}.`);
        return;
      }
      const pieceStock = Number(product.piece_stock ?? 0);
      if (pieceStock > 0 && pieces > pieceStock) {
        setLineError(`Solo quedan ${pieceStock} pieza(s) de ${product.product.name}.`);
        return;
      }
    } else if (!(qty > 0)) {
      setLineError(`Cantidad inválida para ${product.product.name}.`);
      return;
    }

    const nextItem: CartItem = {
      branchProductId: product.id,
      quantity: String(qty),
      unitPrice: decimalFromNumber(price, false),
      saleMode: lineDraft.saleMode,
      pieces: lineDraft.saleMode === 'piece' ? lineDraft.pieces : '',
    };
    setCart((current) => {
      const exists = current.some((item) => item.branchProductId === product.id);
      if (exists) {
        return current.map((item) => (item.branchProductId === product.id ? nextItem : item));
      }
      return [...current, nextItem];
    });
    flashCartItem(product.id);
    // Close on the next tick so the confirm click cannot hit a catalog "Agregar" underneath.
    window.setTimeout(() => {
      closeLineEditor();
      setSearch('');
      searchRef.current?.focus();
    }, 50);
  }

  function addProduct(product: CounterProduct) {
    openLineEditor(product);
  }

  function bumpDraftQty(delta: number) {
    setLineDraft((current) => {
      if (!current || current.saleMode === 'piece') return current;
      const product = productById.get(current.productId);
      const step = getQuantityStep(product?.product.unit ?? 'kg');
      const next = Number((parseDecimal(current.quantity) + delta * step).toFixed(3));
      return { ...current, quantity: next > 0 ? String(next) : '' };
    });
  }

  function commitDraftQty() {
    setLineDraft((current) => {
      if (!current) return current;
      const qty = parseDecimal(current.quantity);
      if (current.saleMode === 'piece') {
        return { ...current, quantity: qty > 0 ? String(qty) : '' };
      }
      return { ...current, quantity: qty > 0 ? String(qty) : String(getDefaultQuantity()) };
    });
  }

  function commitDraftPrice() {
    setLineDraft((current) => {
      if (!current) return current;
      const product = productById.get(current.productId);
      const price = parseDecimal(current.unitPrice, Number(product?.price ?? 0));
      if (!(price >= 0)) {
        return { ...current, unitPrice: decimalFromNumber(Number(product?.price ?? 0), false) };
      }
      return { ...current, unitPrice: decimalFromNumber(price, false) };
    });
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

      const customer = resolvePosCustomer(name, phone);
      if ('error' in customer) throw new Error(customer.error);

      const cashReceived =
        cashDue > 0 && amountReceived.trim() !== ''
          ? Math.round(receivedAmount * 100) / 100
          : null;
      const cashChange =
        cashReceived != null ? Math.round((cashReceived - cashDue) * 100) / 100 : null;

      let splitsPayload: Array<{ method: SplitPaymentMethod; amount: number }> | undefined;
      let methodToSend: PosPaymentMethod = paymentMethod;
      if (splitMode) {
        const splitError = validatePaymentSplits(
          paymentSplits.map((row) => ({ method: row.method, amount: parseDecimal(row.amount) })),
          payableTotal,
        );
        if (splitError) throw new Error(splitError);
        splitsPayload = paymentSplits.map((row) => ({
          method: row.method,
          amount: parseDecimal(row.amount),
        }));
        methodToSend = (primaryPaymentMethod(splitsPayload) ?? 'cash') as PosPaymentMethod;
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customer.customerName,
          customerPhone: customer.customerPhone,
          walkIn: customer.walkIn,
          fulfillmentType: 'pickup',
          deliveryNotes: notes || null,
          paymentMethod: methodToSend,
          paymentSplits: splitsPayload,
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
        paymentSplits: payload.order.payment_splits ?? splitsPayload,
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
        paymentSplits: payload.order.payment_splits ?? splitsPayload,
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
          await printThermalReceipt(ticket, { connectIfNeeded: true });
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
      if (sendWhatsApp && !customer.walkIn) {
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
      paymentSplits: receipt.order.payment_splits,
      total: Number(receipt.order.total),
      amountReceived: receipt.amountReceived,
      changeDue: receipt.changeDue,
      items: receipt.items,
    };
    return (
      <>
      <section className="pv-glass-card mb-6 space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Ticket #{receipt.order.order_number}</h2>
            <p className="text-sm text-slate-500">Listo para la impresora de 58 mm</p>
          </div>
          <ActionChip
            icon={<span className="inline-flex rotate-180"><ChevronDownIcon /></span>}
            onClick={() => setReceipt(null)}
          >
            Cerrar
          </ActionChip>
        </div>
        <div className="flex justify-center bg-slate-50 py-4">
          <ThermalReceipt data={preview} className="pv-thermal-preview" />
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionChip
            emoji="🖨️"
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
          </ActionChip>
          <a
            className="rounded-full border border-slate-300 px-4 py-2 text-sm"
            href={whatsappTicketHref(receipt.order.customer_phone, receipt.ticketText)}
            target="_blank"
            rel="noreferrer"
          >
            Enviar por WhatsApp
          </a>
          <ActionChip tone="emerald" emoji="🛒" onClick={() => {
              setReceipt(null);
              setOpen(true);
            }}>
            Nueva venta
          </ActionChip>
        </div>
        {printError ? <p className="text-xs text-rose-700">{printError}</p> : null}
      </section>
      {boardFilters ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">{boardFilters}</div>
      ) : null}
    </>
    );
  }

  if (!open) {
    return (
      <div className="mb-3 flex items-center gap-x-2 overflow-x-auto">
        <div className="shrink-0">
          <h1 className="text-xl font-semibold leading-tight text-slate-900">Pedidos</h1>
          <p className="text-[11px] leading-snug text-slate-500 sm:text-xs">ventas del día</p>
        </div>
        {boardFilters ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [&_button]:whitespace-nowrap [&_span]:whitespace-nowrap">{boardFilters}</div>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {printerChip}
          <ActionChip tone="emerald" emoji="🛒" className="shrink-0" onClick={() => setOpen(true)}>
            Nueva venta
          </ActionChip>
        </div>
      </div>
    );
  }

  return (
    <>
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
        <ActionChip
          icon={<span className="inline-flex rotate-180"><ChevronDownIcon /></span>}
          onClick={() => {
            closeLineEditor();
            setOpen(false);
          }}
        >
          Cerrar
        </ActionChip>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-3">
          <input
            ref={searchRef}
            type="search"
            className="pv-input"
            placeholder="Buscar fruta, verdura..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="grid max-h-[36rem] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Celular</span>
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
              <span className="font-medium text-slate-700">Nombre</span>
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
              {usbScaleEnabled && !lineDraft && cart.some((item) => item.saleMode === 'piece') ? (
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
                          <button
                            type="button"
                            className="text-left font-medium text-slate-800 hover:underline"
                            onClick={() => openLineEditor(product)}
                          >
                            {product.product.name}
                          </button>
                          {weigh && pieceStock > 0 ? (
                            <p className="text-[11px] text-slate-500">
                              {pieceStock} pza · {formatDecimal(Number(product.stock))} kg
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Cobro</span>
              <select
                className="pv-input mt-1"
                value={splitMode ? paymentSplits[0]?.method : paymentMethod}
                onChange={(e) => {
                  const next = e.target.value as PosPaymentMethod;
                  if (splitMode && isSplitPaymentMethod(next)) {
                    updateSplitMethod(0, next);
                    return;
                  }
                  setPaymentMethod(next);
                  if (next === 'on_account') {
                    setPaymentSplits([]);
                    setAmountReceived('');
                    setExactAmount(false);
                  } else if (next !== 'cash') {
                    setAmountReceived('');
                    setExactAmount(false);
                  }
                }}
              >
                {(splitMode
                  ? SPLIT_PAYMENT_METHODS.filter(
                      (method) =>
                        method === paymentSplits[0]?.method ||
                        !paymentSplits.slice(1).some((row) => row.method === method),
                    )
                  : POS_PAYMENT_METHODS
                ).map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
              {paymentMethod === 'on_account' && !splitMode ? (
                <span className="mt-1 block text-xs text-amber-700">
                  Queda como por pagar. No entra a caja hasta que se cobre.
                </span>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Fecha</span>
              <input
                type="date"
                className="pv-input mt-1"
                value={soldOn}
                max={todayMexicoYmd()}
                onChange={(e) => setSoldOn(e.target.value || todayMexicoYmd())}
              />
              {soldOn !== todayMexicoYmd() ? (
                <span className="mt-1 block text-xs text-amber-700">Se registra en este día.</span>
              ) : null}
            </label>
          </div>
          {splitMode ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-600">Monto por método</p>
              {paymentSplits.map((row, index) => (
                <div
                  key={`${row.method}-${index}`}
                  className="grid grid-cols-[7rem_minmax(0,1fr)_2.75rem] items-center gap-2"
                >
                  {index === 0 ? (
                    <span className="truncate text-sm text-slate-700">
                      {PAYMENT_METHOD_LABELS[row.method]}
                    </span>
                  ) : (
                    <select
                      className="pv-input w-full min-w-0 py-1 text-sm"
                      value={row.method}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (isSplitPaymentMethod(next)) updateSplitMethod(index, next);
                      }}
                    >
                      {SPLIT_PAYMENT_METHODS.filter(
                        (method) =>
                          method === row.method ||
                          !paymentSplits.some((other) => other.method === method),
                      ).map((method) => (
                        <option key={method} value={method}>
                          {PAYMENT_METHOD_LABELS[method]}
                        </option>
                      ))}
                    </select>
                  )}
                  <DecimalInput
                    className="pv-input w-full min-w-0 py-1"
                    value={row.amount}
                    onChange={(value) => updateSplitAmount(index, value)}
                    groupThousands
                  />
                  {index > 0 ? (
                    <button
                      type="button"
                      className="justify-self-end text-xs text-slate-400 hover:text-rose-600"
                      onClick={() => removeSplit(index)}
                    >
                      Quitar
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
              {splitRemaining !== 0 ? (
                <p className={`text-xs ${splitRemaining > 0 ? 'text-amber-700' : 'text-rose-700'}`}>
                  {splitRemaining > 0
                    ? `Faltan ${formatMoney(splitRemaining)}`
                    : `Sobra ${formatMoney(Math.abs(splitRemaining))}`}
                </p>
              ) : (
                <p className="text-xs text-emerald-700">Los montos cubren el total.</p>
              )}
            </div>
          ) : null}
          {cashDue > 0 ? (
            <div className="space-y-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={exactAmount}
                  onChange={(e) => setExactAmount(e.target.checked)}
                />
                Monto exacto
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">¿Con cuánto paga?</span>
                <DecimalInput
                  className="pv-input mt-1"
                  value={amountReceived}
                  onChange={(value) => {
                    setExactAmount(false);
                    setAmountReceived(value);
                  }}
                  placeholder={cashDue > 0 ? String(cashDue) : '0'}
                  disabled={exactAmount}
                  groupThousands
                />
              </label>
              {cashShort ? (
                <p className="text-xs text-rose-700">
                  Faltan {formatMoney(Math.round((cashDue - receivedAmount) * 100) / 100)} en efectivo.
                </p>
              ) : null}
              {exactAmount || changeDue === 0 ? (
                <p className="text-xs text-slate-500">El cliente paga el efectivo, sin cambio.</p>
              ) : changeDue != null ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Cambio</span>
                  <span className="font-semibold text-emerald-800">{formatMoney(changeDue)}</span>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Escribe el billete o monto recibido.</p>
              )}
            </div>
          ) : null}
          {paymentMethod !== 'on_account' || splitMode ? (
            <button
              type="button"
              className="text-left text-sm font-medium text-emerald-800 hover:underline disabled:text-slate-400 disabled:no-underline"
              disabled={
                paymentSplits.length >= SPLIT_PAYMENT_METHODS.length ||
                (splitMode && nextSplitMethod(paymentSplits.map((row) => row.method)) == null)
              }
              onClick={addPaymentSplit}
            >
              Agregar otro método de pago
            </button>
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
              checked={sendWhatsApp && hasCustomerPhone}
              disabled={!hasCustomerPhone}
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
            <ActionChip
              tone="emerald"
              emoji="💵"
              disabled={
                saving ||
                cart.length === 0 ||
                (cashDue > 0 && (cashShort || !amountReceived.trim())) ||
                (splitMode && splitRemaining !== 0)
              }
              onClick={submitSale}
            >
              {saving
                ? 'Registrando…'
                : paymentMethod === 'on_account'
                  ? 'Registrar por pagar'
                  : exactAmount || changeDue === 0
                    ? 'Cobrar y entregar'
                    : changeDue != null
                      ? `Cobrar · cambio ${formatMoney(changeDue)}`
                      : 'Cobrar y entregar'}
            </ActionChip>
          </div>
        </aside>
      </div>
    </section>
      {lineDraft ? (() => {
        const product = productById.get(lineDraft.productId);
        if (!product) return null;
        const unit = product.product.unit;
        const weigh = Boolean(product.product.weigh_at_fulfillment) && unit === 'kg';
        const pieceStock = Number(product.piece_stock ?? 0);
        const updating = cart.some((item) => item.branchProductId === product.id);
        const lineTotal =
          parseDecimal(lineDraft.unitPrice, Number(product.price)) *
          parseDecimal(lineDraft.quantity);
        return (
          <div
            className="pv-modal-overlay fixed inset-0 z-[80] flex items-center justify-center p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeLineEditor();
            }}
          >
            <section
              ref={lineModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="counter-line-modal-title"
              className="pv-glass-card w-full max-w-sm p-5 shadow-xl"
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
                  event.preventDefault();
                  confirmLineEditor();
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="counter-line-modal-title" className="text-lg font-semibold text-slate-900">
                    {product.product.name}
                  </h2>
                  <p className="text-sm text-slate-500">
                    Lista {formatMoney(Number(product.price))} / {PRODUCT_UNIT_LABELS[unit]}
                    {weigh && pieceStock > 0
                      ? ` · ${pieceStock} pza · ${formatDecimal(Number(product.stock))} kg`
                      : ''}
                  </p>
                </div>
                <ActionChip
                  icon={
                    <span className="inline-flex rotate-180">
                      <ChevronDownIcon />
                    </span>
                  }
                  onClick={closeLineEditor}
                >
                  Cerrar
                </ActionChip>
              </div>

              {weigh ? (
                <div className="mt-4 flex gap-1">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      lineDraft.saleMode === 'piece'
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 text-slate-600'
                    }`}
                    onClick={() =>
                      setLineDraft((current) =>
                        current
                          ? {
                              ...current,
                              saleMode: 'piece',
                              pieces:
                                current.pieces && parseDecimal(current.pieces) > 0
                                  ? current.pieces
                                  : '1',
                            }
                          : current,
                      )
                    }
                  >
                    Por pieza
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      lineDraft.saleMode === 'kg'
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 text-slate-600'
                    }`}
                    onClick={() =>
                      setLineDraft((current) =>
                        current ? { ...current, saleMode: 'kg', pieces: '' } : current,
                      )
                    }
                  >
                    Por kg
                  </button>
                </div>
              ) : null}

              {usbScaleEnabled && lineDraft.saleMode === 'piece' ? (
                <div className="mt-3">
                  <ScalePanel
                    onWeight={(kg) => {
                      setLineDraft((current) =>
                        current
                          ? { ...current, quantity: String(Number(kg.toFixed(3))) }
                          : current,
                      );
                    }}
                  />
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {lineDraft.saleMode === 'piece' ? (
                  <>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="font-medium">Pza</span>
                      <DecimalInput
                        className="pv-input w-16 py-2 text-center"
                        value={lineDraft.pieces}
                        onChange={(value) =>
                          setLineDraft((current) =>
                            current ? { ...current, pieces: value } : current,
                          )
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="font-medium">Kg</span>
                      <DecimalInput
                        data-line-qty
                        className="pv-input w-24 py-2 text-center"
                        value={lineDraft.quantity}
                        onChange={(value) =>
                          setLineDraft((current) =>
                            current ? { ...current, quantity: value } : current,
                          )
                        }
                        onBlur={commitDraftQty}
                        placeholder="0"
                      />
                    </label>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-10 w-10 rounded-full border border-slate-200 text-lg"
                      onClick={() => bumpDraftQty(-1)}
                    >
                      −
                    </button>
                    <DecimalInput
                      data-line-qty
                      className="pv-input w-24 py-2 text-center"
                      value={lineDraft.quantity}
                      onChange={(value) =>
                        setLineDraft((current) =>
                          current ? { ...current, quantity: value } : current,
                        )
                      }
                      onBlur={commitDraftQty}
                    />
                    <button
                      type="button"
                      className="h-10 w-10 rounded-full border border-slate-200 text-lg"
                      onClick={() => bumpDraftQty(1)}
                    >
                      +
                    </button>
                  </div>
                )}
                {canEditPrice ? (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="font-medium">$/</span>
                    <DecimalInput
                      className="pv-input w-24 py-2 text-center"
                      value={lineDraft.unitPrice}
                      onChange={(value) =>
                        setLineDraft((current) =>
                          current ? { ...current, unitPrice: value } : current,
                        )
                      }
                      onBlur={commitDraftPrice}
                      aria-label={`Precio por ${PRODUCT_UNIT_LABELS[unit]}`}
                    />
                  </label>
                ) : (
                  <span className="text-sm text-slate-500">
                    {formatMoney(Number(product.price))} / {PRODUCT_UNIT_LABELS[unit]}
                  </span>
                )}
              </div>

              {lineDraft.saleMode === 'piece' && !(parseDecimal(lineDraft.quantity) > 0) ? (
                <p className="mt-2 text-xs text-amber-700">Captura el peso en kg.</p>
              ) : null}
              {canEditPrice &&
              Math.abs(
                parseDecimal(lineDraft.unitPrice, Number(product.price)) - Number(product.price),
              ) > 0.0005 ? (
                <p className="mt-2 text-xs text-amber-700">
                  Lista: {formatMoney(Number(product.price))} / {PRODUCT_UNIT_LABELS[unit]}
                </p>
              ) : null}
              {lineError ? <p className="mt-2 text-sm text-rose-700">{lineError}</p> : null}

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">
                  {formatMoney(lineTotal)}
                </span>
                <ActionChip tone="emerald" emoji="🛒" onClick={confirmLineEditor}>
                  {updating ? 'Actualizar' : 'Agregar al pedido'}
                </ActionChip>
              </div>
            </section>
          </div>
        );
      })() : null}
      {boardFilters ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">{boardFilters}</div>
      ) : null}
    </>
  );
}
