'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';

import {
  formatMoney,
  formatProductQuantity,
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  PRODUCT_UNIT_LABELS,
  type OrderStatus,
  type ProductUnit,
} from '@puertaverde/shared';

interface OrderRow {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  fulfillment_type: 'delivery' | 'pickup';
  total: number;
  payment_status: string;
  payment_method?: string | null;
  created_at: string;
  branch: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

interface OrderItemDetail {
  id: string;
  product_name: string;
  unit: ProductUnit;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface OrderDetail extends OrderRow {
  subtotal?: number;
  delivery_fee?: number;
  delivery_notes?: string | null;
  department?: string;
  payment_method?: string | null;
  items: OrderItemDetail[];
}

const COLUMNS = ['pending', 'preparing', 'ready', 'out_for_delivery', 'delivered'] as const;

const COLUMN_META: Record<
  (typeof COLUMNS)[number],
  { accent: string; image: string; empty: string }
> = {
  pending: {
    accent: 'orange',
    image: '/orders/pending.png',
    empty: 'Sin pedidos',
  },
  preparing: {
    accent: 'blue',
    image: '/orders/preparing.png',
    empty: 'Sin pedidos',
  },
  ready: {
    accent: 'teal',
    image: '/orders/ready.png',
    empty: 'Sin pedidos',
  },
  out_for_delivery: {
    accent: 'purple',
    image: '/orders/out_for_delivery.png',
    empty: 'Sin pedidos',
  },
  delivered: {
    accent: 'green',
    image: '/orders/delivered.png',
    empty: 'Sin pedidos',
  },
};

const PAYMENT_OPTIONS = [
  { id: 'cash' as const, label: 'Efectivo' },
  { id: 'card_terminal' as const, label: 'TPV' },
  { id: 'transfer' as const, label: 'Transferencia' },
];

function previousStatus(status: OrderStatus): OrderStatus | null {
  const idx = COLUMNS.indexOf(status as (typeof COLUMNS)[number]);
  if (idx <= 0) return null;
  return COLUMNS[idx - 1];
}

function nextStatus(status: OrderStatus): OrderStatus | null {
  const idx = COLUMNS.indexOf(status as (typeof COLUMNS)[number]);
  if (idx < 0 || idx >= COLUMNS.length - 1) return null;
  return COLUMNS[idx + 1];
}

export function OrdersBoard({ initialOrders }: { initialOrders: OrderRow[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((status) => [status, [] as OrderRow[]])) as Record<
      OrderStatus,
      OrderRow[]
    >;
    for (const order of orders) {
      if (order.status === 'cancelled') continue;
      if (map[order.status]) map[order.status].push(order);
    }
    return map;
  }, [orders]);

  async function openDetail(orderId: string) {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo cargar el pedido');
      const order = payload.order as OrderDetail;
      const boardOrder = orders.find((row) => row.id === orderId);
      setDetail({
        ...order,
        branch: boardOrder?.branch ?? null,
      });
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Error al cargar');
    } finally {
      setDetailLoading(false);
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
      setDetail((current) => (current?.id === orderId ? { ...current, status } : current));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al actualizar');
    } finally {
      setUpdatingId(null);
    }
  }

