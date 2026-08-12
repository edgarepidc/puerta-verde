'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { formatMoney } from '@puertaverde/shared';

interface CustomerRow {
  id: string;
  phone: string;
  full_name: string | null;
  whatsapp_opt_in: boolean;
  created_at: string;
  updated_at: string;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
}

interface DetailPayload {
  customer: {
    id: string;
    phone: string;
    full_name: string | null;
    whatsapp_opt_in: boolean;
    created_at: string;
  };
  orders: Array<{
    id: string;
    order_number: number;
    status: string;
    total: number;
    payment_status: string;
    created_at: string;
    items: Array<{
      id: string;
      quantity: number;
      product_name: string;
      line_total?: number;
    }> | null;
  }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  stats: { orderCount: number; totalSpent: number };
}

function formatPhone(phone: string) {
  if (phone.startsWith('52') && phone.length === 12) {
    return phone.slice(2);
  }
  return phone;
}

export function CustomersManager({ initialCustomers }: { initialCustomers: CustomerRow[] }) {
  const [customers] = useState(initialCustomers);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((customer) => {
      const name = (customer.full_name ?? '').toLowerCase();
      const phone = customer.phone.toLowerCase();
      return name.includes(q) || phone.includes(q) || formatPhone(customer.phone).includes(q);
    });
  }, [customers, query]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setLoadingDetail(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Error al cargar');
      setDetail(payload);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="pv-glass-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Clientes</h2>
            <p className="text-sm text-slate-500">{customers.length} registrados por celular</p>
          </div>
          <label className="block text-sm">
            <span className="sr-only">Buscar</span>
            <input
              className="pv-input w-56"
              placeholder="Buscar nombre o celular"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-2 font-medium">Cliente</th>
                <th className="pb-2 font-medium">Pedidos</th>
                <th className="pb-2 font-medium">Gastado</th>
                <th className="pb-2 font-medium">Último</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr
                  key={customer.id}
                  className={`cursor-pointer border-t border-slate-100 ${
                    selectedId === customer.id ? 'bg-emerald-50/70' : 'hover:bg-slate-50/80'
                  }`}
                  onClick={() => openDetail(customer.id)}
                >
                  <td className="py-2.5">
                    <p className="font-medium text-slate-900">
                      {customer.full_name || 'Sin nombre'}
                    </p>
                    <p className="text-xs text-slate-500">{formatPhone(customer.phone)}</p>
                  </td>
                  <td className="py-2.5 text-slate-700">{customer.order_count}</td>
                  <td className="py-2.5 text-slate-700">{formatMoney(customer.total_spent)}</td>
                  <td className="py-2.5 text-slate-500">
                    {customer.last_order_at
                      ? new Date(customer.last_order_at).toLocaleDateString('es-MX')
                      : '—'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-slate-500">
                    No hay clientes que coincidan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pv-glass-card p-6">
        {!selectedId && (
          <p className="text-sm text-slate-500">
            Selecciona un cliente para ver su historial y qué suele comprar.
          </p>
        )}
        {loadingDetail && <p className="text-sm text-slate-500">Cargando…</p>}
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {detail && !loadingDetail && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {detail.customer.full_name || 'Sin nombre'}
              </h2>
              <p className="text-sm text-slate-500">{formatPhone(detail.customer.phone)}</p>
              <p className="mt-2 text-sm text-slate-600">
                {detail.stats.orderCount} pedidos · {formatMoney(detail.stats.totalSpent)}
              </p>
            </div>

            <div>
              <h3 className="font-medium text-slate-800">Suele pedir</h3>
              {detail.topProducts.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Sin compras aún.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {detail.topProducts.map((product) => (
                    <li key={product.name} className="flex justify-between gap-3">
                      <span>{product.name}</span>
                      <span className="text-slate-500">
                        {Number(product.quantity).toFixed(2)} · {formatMoney(product.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="font-medium text-slate-800">Historial</h3>
              <ul className="mt-2 space-y-2">
                {detail.orders.map((order) => (
                  <li
                    key={order.id}
                    className="rounded-xl border border-slate-200/80 bg-white/50 px-3 py-2 text-sm"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-slate-900">#{order.order_number}</span>
                      <span>{formatMoney(Number(order.total))}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {new Date(order.created_at).toLocaleString('es-MX')} · {order.status}
                      {order.payment_status === 'paid' ? ' · pagado' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <Link href="/" className="inline-block text-sm text-emerald-800 underline">
              Ir a pedidos
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
