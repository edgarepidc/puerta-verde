'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  POS_PAYMENT_METHODS,
  PRODUCT_UNIT_LABELS,
  formatMexicoMonthLabel,
  formatDecimal,
  formatMoney,
  groupByMexicoDay,
  groupSalesLogByMonth,
  isPosPaymentMethod,
  isUnpaidOrder,
  mexicoYmdFromIso,
  nextWorkflowStatus,
  normalizeOrderStatus,
  orderPaymentLabel,
  orderStatusLabel,
  previousWorkflowStatus,
  todayMexicoYmd,
  type MexicoDayGroup,
  type OrderStatus,
  type PaymentMethod,
  type PosPaymentMethod,
  type ProductUnit,
} from '@puertaverde/shared';

import { ActionChip, WhatsAppGlyph } from '@/components/ActionChip';
import {
  CounterSalePanel,
  buildTicketText,
  whatsappTicketHref,
  type CounterProduct,
} from '@/components/CounterSalePanel';
import { DecimalInput, parseDecimal } from '@/components/DecimalInput';
import { LowStockBanner } from '@/components/LowStockBanner';
import { ProductSearchSelect } from '@/components/ProductSearchSelect';
import { ThermalPrinterChip } from '@/components/ThermalPrinterChip';
import {
  formatOrderBoardTime,
  summarizeOrderItems,
  type OrderBoardItemPreview,
  type OrderBoardRow,
} from '@/lib/orders-board';
import { printThermalReceipt } from '@/lib/thermal-printer';
import type { ThermalReceiptData } from '@/lib/thermal-ticket';

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function normalizePhoneDigits(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

function playNewOrderChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.07;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.4);
    window.setTimeout(() => {
      void ctx.close();
    }, 500);
  } catch {
    // Ignore autoplay / unsupported audio contexts.
  }
}

type OrderRow = OrderBoardRow;

function isCounterSale(order: Pick<OrderRow, 'source' | 'delivery_notes'>): boolean {
  if (order.source === 'pos') return true;
  return (order.delivery_notes ?? '').startsWith('[mostrador]');
}

function fulfillmentLabel(order: Pick<OrderRow, 'fulfillment_type' | 'source' | 'delivery_notes'>): string {
  if (isCounterSale(order)) return 'Venta mostrador';
  return FULFILLMENT_LABELS[order.fulfillment_type];
}

interface OrderItem {
  id: string;
  branch_product_id?: string;
  product_name: string;
  unit: ProductUnit | string;
  quantity: number;
  ordered_quantity?: number | null;
  weigh_at_fulfillment?: boolean;
  unit_price: number;
  line_total: number;
}

const REFRESH_MS = 25_000;

type BoardFilter = 'hoy' | 'atender' | 'mostrador' | 'web' | 'por_pagar';

function isAttentionOrder(order: Pick<OrderRow, 'status'>): boolean {
  const status = normalizeOrderStatus(order.status);
  return status === 'pending' || status === 'preparing';
}

function matchesChannel(order: Pick<OrderRow, 'source' | 'delivery_notes'>, filter: BoardFilter): boolean {
  if (filter === 'mostrador') return isCounterSale(order);
  if (filter === 'web') return !isCounterSale(order);
  return true;
}

function isPorPagarOrder(order: Pick<OrderRow, 'payment_status' | 'payment_method'>): boolean {
  return isUnpaidOrder(order);
}

function statusChipClass(status: OrderStatus): string {
  if (status === 'pending') return 'bg-amber-100 text-amber-900';
  if (status === 'preparing') return 'bg-sky-100 text-sky-900';
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600';
  return 'bg-emerald-100 text-emerald-800';
}

