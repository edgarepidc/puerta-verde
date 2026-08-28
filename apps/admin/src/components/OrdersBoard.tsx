'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_WORKFLOW_STATUSES,
  PAYMENT_METHOD_LABELS,
  PRODUCT_UNIT_LABELS,
  formatMoney,
  groupByMexicoDay,
  mexicoYmdFromIso,
  nextWorkflowStatus,
  normalizeOrderStatus,
  orderStatusLabel,
  previousWorkflowStatus,
  todayMexicoYmd,
  type OrderStatus,
  type OrderWorkflowStatus,
  type PaymentMethod,
  type ProductUnit,
} from '@puertaverde/shared';

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

const COLUMNS = ORDER_WORKFLOW_STATUSES;
const REFRESH_MS = 25_000;

const COLUMN_META: Record<
  OrderWorkflowStatus,
  { accentClass: string; image: string; empty: string }
> = {
  pending: { accentClass: 'pv-glass-card-accent-orange', image: '/orders/pending.png', empty: 'Sin pedidos' },
  preparing: { accentClass: 'pv-glass-card-accent-blue', image: '/orders/preparing.png', empty: 'Sin pedidos' },
  delivered: { accentClass: 'pv-glass-card-accent-green', image: '/orders/delivered.png', empty: 'Sin ventas' },
};

