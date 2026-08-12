'use client';

import { useMemo, useState } from 'react';

import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  PAYMENT_METHOD_LABELS,
  PRODUCT_UNIT_LABELS,
  formatMoney,
  type OrderStatus,
  type PaymentMethod,
  type ProductUnit,
} from '@puertaverde/shared';

import { CounterSalePanel, type CounterProduct } from '@/components/CounterSalePanel';
import { LowStockBanner } from '@/components/LowStockBanner';

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

interface OrderItem {
  id: string;
  product_name: string;
  unit: ProductUnit | string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

const COLUMNS: OrderStatus[] = ['pending', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

export function OrdersBoard({
  initialOrders,
  products,
}: {
  initialOrders: OrderRow[];
  products: CounterProduct[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailNotes, setDetailNotes] = useState<string | null>(null);

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

  const selected = orders.find((order) => order.id === detailId) ?? null;

  async function openDetail(orderId: string) {
    setDetailId(orderId);
    setDetailLoading(true);
    setDetailNotes(null);
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Error al cargar');
      setDetailItems(payload.items ?? []);
      setDetailNotes(payload.order?.delivery_notes ?? null);
    } catch {
      setDetailItems([]);
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
      <LowStockBanner products={products} href="/compras" />
      <CounterSalePanel
        products={products}
        onCreated={(order) => {
          setOrders((current) => [
            {
              ...order,
              status: order.status as OrderStatus,
              fulfillment_type: order.fulfillment_type,
              branch: current[0]?.branch ?? { name: 'Sucursal', slug: '' },
            },
            ...current,
          ]);
        }}
      />

      <div className="grid gap-4 overflow-x-auto lg:grid-cols-5">
        {COLUMNS.map((status) => (
          <section key={status} className="pv-glass-card min-w-[240px] p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {ORDER_STATUS_LABELS[status]}
            </h2>
            <div className="space-y-3">
              {(grouped[status] ?? []).map((order) => {
                const branch = Array.isArray(order.branch) ? order.branch[0] : order.branch;
                const nextStatus = ORDER_STATUSES[ORDER_STATUSES.indexOf(status) + 1] as
                  | OrderStatus
                  | undefined;

                return (
                  <article key={order.id} className="pv-glass-item rounded-xl p-3">
                    <button type="button" className="w-full text-left" onClick={() => openDetail(order.id)}>
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
                        {order.payment_status === 'paid' ? ' · Pagado' : ''}
                      </p>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {nextStatus && nextStatus !== 'cancelled' && (
                        <button
                          type="button"
                          disabled={updatingId === order.id}
                          onClick={() => updateStatus(order.id, nextStatus)}
                          className="pv-btn-primary px-3 py-1 text-xs disabled:opacity-50"
                        >
                          → {ORDER_STATUS_LABELS[nextStatus]}
                        </button>
                      )}
                      {order.payment_status !== 'paid' && (
                        <>
                          <button
                            type="button"
                            disabled={updatingId === order.id}
                            onClick={() => markPaid(order.id, 'cash')}
                            className="pv-btn-ghost px-3 py-1 text-xs"
                          >
                            Efectivo
                          </button>
                          <button
                            type="button"
                            disabled={updatingId === order.id}
                            onClick={() => markPaid(order.id, 'card_terminal')}
                            className="pv-btn-ghost px-3 py-1 text-xs"
                          >
                            TPV
                          </button>
                          <button
                            type="button"
                            disabled={updatingId === order.id}
                            onClick={() => markPaid(order.id, 'transfer')}
                            className="pv-btn-ghost px-3 py-1 text-xs"
                          >
                            Transferencia
                          </button>
                        </>
                      )}
                      <a
                        href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="pv-btn-ghost px-3 py-1 text-xs"
                      >
                        WhatsApp
                      </a>
                    </div>
                  </article>
                );
              })}
              {(grouped[status] ?? []).length === 0 && (
                <p className="text-sm text-slate-400">Sin pedidos</p>
              )}
            </div>
          </section>
        ))}
      </div>

      {detailId && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Pedido #{selected.order_number}</h2>
                <p className="text-sm text-slate-500">
                  {selected.customer_name} · {selected.customer_phone}
                </p>
              </div>
              <button type="button" className="text-sm text-slate-500" onClick={() => setDetailId(null)}>
                Cerrar
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {ORDER_STATUS_LABELS[selected.status]} · {FULFILLMENT_LABELS[selected.fulfillment_type]} ·{' '}
              {selected.payment_status === 'paid'
                ? `Pagado (${PAYMENT_METHOD_LABELS[(selected.payment_method as PaymentMethod) ?? 'cash'] ?? selected.payment_method})`
                : 'Pendiente de pago'}
            </p>
            {detailNotes && detailNotes !== '[mostrador]' && (
              <p className="mt-2 text-sm text-slate-500">Notas: {detailNotes.replace(/^\[mostrador\]\s*/, '')}</p>
            )}
            <div className="mt-4 space-y-2">
              {detailLoading && <p className="text-sm text-slate-500">Cargando productos…</p>}
              {!detailLoading &&
                detailItems.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3 text-sm">
                    <span>
                      {item.product_name} × {Number(item.quantity)}{' '}
                      {PRODUCT_UNIT_LABELS[item.unit as ProductUnit] ?? item.unit}
                    </span>
                    <span>{formatMoney(Number(item.line_total))}</span>
                  </div>
                ))}
              {!detailLoading && detailItems.length === 0 && (
                <p className="text-sm text-slate-500">Sin partidas.</p>
              )}
            </div>
            <p className="mt-4 text-right text-base font-semibold">{formatMoney(Number(selected.total))}</p>
          </div>
        </div>
      )}
    </div>
  );
}