export function OrdersBoard({
  initialOrders,
  products,
  branchName,
  canEditPosPrice = false,
  usbScaleEnabled = false,
  canExportSales = false,
  canEditOrders = false,
  canDeleteOrders = false,
  canEditPayment = false,
}: {
  initialOrders: OrderRow[];
  products: CounterProduct[];
  branchName?: string;
  canEditPosPrice?: boolean;
  usbScaleEnabled?: boolean;
  canExportSales?: boolean;
  canEditOrders?: boolean;
  canDeleteOrders?: boolean;
  canEditPayment?: boolean;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailNotes, setDetailNotes] = useState<string | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [editQuantities, setEditQuantities] = useState<Record<string, string>>({});
  const [editOrderedQuantities, setEditOrderedQuantities] = useState<Record<string, string>>({});
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(() => new Set());
  const [addProductId, setAddProductId] = useState('');
  const [addQuantity, setAddQuantity] = useState('1');
  const [addOrderedQuantity, setAddOrderedQuantity] = useState('1');
  const [editSoldOn, setEditSoldOn] = useState('');
  const [pendingAdds, setPendingAdds] = useState<
    Array<{
      key: string;
      branchProductId: string;
      name: string;
      unit: string;
      quantity: string;
      orderedQuantity: string | null;
      weighAtFulfillment: boolean;
      unitPrice: number;
    }>
  >([]);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [openDays, setOpenDays] = useState(() => new Set([todayMexicoYmd()]));
  const [openMonths, setOpenMonths] = useState(() => new Set<string>());
  const [exportOpen, setExportOpen] = useState(false);
  const [exportDates, setExportDates] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [boardFilter, setBoardFilter] = useState<BoardFilter>('hoy');
  const [newOrderNotice, setNewOrderNotice] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState('');
  const knownOrderIdsRef = useRef(new Set(initialOrders.map((order) => order.id)));
  const skipRefreshRef = useRef(false);

  const showBranchName = useMemo(() => {
    const names = new Set(
      orders.map((order) => {
        const branch = Array.isArray(order.branch) ? order.branch[0] : order.branch;
        return branch?.name ?? '';
      }),
    );
    return names.size > 1;
  }, [orders]);

  const openQueueCount = useMemo(
    () =>
      orders.filter((order) => {
        const status = normalizeOrderStatus(order.status);
        return status === 'pending' || status === 'preparing';
      }).length,
    [orders],
  );

  const queueHint =
    openQueueCount > 0
      ? `${openQueueCount} pedido${openQueueCount === 1 ? '' : 's'} en cola`
      : null;

  useEffect(() => {
    skipRefreshRef.current = Boolean(updatingId || detailSaving || detailEditing);
  }, [updatingId, detailSaving, detailEditing]);

  useEffect(() => {
    let cancelled = false;

    async function refreshOrders() {
      if (skipRefreshRef.current || cancelled) return;
      try {
        const response = await fetch('/api/orders');
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        const nextOrders = (payload.orders ?? []) as OrderRow[];

        const freshOpen = nextOrders.filter((order) => {
          const status = normalizeOrderStatus(order.status);
          return (
            (status === 'pending' || status === 'preparing') &&
            !knownOrderIdsRef.current.has(order.id)
          );
        });

        for (const order of nextOrders) {
          knownOrderIdsRef.current.add(order.id);
        }

        if (freshOpen.length > 0) {
          const newest = freshOpen[0]!;
          setNewOrderNotice(
            freshOpen.length === 1
              ? `Nuevo pedido #${newest.order_number} · ${newest.customer_name}`
              : `${freshOpen.length} pedidos nuevos`,
          );
          playNewOrderChime();
        }

        setOrders(nextOrders);
      } catch {
        // Keep current board if refresh fails.
      }
    }

    const intervalId = window.setInterval(refreshOrders, REFRESH_MS);
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void refreshOrders();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!newOrderNotice) return;
    const timeoutId = window.setTimeout(() => setNewOrderNotice(null), 8000);
    return () => window.clearTimeout(timeoutId);
  }, [newOrderNotice]);

  const searchedOrders = useMemo(() => {
    const needle = orderSearch.trim().toLowerCase();
    const phoneNeedle = needle.replace(/\D/g, '');

    return orders.filter((order) => {
      const status = normalizeOrderStatus(order.status);
      if (status === 'cancelled') return false;
      if (status !== 'pending' && status !== 'preparing' && status !== 'delivered') return false;
      if (!needle) return true;
      const numberHit = String(order.order_number).includes(needle.replace(/^#/, ''));
      const nameHit = order.customer_name.toLowerCase().includes(needle);
      const phoneHit =
        Boolean(phoneNeedle) &&
        normalizePhoneDigits(order.customer_phone).includes(phoneNeedle);
      const productHit = (order.items ?? []).some((item) =>
        item.product_name.toLowerCase().includes(needle),
      );
      return numberHit || nameHit || phoneHit || productHit;
    });
  }, [orders, orderSearch]);

  const searchingOrders = orderSearch.trim().length > 0;
  const todayYmd = todayMexicoYmd();

  const filterCounts = useMemo(() => {
    let hoy = 0;
    let atender = 0;
    let mostrador = 0;
    let web = 0;
    let porPagar = 0;
    let porPagarTotal = 0;
    for (const order of searchedOrders) {
      if (mexicoYmdFromIso(order.created_at) === todayYmd) hoy += 1;
      if (isAttentionOrder(order)) atender += 1;
      if (isCounterSale(order)) mostrador += 1;
      else web += 1;
      if (isPorPagarOrder(order)) {
        porPagar += 1;
        porPagarTotal += Number(order.total ?? 0);
      }
    }
    return { hoy, atender, mostrador, web, porPagar, porPagarTotal };
  }, [searchedOrders, todayYmd]);

  const attentionOrders = useMemo(
    () =>
      searchedOrders.filter((order) => {
        if (!isAttentionOrder(order)) return false;
        if (boardFilter === 'atender' || boardFilter === 'hoy') return true;
        if (boardFilter === 'por_pagar') return true;
        return matchesChannel(order, boardFilter);
      }),
    [searchedOrders, boardFilter],
  );

  const logOrders = useMemo(
    () =>
      searchedOrders.filter((order) => {
        if (normalizeOrderStatus(order.status) !== 'delivered') return false;
        if (boardFilter === 'por_pagar') return isPorPagarOrder(order);
        return matchesChannel(order, boardFilter);
      }),
    [searchedOrders, boardFilter],
  );

  const logSections = useMemo(() => groupSalesLogByMonth(logOrders, todayYmd), [logOrders, todayYmd]);

  const currentMonthTotal = useMemo(() => {
    const ym = todayYmd.slice(0, 7);
    let total = 0;
    for (const order of logOrders) {
      if (mexicoYmdFromIso(order.created_at).slice(0, 7) === ym) {
        total += Number(order.total);
      }
    }
    return total;
  }, [logOrders, todayYmd]);

  const exportDays = useMemo(
    () =>
      groupByMexicoDay(
        orders.filter((order) => normalizeOrderStatus(order.status) === 'delivered'),
      ),
    [orders],
  );

  function toggleMonth(ym: string) {
    setOpenMonths((current) => {
      const next = new Set(current);
      if (next.has(ym)) next.delete(ym);
      else next.add(ym);
      return next;
    });
  }

  function toggleDay(ymd: string) {
    setOpenDays((current) => {
      const next = new Set(current);
      if (next.has(ymd)) next.delete(ymd);
      else next.add(ymd);
      return next;
    });
  }

  function openExportModal() {
    setExportError(null);
    setExportDates(new Set(exportDays.map((day) => day.ymd)));
    setExportOpen(true);
  }

  function toggleExportDate(ymd: string) {
    setExportDates((current) => {
      const next = new Set(current);
      if (next.has(ymd)) next.delete(ymd);
      else next.add(ymd);
      return next;
    });
  }

  function selectAllExportDates() {
    setExportDates(new Set(exportDays.map((day) => day.ymd)));
  }

  function clearExportDates() {
    setExportDates(new Set());
  }

  async function downloadSelectedSales() {
    if (exportDates.size === 0) {
      setExportError('Selecciona al menos un día.');
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const dates = [...exportDates].sort().join(',');
      const response = await fetch(`/api/export/sales?dates=${encodeURIComponent(dates)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? 'No se pudo exportar');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'ventas.xlsx';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  const selected = orders.find((order) => order.id === detailId) ?? null;
  const storeName =
    branchName ??
    (Array.isArray(selected?.branch) ? selected?.branch[0]?.name : selected?.branch?.name);

  function ticketFromOrder(
    order: Pick<
      OrderRow,
      'order_number' | 'customer_name' | 'customer_phone' | 'payment_method' | 'total' | 'created_at'
    >,
    items: OrderItem[],
  ): ThermalReceiptData {
    return {
      storeName,
      orderNumber: order.order_number,
      soldAt: order.created_at,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      paymentMethod: order.payment_method,
      total: Number(order.total),
      items,
    };
  }

  function closeDetail() {
    setDetailId(null);
    setDetailEditing(false);
    setEditQuantities({});
    setEditOrderedQuantities({});
    setRemovedItemIds(new Set());
    setPendingAdds([]);
    setAddProductId('');
    setAddQuantity('1');
    setAddOrderedQuantity('1');
    setEditSoldOn('');
    setDetailError(null);
  }

  function resetEditDraft(items: OrderItem[], createdAt?: string) {
    setEditQuantities(
      Object.fromEntries(items.map((item) => [item.id, formatDecimal(Number(item.quantity))])),
    );
    setEditOrderedQuantities(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          item.ordered_quantity != null ? String(Number(item.ordered_quantity)) : '',
        ]),
      ),
    );
    setRemovedItemIds(new Set());
    setPendingAdds([]);
    setAddProductId('');
    setAddQuantity('1');
    setAddOrderedQuantity('1');
    setEditSoldOn(createdAt ? mexicoYmdFromIso(createdAt) || todayMexicoYmd() : todayMexicoYmd());
  }

  async function openDetail(orderId: string) {
    setDetailId(orderId);
    setDetailLoading(true);
    setDetailNotes(null);
    setDetailEditing(false);
    resetEditDraft([]);
    setDetailError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Error al cargar');
      const items = (payload.items ?? []) as OrderItem[];
      setDetailItems(items);
      setDetailNotes(payload.order?.delivery_notes ?? null);
      resetEditDraft(items, payload.order?.created_at ?? undefined);
    } catch {
      setDetailItems([]);
    } finally {
      setDetailLoading(false);
    }
  }

  const addProduct = products.find((row) => row.id === addProductId);
  const addIsWeigh = Boolean(addProduct?.product.weigh_at_fulfillment);

  function queueAddProduct() {
    const product = products.find((row) => row.id === addProductId);
    if (!product) {
      setDetailError('Selecciona un producto para agregar');
      return;
    }
    const weigh = Boolean(product.product.weigh_at_fulfillment);
    const qty = parseDecimal(addQuantity, NaN);
    if (!Number.isFinite(qty) || qty <= 0) {
      setDetailError(weigh ? 'Captura el peso en kg' : 'La cantidad a agregar debe ser mayor a cero');
      return;
    }
    let orderedQuantity: string | null = null;
    if (weigh) {
      const pieces = parseDecimal(addOrderedQuantity, NaN);
      if (!Number.isFinite(pieces) || pieces <= 0) {
        setDetailError('Indica cuántas piezas');
        return;
      }
      orderedQuantity = String(pieces);
    }
    setDetailError(null);
    setPendingAdds((current) => [
      ...current,
      {
        key: `${product.id}-${Date.now()}`,
        branchProductId: product.id,
        name: product.product.name,
        unit: product.product.unit,
        quantity: String(qty),
        orderedQuantity,
        weighAtFulfillment: weigh,
        unitPrice: Number(product.price),
      },
    ]);
    setAddProductId('');
    setAddQuantity('1');
    setAddOrderedQuantity('1');
  }

  async function saveOrderEdits() {
    if (!detailId) return;
    setDetailSaving(true);
    setDetailError(null);
    try {
      const remaining = detailItems.filter((item) => !removedItemIds.has(item.id));
      const items = remaining.map((item) => {
        const qty = parseDecimal(editQuantities[item.id] ?? '', NaN);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error(
            item.weigh_at_fulfillment
              ? `Captura el peso en kg de ${item.product_name}`
              : `Cantidad inválida en ${item.product_name}`,
          );
        }
        const catalogWeigh = products.some(
          (row) => row.id === item.branch_product_id && Boolean(row.product.weigh_at_fulfillment),
        );
        const weigh =
          Boolean(item.weigh_at_fulfillment) ||
          catalogWeigh ||
          Boolean(editOrderedQuantities[item.id]?.trim());
        let orderedQuantity: number | null | undefined = undefined;
        if (weigh) {
          const pieces = parseDecimal(editOrderedQuantities[item.id] ?? '', NaN);
          if (!Number.isFinite(pieces) || pieces <= 0) {
            throw new Error(`Indica las piezas pedidas de ${item.product_name}`);
          }
          orderedQuantity = pieces;
        }
        return { id: item.id, quantity: qty, orderedQuantity };
      });

      const addItems = pendingAdds.map((row) => {
        const qty = parseDecimal(row.quantity, NaN);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error(`Cantidad inválida en ${row.name}`);
        }
        let orderedQuantity: number | null = null;
        if (row.weighAtFulfillment) {
          const pieces = parseDecimal(row.orderedQuantity ?? '', NaN);
          if (!Number.isFinite(pieces) || pieces <= 0) {
            throw new Error(`Indica las piezas de ${row.name}`);
          }
          orderedQuantity = pieces;
        }
        return { branchProductId: row.branchProductId, quantity: qty, orderedQuantity };
      });

      const quantityChanged = remaining.some((item) => {
        const next = parseDecimal(editQuantities[item.id] ?? '', NaN);
        const orderedNext = editOrderedQuantities[item.id]?.trim() ?? '';
        const orderedPrev =
          item.ordered_quantity != null ? String(Number(item.ordered_quantity)) : '';
        return next !== Number(item.quantity) || orderedNext !== orderedPrev;
      });
      const hasLineChanges =
        quantityChanged || removedItemIds.size > 0 || addItems.length > 0;

      if (hasLineChanges && remaining.length + addItems.length < 1) {
        throw new Error('El pedido debe quedar con al menos un producto');
      }

      const currentOrder = orders.find((order) => order.id === detailId);
      const currentYmd = mexicoYmdFromIso(currentOrder?.created_at ?? '');
      const dateChanged = Boolean(editSoldOn && editSoldOn !== currentYmd);
      if (!hasLineChanges && !dateChanged) {
        setDetailEditing(false);
        return;
      }

      const response = await fetch(`/api/orders/${detailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(hasLineChanges
            ? {
                items,
                removeItemIds: [...removedItemIds],
                addItems,
              }
            : {}),
          soldOn: dateChanged ? editSoldOn : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo guardar');

      const nextItems = (payload.items ?? detailItems) as OrderItem[];
      setDetailItems(nextItems);
      const nextCreatedAt =
        typeof payload.order?.created_at === 'string'
          ? payload.order.created_at
          : currentOrder?.created_at;
      resetEditDraft(nextItems, nextCreatedAt);
      setOrders((current) =>
        current.map((order) =>
          order.id === detailId
            ? {
                ...order,
                total:
                  payload.order?.total != null ? Number(payload.order.total) : order.total,
                created_at: nextCreatedAt ?? order.created_at,
                items: nextItems.map((item) => ({
                  product_name: item.product_name,
                  quantity: Number(item.quantity),
                })),
              }
            : order,
        ),
      );
      setDetailEditing(false);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Error al guardar');
    } finally {
      setDetailSaving(false);
    }
  }

  async function deleteOrder() {
    if (!detailId || !selected) return;
    const ok = window.confirm(
      `¿Eliminar el pedido #${selected.order_number}? Se devolverá el stock al inventario.`,
    );
    if (!ok) return;

    setDetailSaving(true);
    setDetailError(null);
    try {
      const response = await fetch(`/api/orders/${detailId}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo eliminar');
      setOrders((current) => current.filter((order) => order.id !== detailId));
      closeDetail();
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Error al eliminar');
    } finally {
      setDetailSaving(false);
    }
  }

  async function updateStatus(orderId: string, status: OrderStatus) {
    setUpdatingId(orderId);
    try {
      const response = await fetch('/api/orders/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo actualizar');
      setOrders((current) =>
        current.map((order) => (order.id === orderId ? { ...order, status } : order)),
      );
      if (status === 'delivered') {
        const ymd = mexicoYmdFromIso(orders.find((order) => order.id === orderId)?.created_at ?? '');
        if (ymd) {
          setOpenDays((current) => {
            const next = new Set(current);
            next.add(ymd);
            return next;
          });
        }
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al actualizar');
    } finally {
      setUpdatingId(null);
    }
  }

  async function setPayment(orderId: string, paymentMethod: PosPaymentMethod) {
    setUpdatingId(orderId);
    try {
      const response = await fetch('/api/orders/payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paymentMethod }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo registrar pago');
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                payment_status:
                  payload.payment_status ??
                  (paymentMethod === 'on_account' ? 'pending' : 'paid'),
                payment_method: payload.payment_method ?? paymentMethod,
              }
            : order,
        ),
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al registrar pago');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <LowStockBanner products={products} />
      {newOrderNotice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="min-w-0 font-medium">{newOrderNotice}</p>
          <button
            type="button"
            className="shrink-0 text-xs font-semibold text-amber-800 hover:underline"
            onClick={() => setNewOrderNotice(null)}
          >
            Cerrar
          </button>
        </div>
      ) : null}
      <CounterSalePanel
        products={products}
        branchName={storeName}
        canEditPrice={canEditPosPrice}
        usbScaleEnabled={usbScaleEnabled}
        printerChip={
          <>
            <div className="w-28 shrink-0 sm:w-36">
              <input
                type="search"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Buscar…"
                title="Buscar cliente, # o producto"
                className="pv-input h-8 py-1 text-sm"
                aria-label="Buscar pedidos"
              />
            </div>
            <ThermalPrinterChip />
          </>
        }
        boardFilters={
          <>
            {(
              [
                { id: 'hoy', label: 'Hoy', count: filterCounts.hoy },
                { id: 'atender', label: 'Por atender', count: filterCounts.atender },
                { id: 'mostrador', label: 'Mostrador', count: filterCounts.mostrador },
                { id: 'web', label: 'Web', count: filterCounts.web },
              ] as const
            ).map((chip) => (
              <ActionChip
                key={chip.id}
                tone={boardFilter === chip.id ? 'emerald' : 'slate'}
                elevated={boardFilter === chip.id}
                onClick={() => setBoardFilter(chip.id)}
              >
                {chip.label}
                {chip.count > 0 ? (
                  <span className="tabular-nums text-slate-500"> · {chip.count}</span>
                ) : null}
              </ActionChip>
            ))}
            <ActionChip
              tone={boardFilter === 'por_pagar' ? 'amber' : filterCounts.porPagar > 0 ? 'amber' : 'slate'}
              elevated={boardFilter === 'por_pagar'}
              onClick={() => setBoardFilter('por_pagar')}
            >
              Por pagar
              {filterCounts.porPagar > 0 ? (
                <span className="tabular-nums text-amber-700"> · {filterCounts.porPagar}</span>
              ) : null}
            </ActionChip>
          </>
        }
        queueHint={queueHint}
        onCreated={(order, items) => {
          const previewItems: OrderBoardItemPreview[] = items.map((item) => ({
            product_name: item.product_name,
            quantity: Number(item.quantity),
          }));
          const row: OrderRow = {
            id: order.id,
            branch_id: order.branch_id ?? '',
            order_number: order.order_number,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            status: normalizeOrderStatus(order.status),
            fulfillment_type: order.fulfillment_type,
            total: Number(order.total),
            payment_status: order.payment_status,
            payment_method: order.payment_method,
            source: 'pos',
            delivery_notes: '[mostrador]',
            created_at: order.created_at,
            items: previewItems,
            branch: orders[0]?.branch ?? { name: branchName ?? 'Sucursal', slug: '' },
          };
          knownOrderIdsRef.current.add(row.id);
          setOrders((current) => [row, ...current.filter((existing) => existing.id !== row.id)]);
        }}
      />

      {boardFilter === 'atender' ? (
        <section className="pv-glass-card min-w-0 overflow-hidden p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-800">Por atender</h2>
            <p className="text-xs text-slate-500">
              {attentionOrders.length === 0
                ? searchingOrders
                  ? 'Sin coincidencias'
                  : 'Nada por preparar ahora'
                : `${attentionOrders.length} pedido${attentionOrders.length === 1 ? '' : 's'} web o en curso`}
            </p>
          </div>
          {attentionOrders.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {attentionOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  updatingId={updatingId}
                  showBranchName={showBranchName}
                  onOpen={openDetail}
                  onUpdateStatus={updateStatus}
                  onMarkPaid={setPayment}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <>
          {attentionOrders.length > 0 ? (
            <section className="pv-glass-card min-w-0 overflow-hidden border-amber-200/80 p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800">Por atender</h2>
                <p className="text-xs text-slate-500">
                  {attentionOrders.length} pedido{attentionOrders.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {attentionOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    updatingId={updatingId}
                    showBranchName={showBranchName}
                    onOpen={openDetail}
                    onUpdateStatus={updateStatus}
                    onMarkPaid={setPayment}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="pv-glass-card min-w-0 overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-800">
                  Ventas
                  <span className="ml-1.5 font-normal text-slate-500">
                    {formatMexicoMonthLabel(todayYmd.slice(0, 7), todayYmd)}
                  </span>
                </h2>
                <p className="truncate text-base font-semibold tabular-nums text-slate-800">
                  {logOrders.length === 0 && searchingOrders
                    ? 'Sin coincidencias'
                    : formatMoney(currentMonthTotal)}
                </p>
              </div>
              {canExportSales ? (
                <ActionChip
                  elevated={false}
                  emoji="📥"
                  disabled={exportDays.length === 0}
                  onClick={openExportModal}
                >
                  Exportar
                </ActionChip>
              ) : null}
            </div>
            <div className="space-y-3">
              {logSections.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {searchingOrders ? 'Sin coincidencias' : 'Sin ventas'}
                </p>
              ) : (
                logSections.map((section) => {
                  if (section.kind === 'month') {
                    const open = searchingOrders || openMonths.has(section.ym);
                    return (
                      <div key={section.ym} className="space-y-1">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => toggleMonth(section.ym)}
                          className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-white/50"
                        >
                          <span className="truncate">
                            {open ? '▾' : '▸'} {section.label}
                            <span className="ml-1 font-normal text-slate-400">
                              · {section.count} {section.count === 1 ? 'venta' : 'ventas'}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-700">
                            {formatMoney(section.total)}
                          </span>
                        </button>
                        {open
                          ? section.days.map((day) => (
                              <div key={day.ymd} className="pl-3">
                                <SalesDayBlock
                                  day={day}
                                  open={searchingOrders || openDays.has(day.ymd)}
                                  emphasizeTotal={false}
                                  selectedId={detailId}
                                  showBranchName={showBranchName}
                                  onToggle={() => toggleDay(day.ymd)}
                                  onOpen={openDetail}
                                />
                              </div>
                            ))
                          : null}
                      </div>
                    );
                  }

                  return (
                    <SalesDayBlock
                      key={section.ymd}
                      day={section}
                      open={searchingOrders || openDays.has(section.ymd)}
                      emphasizeTotal={section.label === 'Hoy'}
                      selectedId={detailId}
                      showBranchName={showBranchName}
                      onToggle={() => toggleDay(section.ymd)}
                      onOpen={openDetail}
                    />
                  );
                })
              )}
            </div>
          </section>
        </>
      )}

      {exportOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Exportar ventas</h2>
                <p className="text-sm text-slate-500">Elige los días que quieres respaldar en Excel.</p>
              </div>
              <button
                type="button"
                className="text-sm text-slate-500"
                onClick={() => setExportOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="pv-btn-ghost px-3 py-1 text-xs"
                onClick={selectAllExportDates}
              >
                Todos
              </button>
              <button
                type="button"
                className="pv-btn-ghost px-3 py-1 text-xs"
                onClick={clearExportDates}
              >
                Ninguno
              </button>
            </div>

            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {exportDays.map((day) => {
                const checked = exportDates.has(day.ymd);
                return (
                  <li key={day.ymd}>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExportDate(day.ymd)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {day.label}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {day.ymd} · {day.count} {day.count === 1 ? 'venta' : 'ventas'}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-slate-700">
                        {formatMoney(day.total)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {exportError ? <p className="mt-3 text-sm text-rose-700">{exportError}</p> : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">
                {exportDates.size} día{exportDates.size === 1 ? '' : 's'} seleccionado
                {exportDates.size === 1 ? '' : 's'}
              </p>
              <button
                type="button"
                disabled={exporting || exportDates.size === 0}
                onClick={downloadSelectedSales}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {exporting ? 'Generando…' : 'Descargar Excel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailId && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.customer_name}</h2>
                <p className="text-sm text-slate-500">
                  Pedido #{selected.order_number} · {selected.customer_phone}
                </p>
              </div>
              <button type="button" className="text-sm text-slate-500" onClick={closeDetail}>
                Cerrar
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {orderStatusLabel(selected.status)} · {fulfillmentLabel(selected)} ·{' '}
              {orderPaymentLabel(selected)}
              {!detailEditing ? (
                <>
                  {' '}
                  · {mexicoYmdFromIso(selected.created_at) || formatOrderBoardTime(selected.created_at)}
                </>
              ) : null}
            </p>
            {detailEditing && canEditOrders ? (
              <label className="mt-3 block text-sm">
                <span className="font-medium text-slate-700">Fecha del pedido</span>
                <input
                  type="date"
                  className="pv-input mt-1"
                  value={editSoldOn}
                  max={todayMexicoYmd()}
                  onChange={(e) => setEditSoldOn(e.target.value)}
                />
              </label>
            ) : null}
            {canEditPayment ? (
              <PaymentMethodSelect
                order={selected}
                disabled={updatingId === selected.id}
                onSelect={(method) => void setPayment(selected.id, method)}
              />
            ) : isUnpaidOrder(selected) ? (
              <PaymentMethodSelect
                order={selected}
                collectOnly
                disabled={updatingId === selected.id}
                onSelect={(method) => void setPayment(selected.id, method)}
              />
            ) : null}
            {detailNotes && detailNotes !== '[mostrador]' && (
              <p className="mt-2 text-sm text-slate-500">Notas: {detailNotes.replace(/^\[mostrador\]\s*/, '')}</p>
            )}
            <div className="mt-4 space-y-2">
              {detailLoading && <p className="text-sm text-slate-500">Cargando productos…</p>}
              {!detailLoading &&
                detailItems.map((item) => {
                  if (removedItemIds.has(item.id)) return null;
                  const unitLabel = PRODUCT_UNIT_LABELS[item.unit as ProductUnit] ?? item.unit;
                  const catalogWeigh = products.some(
                    (row) =>
                      row.id === item.branch_product_id && Boolean(row.product.weigh_at_fulfillment),
                  );
                  const isWeigh = Boolean(item.weigh_at_fulfillment) || catalogWeigh;
                  const previewQty = detailEditing
                    ? parseDecimal(editQuantities[item.id] ?? '', Number(item.quantity))
                    : Number(item.quantity);
                  const previewLine = roundMoney(previewQty * Number(item.unit_price));
                  const orderedLabel =
                    item.ordered_quantity != null
                      ? `${Number(item.ordered_quantity)} pieza${Number(item.ordered_quantity) === 1 ? '' : 's'}`
                      : null;

                  return (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800">
                          {item.product_name}
                          {isWeigh ? (
                            <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                              Por pieza
                            </span>
                          ) : null}
                        </p>
                        {detailEditing && canEditOrders ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {isWeigh ? (
                              <>
                                <label className="flex items-center gap-1 text-xs text-slate-500">
                                  Piezas
                                  <DecimalInput
                                    value={editOrderedQuantities[item.id] ?? ''}
                                    onChange={(value) =>
                                      setEditOrderedQuantities((current) => ({
                                        ...current,
                                        [item.id]: value,
                                      }))
                                    }
                                    className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                    aria-label={`Piezas de ${item.product_name}`}
                                  />
                                </label>
                                <label className="flex items-center gap-1 text-xs text-slate-500">
                                  Peso kg
                                  <DecimalInput
                                    value={editQuantities[item.id] ?? ''}
                                    onChange={(value) =>
                                      setEditQuantities((current) => ({
                                        ...current,
                                        [item.id]: value,
                                      }))
                                    }
                                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                    aria-label={`Peso de ${item.product_name}`}
                                  />
                                </label>
                              </>
                            ) : (
                              <>
                                <DecimalInput
                                  value={editQuantities[item.id] ?? ''}
                                  onChange={(value) =>
                                    setEditQuantities((current) => ({ ...current, [item.id]: value }))
                                  }
                                  className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                  aria-label={`Cantidad de ${item.product_name}`}
                                />
                                <span className="text-xs text-slate-500">{unitLabel}</span>
                              </>
                            )}
                            <span className="text-xs text-slate-400">
                              × {formatMoney(Number(item.unit_price))}
                              {isWeigh ? '/kg' : ''}
                            </span>
                            <button
                              type="button"
                              className="text-xs font-medium text-rose-700 hover:underline"
                              onClick={() =>
                                setRemovedItemIds((current) => new Set(current).add(item.id))
                              }
                            >
                              Quitar
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">
                            {isWeigh && orderedLabel ? `${orderedLabel} · ` : null}
                            {formatDecimal(Number(item.quantity))} {unitLabel} × {formatMoney(Number(item.unit_price))}
                            {isWeigh ? '/kg' : ''}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 tabular-nums text-slate-800">
                        {formatMoney(previewLine)}
                      </span>
                    </div>
                  );
                })}
              {!detailLoading &&
                detailEditing &&
                pendingAdds.map((row) => {
                  const qty = parseDecimal(row.quantity, 0);
                  const unitLabel = PRODUCT_UNIT_LABELS[row.unit as ProductUnit] ?? row.unit;
                  return (
                    <div
                      key={row.key}
                      className="flex items-start justify-between gap-3 rounded-lg bg-emerald-50/60 px-2 py-1.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800">
                          {row.name}{' '}
                          <span className="text-xs font-normal text-emerald-700">nuevo</span>
                          {row.weighAtFulfillment ? (
                            <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                              Por pieza
                            </span>
                          ) : null}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {row.weighAtFulfillment ? (
                            <>
                              <label className="flex items-center gap-1 text-xs text-slate-500">
                                Piezas
                                <DecimalInput
                                  value={row.orderedQuantity ?? ''}
                                  onChange={(value) =>
                                    setPendingAdds((current) =>
                                      current.map((item) =>
                                        item.key === row.key
                                          ? { ...item, orderedQuantity: value }
                                          : item,
                                      ),
                                    )
                                  }
                                  className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                  aria-label={`Piezas de ${row.name}`}
                                />
                              </label>
                              <label className="flex items-center gap-1 text-xs text-slate-500">
                                Peso kg
                                <DecimalInput
                                  value={row.quantity}
                                  onChange={(value) =>
                                    setPendingAdds((current) =>
                                      current.map((item) =>
                                        item.key === row.key ? { ...item, quantity: value } : item,
                                      ),
                                    )
                                  }
                                  className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                  aria-label={`Peso de ${row.name}`}
                                />
                              </label>
                            </>
                          ) : (
                            <>
                              <DecimalInput
                                value={row.quantity}
                                onChange={(value) =>
                                  setPendingAdds((current) =>
                                    current.map((item) =>
                                      item.key === row.key ? { ...item, quantity: value } : item,
                                    ),
                                  )
                                }
                                className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                aria-label={`Cantidad de ${row.name}`}
                              />
                              <span className="text-xs text-slate-500">{unitLabel}</span>
                            </>
                          )}
                          <button
                            type="button"
                            className="text-xs font-medium text-rose-700 hover:underline"
                            onClick={() =>
                              setPendingAdds((current) => current.filter((item) => item.key !== row.key))
                            }
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                      <span className="shrink-0 tabular-nums text-slate-800">
                        {formatMoney(roundMoney(qty * row.unitPrice))}
                      </span>
                    </div>
                  );
                })}
              {!detailLoading &&
                detailEditing &&
                canEditOrders && (
                  <div className="rounded-xl border border-dashed border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-600">Agregar producto</p>
                    <div className="mt-2 space-y-2">
                      <ProductSearchSelect
                        products={products}
                        value={addProductId}
                        onChange={(id) => {
                          setAddProductId(id);
                          const next = products.find((row) => row.id === id);
                          if (next?.product.weigh_at_fulfillment) {
                            setAddOrderedQuantity('1');
                            setAddQuantity('');
                          } else {
                            setAddOrderedQuantity('1');
                            setAddQuantity('1');
                          }
                        }}
                        placeholder="Buscar producto…"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {addIsWeigh ? (
                          <>
                            <label className="flex items-center gap-1 text-xs text-slate-500">
                              Piezas
                              <DecimalInput
                                value={addOrderedQuantity}
                                onChange={setAddOrderedQuantity}
                                className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                aria-label="Piezas a agregar"
                              />
                            </label>
                            <label className="flex items-center gap-1 text-xs text-slate-500">
                              Peso kg
                              <DecimalInput
                                value={addQuantity}
                                onChange={setAddQuantity}
                                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                placeholder="0.00"
                                aria-label="Peso a agregar"
                              />
                            </label>
                          </>
                        ) : (
                          <DecimalInput
                            value={addQuantity}
                            onChange={setAddQuantity}
                            className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            aria-label="Cantidad a agregar"
                          />
                        )}
                        <ActionChip emoji="🥬" onClick={queueAddProduct}>
                          Agregar
                        </ActionChip>
                      </div>
                      {addIsWeigh ? (
                        <p className="text-[11px] text-slate-500">
                          Producto por pieza: captura piezas pedidas y el peso real en kg.
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}
              {!detailLoading &&
                detailItems.filter((item) => !removedItemIds.has(item.id)).length === 0 &&
                pendingAdds.length === 0 && (
                  <p className="text-sm text-slate-500">Sin partidas.</p>
                )}
            </div>
            <p className="mt-4 text-right text-base font-semibold">
              {formatMoney(
                detailEditing && canEditOrders
                  ? roundMoney(
                      Number(selected.total) -
                        detailItems.reduce((sum, item) => sum + Number(item.line_total), 0) +
                        detailItems.reduce((sum, item) => {
                          if (removedItemIds.has(item.id)) return sum;
                          const qty = parseDecimal(
                            editQuantities[item.id] ?? '',
                            Number(item.quantity),
                          );
                          return sum + qty * Number(item.unit_price);
                        }, 0) +
                        pendingAdds.reduce((sum, row) => {
                          const qty = parseDecimal(row.quantity, 0);
                          return sum + qty * row.unitPrice;
                        }, 0),
                    )
                  : Number(selected.total),
              )}
            </p>
            {detailError ? <p className="mt-2 text-sm text-rose-700">{detailError}</p> : null}
            <div className="mt-4 flex flex-nowrap gap-2 overflow-x-auto">
              {canEditOrders && !detailEditing ? (
                <ActionChip
                  elevated={false}
                  disabled={detailLoading || detailSaving}
                  onClick={() => {
                    setDetailError(null);
                    resetEditDraft(detailItems, selected.created_at);
                    setDetailEditing(true);
                  }}
                >
                  Editar
                </ActionChip>
              ) : null}
              {canEditOrders && detailEditing ? (
                <>
                  <ActionChip
                    tone="emerald"
                    disabled={detailSaving}
                    onClick={saveOrderEdits}
                  >
                    {detailSaving ? 'Guardando…' : 'Guardar'}
                  </ActionChip>
                  <ActionChip
                    elevated={false}
                    disabled={detailSaving}
                    onClick={() => {
                      setDetailEditing(false);
                      setDetailError(null);
                      resetEditDraft(detailItems, selected.created_at);
                    }}
                  >
                    Cancelar
                  </ActionChip>
                </>
              ) : null}
              {!detailEditing && normalizeOrderStatus(selected.status) === 'delivered' ? (
                <>
                  <ActionChip
                    emoji="🖨️"
                    disabled={detailLoading || detailSaving}
                    onClick={async () => {
                      setPrintError(null);
                      try {
                        await printThermalReceipt(ticketFromOrder(selected, detailItems), {
                          connectIfNeeded: true,
                        });
                      } catch (err) {
                        setPrintError(err instanceof Error ? err.message : 'No se pudo imprimir el ticket.');
                      }
                    }}
                  >
                    Imprimir
                  </ActionChip>
                  <a
                    href={whatsappTicketHref(
                      selected.customer_phone,
                      buildTicketText({
                        orderNumber: selected.order_number,
                        customerName: selected.customer_name,
                        paymentMethod: selected.payment_method,
                        statusLabel: orderStatusLabel(selected.status),
                        total: Number(selected.total),
                        items: detailItems,
                      }),
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0"
                  >
                    <ActionChip as="span" tone="whatsapp" icon={<WhatsAppGlyph />}>
                      Enviar
                    </ActionChip>
                  </a>
                </>
              ) : null}
              {canDeleteOrders && !detailEditing ? (
                <ActionChip
                  tone="rose"
                  elevated={false}
                  disabled={detailLoading || detailSaving}
                  onClick={() => void deleteOrder()}
                >
                  Eliminar
                </ActionChip>
              ) : null}
            </div>
            {printError ? <p className="mt-2 text-xs text-rose-700">{printError}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function SalesDayBlock({
  day,
  open,
  emphasizeTotal,
  selectedId,
  showBranchName,
  onToggle,
  onOpen,
}: {
  day: MexicoDayGroup<OrderRow>;
  open: boolean;
  emphasizeTotal: boolean;
  selectedId: string | null;
  showBranchName: boolean;
  onToggle: () => void;
  onOpen: (orderId: string) => void;
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-xs font-medium text-slate-600 hover:bg-white/50"
      >
        <span className="truncate">
          {open ? '▾' : '▸'} {day.label}
          <span className="ml-1 font-normal text-slate-400">
            · {day.count} {day.count === 1 ? 'venta' : 'ventas'}
          </span>
        </span>
        <span
          className={`shrink-0 tabular-nums ${
            emphasizeTotal ? 'text-sm font-semibold text-slate-800' : ''
          }`}
        >
          {formatMoney(day.total)}
        </span>
      </button>
      {open ? (
        <div className="overflow-hidden rounded-lg">
          {day.items.map((order, index) => (
            <OrderLogRow
              key={order.id}
              order={order}
              selected={selectedId === order.id}
              stripe={index % 2 === 1}
              showBranchName={showBranchName}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function selectedPosPayment(order: Pick<OrderRow, 'payment_status' | 'payment_method'>): PaymentMethod {
  if (isUnpaidOrder(order)) return 'on_account';
  if (order.payment_method === 'online') return 'online';
  if (isPosPaymentMethod(order.payment_method)) return order.payment_method;
  return 'cash';
}

function PaymentMethodSelect({
  order,
  disabled,
  collectOnly = false,
  onSelect,
}: {
  order: Pick<OrderRow, 'payment_status' | 'payment_method'>;
  disabled?: boolean;
  collectOnly?: boolean;
  onSelect: (method: PosPaymentMethod) => void;
}) {
  const selected = selectedPosPayment(order);
  const methods: PaymentMethod[] = collectOnly
    ? ['cash', 'card_terminal', 'transfer']
    : selected === 'online'
      ? ['cash', 'card_terminal', 'transfer', 'online', 'on_account']
      : [...POS_PAYMENT_METHODS];

  return (
    <label className="mt-3 block text-sm">
      <span className="font-medium text-slate-700">Forma de pago</span>
      <select
        className="pv-input mt-1"
        aria-label="Forma de pago"
        value={collectOnly && selected === 'on_account' ? '' : selected}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (!isPosPaymentMethod(next) || next === selected) return;
          onSelect(next);
        }}
      >
        {collectOnly ? (
          <option value="" disabled>
            Elige cómo pagó
          </option>
        ) : null}
        {methods.map((method) => (
          <option key={method} value={method} disabled={method === 'online'}>
            {PAYMENT_METHOD_LABELS[method]}
          </option>
        ))}
      </select>
    </label>
  );
}

function OrderLogRow({
  order,
  selected,
  stripe,
  showBranchName,
  onOpen,
}: {
  order: OrderRow;
  selected: boolean;
  stripe: boolean;
  showBranchName: boolean;
  onOpen: (orderId: string) => void;
}) {
  const branch = Array.isArray(order.branch) ? order.branch[0] : order.branch;
  const unpaid = isUnpaidOrder(order);
  const status = normalizeOrderStatus(order.status);
  const timeLabel = formatOrderBoardTime(order.created_at);
  const itemsPreview = summarizeOrderItems(order.items ?? []);
  const counterSale = isCounterSale(order);

  return (
    <button
      type="button"
      onClick={() => onOpen(order.id)}
      className={`flex w-full min-w-0 items-center gap-2 border-b border-slate-200/80 px-2 py-2 text-left text-sm last:border-b-0 ${
        selected
          ? 'bg-emerald-50 hover:bg-emerald-50'
          : unpaid
            ? 'bg-amber-50/70 hover:bg-amber-50'
            : stripe
              ? 'bg-slate-50 hover:bg-slate-100/80'
              : 'bg-white/50 hover:bg-slate-50/80'
      }`}
    >
      <span className="w-[5.5rem] shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-400">
        {timeLabel || '—'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">
          {order.customer_name}
          <span className="ml-1.5 font-normal text-slate-500">#{order.order_number}</span>
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-xs text-slate-500">
            {itemsPreview}
            {showBranchName && branch?.name ? ` · ${branch.name}` : ''}
            {unpaid ? ' · Por pagar' : ''}
          </p>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              counterSale ? 'bg-slate-100 text-slate-700' : 'bg-sky-100 text-sky-800'
            }`}
          >
            {counterSale ? 'Mostrador' : 'En línea'}
          </span>
        </div>
      </div>
      <span className="shrink-0 self-center tabular-nums font-medium text-slate-800">
        {formatMoney(Number(order.total))}
      </span>
      <span
        className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${statusChipClass(status)}`}
      >
        {ORDER_STATUS_LABELS[status]}
      </span>
    </button>
  );
}

function OrderCard({
  order,
  updatingId,
  showBranchName,
  onOpen,
  onUpdateStatus,
  onMarkPaid,
}: {
  order: OrderRow;
  updatingId: string | null;
  showBranchName: boolean;
  onOpen: (orderId: string) => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onMarkPaid: (orderId: string, paymentMethod: PosPaymentMethod) => void;
}) {
  const branch = Array.isArray(order.branch) ? order.branch[0] : order.branch;
  const nextStatus = nextWorkflowStatus(order.status);
  const prevStatus = previousWorkflowStatus(order.status);
  const unpaid = isUnpaidOrder(order);
  const timeLabel = formatOrderBoardTime(order.created_at);
  const itemsPreview = summarizeOrderItems(order.items ?? []);

  return (
    <article
      className={`pv-glass-item rounded-xl p-3 ${
        unpaid ? 'border border-amber-300/80 bg-amber-50/40 shadow-[inset_3px_0_0_0_#f59e0b]' : ''
      }`}
    >
      <button type="button" className="w-full text-left" onClick={() => onOpen(order.id)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="font-semibold text-slate-900">{order.customer_name}</p>
              {timeLabel ? (
                <span className="text-[11px] tabular-nums text-slate-400">{timeLabel}</span>
              ) : null}
              {unpaid ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  Por pagar
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-600">#{order.order_number}</p>
            <p className="text-xs text-slate-500">{order.customer_phone}</p>
          </div>
          <span className="shrink-0 text-sm font-medium">{formatMoney(Number(order.total))}</span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{itemsPreview}</p>
        <p className="mt-1 text-xs text-slate-500">
          {showBranchName && branch?.name ? `${branch.name} · ` : ''}
          {fulfillmentLabel(order)}
          {!unpaid ? ' · Pagado' : ''}
        </p>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        {prevStatus ? (
          <button
            type="button"
            disabled={updatingId === order.id}
            onClick={() => onUpdateStatus(order.id, prevStatus)}
            className="pv-btn-ghost px-3 py-1 text-xs disabled:opacity-50"
          >
            ← {ORDER_STATUS_LABELS[prevStatus]}
          </button>
        ) : null}
        {nextStatus ? (
          <button
            type="button"
            disabled={updatingId === order.id}
            onClick={() => onUpdateStatus(order.id, nextStatus)}
            className="pv-btn-primary px-3 py-1 text-xs disabled:opacity-50"
          >
            → {ORDER_STATUS_LABELS[nextStatus]}
          </button>
        ) : null}
        {unpaid ? (
          <select
            aria-label="Forma de pago"
            disabled={updatingId === order.id}
            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-950 disabled:opacity-50"
            defaultValue=""
            onChange={(event) => {
              const next = event.target.value;
              if (!isPosPaymentMethod(next) || next === 'on_account') return;
              onMarkPaid(order.id, next);
              event.currentTarget.value = '';
            }}
          >
            <option value="" disabled>
              Cobrar
            </option>
            <option value="cash">Efectivo</option>
            <option value="card_terminal">TPV</option>
            <option value="transfer">Transferencia</option>
          </select>
        ) : null}
      </div>
    </article>
  );
}
