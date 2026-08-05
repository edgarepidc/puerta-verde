'use client';

import { useMemo, useState } from 'react';

import {
  formatMoney,
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type OrderStatus,
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
  created_at: string;
  branch: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

const COLUMNS: OrderStatus[] = ['pending', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

export function OrdersBoard({ initialOrders }: { initialOrders: OrderRow[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  async function markPaid(orderId: string, paymentMethod: 'cash' | 'card_terminal') {
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
          order.id === orderId ? { ...order, payment_status: 'paid' } : order,
        ),
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al registrar pago');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="grid gap-4 overflow-x-auto lg:grid-cols-5">
      {COLUMNS.map((status) => (
        <section key={status} className="min-w-[240px] rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
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
                <article key={order.id} className="rounded-xl border border-slate-200 p-3">
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    {nextStatus && nextStatus !== 'cancelled' && (
                      <button
                        type="button"
                        disabled={updatingId === order.id}
                        onClick={() => updateStatus(order.id, nextStatus)}
                        className="rounded-full bg-[var(--pv-green-600)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
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
                          className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                        >
                          Efectivo
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === order.id}
                          onClick={() => markPaid(order.id, 'card_terminal')}
                          className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                        >
                          TPV
                        </button>
                      </>
                    )}
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
  );
}