  async function setPayment(
    orderId: string,
    paymentMethod: 'cash' | 'card_terminal' | 'transfer' | null,
  ) {
    setUpdatingId(orderId);
    try {
      const response = await fetch('/api/orders/payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          paymentMethod
            ? { orderId, paymentMethod }
            : { orderId, clear: true, paymentMethod: null },
        ),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo actualizar el pago');
      const nextStatus = payload.paymentStatus ?? (paymentMethod ? 'paid' : 'pending');
      const nextMethod = payload.paymentMethod ?? paymentMethod;
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? { ...order, payment_status: nextStatus, payment_method: nextMethod }
            : order,
        ),
      );
      setDetail((current) =>
        current?.id === orderId
          ? { ...current, payment_status: nextStatus, payment_method: nextMethod }
          : current,
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al actualizar el pago');
    } finally {
      setUpdatingId(null);
    }
  }

  function togglePayment(
    orderId: string,
    currentMethod: string | null | undefined,
    nextMethod: 'cash' | 'card_terminal' | 'transfer',
  ) {
    // Clicking the selected method again clears it; otherwise set/change it.
    void setPayment(orderId, currentMethod === nextMethod ? null : nextMethod);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-2.5">
        {COLUMNS.map((status) => {
          const meta = COLUMN_META[status];
          const columnOrders = grouped[status] ?? [];

          return (
            <section
              key={status}
              className={`pv-glass-card pv-glass-card-accent pv-glass-card-accent-${meta.accent} min-w-0 overflow-hidden p-3`}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <Image
                  src={meta.image}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0">
                  <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {ORDER_STATUS_LABELS[status]}
                  </h2>
                  <p className="truncate text-[11px] text-slate-400">
                    {columnOrders.length === 0
                      ? meta.empty
                      : `${columnOrders.length} pedido${columnOrders.length === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {columnOrders.map((order) => {
                  const branch = Array.isArray(order.branch) ? order.branch[0] : order.branch;
                  const forward = nextStatus(status);
                  const back = previousStatus(status);

                  return (
                    <article key={order.id} className="pv-glass-item rounded-xl p-3">
                      <button
                        type="button"
                        onClick={() => void openDetail(order.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">#{order.order_number}</p>
                            <p className="text-sm text-slate-600">{order.customer_name}</p>
                            <p className="text-xs text-slate-500">{order.customer_phone}</p>
                          </div>
                          <span className="text-sm font-medium">{formatMoney(Number(order.total))}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {branch?.name} · {FULFILLMENT_LABELS[order.fulfillment_type]}
                        </p>
                        <p className="mt-1 text-xs font-medium text-[var(--pv-green-700)]">
                          Ver productos →
                        </p>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {back ? (
                          <button
                            type="button"
                            disabled={updatingId === order.id}
                            onClick={() => updateStatus(order.id, back)}
                            className="pv-btn-ghost px-3 py-1 text-xs disabled:opacity-50"
                          >
                            ← Regresar
                          </button>
                        ) : null}
                        {forward ? (
                          <button
                            type="button"
                            disabled={updatingId === order.id}
                            onClick={() => updateStatus(order.id, forward)}
                            className="pv-btn-primary px-3 py-1 text-xs disabled:opacity-50"
                          >
                            → {ORDER_STATUS_LABELS[forward]}
                          </button>
                        ) : null}
                        {PAYMENT_OPTIONS.map((option) => {
                          const selected =
                            order.payment_status === 'paid' && order.payment_method === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              disabled={updatingId === order.id}
                              onClick={() => togglePayment(order.id, order.payment_method, option.id)}
                              className={`px-3 py-1 text-xs disabled:opacity-50 ${
                                selected ? 'pv-btn-primary' : 'pv-btn-ghost'
                              }`}
                              title={
                                selected
                                  ? 'Clic de nuevo para quitar el pago'
                                  : `Marcar como pagado con ${option.label}`
                              }
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {(detailLoading || detail || detailError) && (
        <div className="pv-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="pv-glass-panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {detail ? `Pedido #${detail.order_number}` : 'Pedido'}
                </h3>
                {detail ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {ORDER_STATUS_LABELS[detail.status]} · {FULFILLMENT_LABELS[detail.fulfillment_type]}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setDetailError(null);
                  setDetailLoading(false);
                }}
                className="text-slate-500 hover:text-slate-800"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <p className="mt-6 text-sm text-slate-500">Cargando productos…</p>
            ) : null}
            {detailError ? <p className="mt-6 text-sm text-red-600">{detailError}</p> : null}

            {detail ? (
              <div className="mt-5 space-y-5">
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-900">{detail.customer_name}</p>
                  <p className="text-slate-600">{detail.customer_phone}</p>
                  {detail.department ? (
                    <p className="mt-1 text-slate-600">Depto: {detail.department}</p>
                  ) : null}
                  {detail.delivery_notes ? (
                    <p className="mt-1 text-slate-500">Notas: {detail.delivery_notes}</p>
                  ) : null}
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Productos</h4>
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {detail.items.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                        <div>
                          <p className="font-medium text-slate-900">{item.product_name}</p>
                          <p className="text-xs text-slate-500">
                            {formatProductQuantity(Number(item.quantity), item.unit)} ·{' '}
                            {formatMoney(Number(item.unit_price))} / {PRODUCT_UNIT_LABELS[item.unit]}
                          </p>
                        </div>
                        <span className="font-medium tabular-nums">
                          {formatMoney(Number(item.line_total))}
                        </span>
                      </li>
                    ))}
                    {detail.items.length === 0 ? (
                      <li className="px-3 py-4 text-center text-sm text-slate-500">
                        Sin productos registrados.
                      </li>
                    ) : null}
                  </ul>
                </div>

                <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
                  {detail.subtotal != null ? (
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span>{formatMoney(Number(detail.subtotal))}</span>
                    </div>
                  ) : null}
                  {detail.delivery_fee != null && Number(detail.delivery_fee) > 0 ? (
                    <div className="flex justify-between text-slate-600">
                      <span>Envío</span>
                      <span>{formatMoney(Number(detail.delivery_fee))}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-base font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{formatMoney(Number(detail.total))}</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Forma de pago</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    {detail.payment_status === 'paid'
                      ? 'Seleccionado resaltado. Clic de nuevo para desmarcar o elige otra opción.'
                      : 'Elige cómo se pagó. Puedes cambiarlo o desmarcarlo después.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PAYMENT_OPTIONS.map((option) => {
                      const selected =
                        detail.payment_status === 'paid' && detail.payment_method === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={updatingId === detail.id}
                          onClick={() =>
                            togglePayment(detail.id, detail.payment_method, option.id)
                          }
                          className={`px-4 py-2 text-sm disabled:opacity-50 ${
                            selected ? 'pv-btn-primary' : 'pv-btn-ghost'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {previousStatus(detail.status) ? (
                    <button
                      type="button"
                      disabled={updatingId === detail.id}
                      onClick={() => updateStatus(detail.id, previousStatus(detail.status)!)}
                      className="pv-btn-ghost px-4 py-2 text-sm disabled:opacity-50"
                    >
                      ← Regresar a {ORDER_STATUS_LABELS[previousStatus(detail.status)!]}
                    </button>
                  ) : null}
                  {nextStatus(detail.status) ? (
                    <button
                      type="button"
                      disabled={updatingId === detail.id}
                      onClick={() => updateStatus(detail.id, nextStatus(detail.status)!)}
                      className="pv-btn-primary px-4 py-2 text-sm disabled:opacity-50"
                    >
                      → {ORDER_STATUS_LABELS[nextStatus(detail.status)!]}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