export function OrdersBoard({
  initialOrders,
  products,
  branchName,
  canEditPosPrice = false,
  usbScaleEnabled = false,
  canExportSales = false,
  canEditOrders = false,
  canDeleteOrders = false,
}: {
  initialOrders: OrderRow[];
  products: CounterProduct[];
  branchName?: string;
  canEditPosPrice?: boolean;
  usbScaleEnabled?: boolean;
  canExportSales?: boolean;
  canEditOrders?: boolean;
  canDeleteOrders?: boolean;
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportDates, setExportDates] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<OrderWorkflowStatus>(() => {
    const firstOpen = initialOrders.find((order) => {
      const status = normalizeOrderStatus(order.status);
      return status === 'pending' || status === 'preparing';
    });
    return firstOpen ? normalizeOrderStatus(firstOpen.status) as OrderWorkflowStatus : 'pending';
  });
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
          const status = normalizeOrderStatus(newest.status);
          if (status === 'pending' || status === 'preparing') {
            setMobileTab(status);
          }
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

  const grouped = useMemo(() => {
    const map: Record<OrderWorkflowStatus, OrderRow[]> = {
      pending: [],
      preparing: [],
      delivered: [],
    };
    const needle = orderSearch.trim().toLowerCase();
    const phoneNeedle = needle.replace(/\D/g, '');

    for (const order of orders) {
      const status = normalizeOrderStatus(order.status);
      if (status === 'cancelled') continue;
      if (status !== 'pending' && status !== 'preparing' && status !== 'delivered') continue;

      if (needle) {
        const numberHit = String(order.order_number).includes(needle.replace(/^#/, ''));
        const nameHit = order.customer_name.toLowerCase().includes(needle);
        const phoneHit =
          Boolean(phoneNeedle) &&
          normalizePhoneDigits(order.customer_phone).includes(phoneNeedle);
        const productHit = (order.items ?? []).some((item) =>
          item.product_name.toLowerCase().includes(needle),
        );
        if (!numberHit && !nameHit && !phoneHit && !productHit) continue;
      }

      map[status].push(order);
    }
    return map;
  }, [orders, orderSearch]);

  const searchingOrders = orderSearch.trim().length > 0;

  const deliveredDays = useMemo(() => groupByMexicoDay(grouped.delivered), [grouped.delivered]);

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
    setExportDates(new Set(deliveredDays.map((day) => day.ymd)));
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
    setExportDates(new Set(deliveredDays.map((day) => day.ymd)));
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
      Object.fromEntries(items.map((item) => [item.id, String(Number(item.quantity))])),
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

  async function markPaid(orderId: string, paymentMethod: 'cash' | 'card_terminal' | 'transfer') {
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
            ? { ...order, payment_status: 'paid', payment_method: paymentMethod }
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
    <div className="space-y-2">
      <LowStockBanner products={products} href="/?section=stock" />
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
            <div className="w-44 shrink-0 sm:w-52">
              <input
                type="search"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Buscar…"
                title="Buscar cliente, # o producto"
                className="pv-input h-9 py-1.5 text-sm"
                aria-label="Buscar pedidos"
              />
            </div>
            <ThermalPrinterChip />
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

      <div className="flex justify-center gap-1 overflow-x-auto pb-1 lg:hidden">
        {COLUMNS.map((status) => {
          const count = grouped[status]?.length ?? 0;
          const active = mobileTab === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setMobileTab(status)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-white/70 text-slate-600 ring-1 ring-slate-200'
              }`}
            >
              {ORDER_STATUS_LABELS[status]}
              <span className={`ml-1 tabular-nums ${active ? 'text-white/80' : 'text-slate-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-2.5">
        {COLUMNS.map((status) => {
          const meta = COLUMN_META[status];
          const columnOrders = grouped[status] ?? [];
          const deliveredTotal = status === 'delivered'
            ? columnOrders.reduce((sum, order) => sum + Number(order.total), 0)
            : 0;

          return (
          <section
            key={status}
            className={`pv-glass-card pv-glass-card-accent ${meta.accentClass} min-w-0 overflow-hidden p-3 ${
              status === mobileTab ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="mb-3 flex items-center gap-2.5">
              <Image
                src={meta.image}
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {ORDER_STATUS_LABELS[status]}
                  </h2>
                  {status === 'delivered' && canExportSales ? (
                    <button
                      type="button"
                      onClick={openExportModal}
                      disabled={deliveredDays.length === 0}
                      className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      Exportar
                    </button>
                  ) : null}
                </div>
                <p className="truncate text-[11px] text-slate-400">
                  {columnOrders.length === 0
                    ? searchingOrders
                      ? 'Sin coincidencias'
                      : meta.empty
                    : status === 'delivered'
                      ? `${columnOrders.length} venta${columnOrders.length === 1 ? '' : 's'} · ${formatMoney(deliveredTotal)}`
                      : `${columnOrders.length} pedido${columnOrders.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {status === 'delivered' ? (
                deliveredDays.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin ventas en los últimos 30 días</p>
                ) : (
                  deliveredDays.map((day) => {
                    const open = searchingOrders || openDays.has(day.ymd);
                    return (
                      <div key={day.ymd} className="space-y-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => toggleDay(day.ymd)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-xs font-medium text-slate-600 hover:bg-white/50"
                          >
                            <span className="truncate">
                              {open ? '▾' : '▸'} {day.label}
                              <span className="ml-1 font-normal text-slate-400">
                                · {day.count} {day.count === 1 ? 'venta' : 'ventas'}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums">{formatMoney(day.total)}</span>
                          </button>
                        </div>
                        {open
                          ? day.items.map((order) => (
                              <OrderCard
                                key={order.id}
                                order={order}
                                updatingId={updatingId}
                                showBranchName={showBranchName}
                                onOpen={openDetail}
                                onUpdateStatus={updateStatus}
                                onMarkPaid={markPaid}
                              />
                            ))
                          : null}
                      </div>
                    );
                  })
                )
              ) : (
                <>
                  {columnOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      updatingId={updatingId}
                      showBranchName={showBranchName}
                      onOpen={openDetail}
                      onUpdateStatus={updateStatus}
                      onMarkPaid={markPaid}
                    />
                  ))}
                  {columnOrders.length === 0 && (
                    <p className="text-sm text-slate-400">{meta.empty}</p>
                  )}
                </>
              )}
            </div>
          </section>
          );
        })}
      </div>

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
              {deliveredDays.map((day) => {
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
              {selected.payment_status === 'paid'
                ? `Pagado (${PAYMENT_METHOD_LABELS[(selected.payment_method as PaymentMethod) ?? 'cash'] ?? selected.payment_method})`
                : 'Pendiente de pago'}
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
            {selected.payment_status !== 'paid' ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-semibold text-amber-950">Registrar pago</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  Elige cómo pagó el cliente. El pedido queda como pagado al instante.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={updatingId === selected.id}
                    onClick={() => markPaid(selected.id, 'cash')}
                    className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Efectivo
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === selected.id}
                    onClick={() => markPaid(selected.id, 'card_terminal')}
                    className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50"
                  >
                    TPV
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === selected.id}
                    onClick={() => markPaid(selected.id, 'transfer')}
                    className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Transferencia
                  </button>
                </div>
              </div>
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
                            {Number(item.quantity)} {unitLabel} × {formatMoney(Number(item.unit_price))}
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
                        <button
                          type="button"
                          className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                          onClick={queueAddProduct}
                        >
                          Agregar
                        </button>
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
            <div className="mt-4 flex flex-wrap gap-2">
              {canEditOrders && !detailEditing ? (
                <button
                  type="button"
                  disabled={detailLoading || detailSaving}
                  className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() => {
                    setDetailError(null);
                    resetEditDraft(detailItems, selected.created_at);
                    setDetailEditing(true);
                  }}
                >
                  Editar pedido
                </button>
              ) : null}
              {canEditOrders && detailEditing ? (
                <>
                  <button
                    type="button"
                    disabled={detailSaving}
                    className="inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    onClick={saveOrderEdits}
                  >
                    {detailSaving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    disabled={detailSaving}
                    className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() => {
                      setDetailEditing(false);
                      setDetailError(null);
                      resetEditDraft(detailItems, selected.created_at);
                    }}
                  >
                    Cancelar
                  </button>
                </>
              ) : null}
              {!detailEditing && normalizeOrderStatus(selected.status) === 'delivered' ? (
                <>
                  <button
                    type="button"
                    disabled={detailLoading || detailSaving}
                    className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
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
                    Imprimir ticket
                  </button>
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
                    className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm"
                  >
                    Enviar ticket por WhatsApp
                  </a>
                </>
              ) : null}
              {canDeleteOrders && !detailEditing ? (
                <button
                  type="button"
                  disabled={detailLoading || detailSaving}
                  className="inline-flex rounded-full border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  onClick={deleteOrder}
                >
                  Eliminar pedido
                </button>
              ) : null}
            </div>
            {printError ? <p className="mt-2 text-xs text-rose-700">{printError}</p> : null}
          </div>
        </div>
      )}
    </div>
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
  onMarkPaid: (orderId: string, paymentMethod: 'cash' | 'card_terminal' | 'transfer') => void;
}) {
  const branch = Array.isArray(order.branch) ? order.branch[0] : order.branch;
  const nextStatus = nextWorkflowStatus(order.status);
  const prevStatus = previousWorkflowStatus(order.status);
  const unpaid = order.payment_status !== 'paid';
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
                  Sin pagar
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
        {unpaid && (
          <>
            <button
              type="button"
              disabled={updatingId === order.id}
              onClick={() => onMarkPaid(order.id, 'cash')}
              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-50"
            >
              Efectivo
            </button>
            <button
              type="button"
              disabled={updatingId === order.id}
              onClick={() => onMarkPaid(order.id, 'card_terminal')}
              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-50"
            >
              TPV
            </button>
            <button
              type="button"
              disabled={updatingId === order.id}
              onClick={() => onMarkPaid(order.id, 'transfer')}
              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-50"
            >
              Transferencia
            </button>
          </>
        )}
      </div>
    </article>
  );
}
