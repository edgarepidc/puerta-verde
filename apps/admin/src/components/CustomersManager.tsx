'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { formatDecimal, formatMoney, isUnpaidOrder } from '@puertaverde/shared';

import { ActionChip, FoldableSummary } from '@/components/ActionChip';

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

export function CustomersManager({
  initialCustomers,
  frequentCustomers = [],
}: {
  initialCustomers: CustomerRow[];
  frequentCustomers?: CustomerRow[];
}) {
  const [customers] = useState(initialCustomers);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFrecuentes, setOpenFrecuentes] = useState(true);
  const [openClientes, setOpenClientes] = useState(true);

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
    <div className="space-y-6">
      {frequentCustomers.length > 0 ? (
        <details
          className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
          open={openFrecuentes}
          onToggle={(event) => setOpenFrecuentes(event.currentTarget.open)}
        >
          <FoldableSummary
            title="Frecuentes esta semana"
            hint="Top 10 por pedidos en los últimos 7 días"
            emoji="⭐"
            iconClass="bg-amber-100"
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {frequentCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="rounded-xl border border-slate-200/80 bg-white/60 p-3 text-left hover:bg-emerald-50"
                onClick={() => void openDetail(customer.id)}
              >
                <p className="truncate text-sm font-medium text-slate-900">
                  {customer.full_name || 'Sin nombre'}
                </p>
                <p className="text-xs text-slate-500">{formatPhone(customer.phone)}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {customer.order_count} pedidos · {formatMoney(customer.total_spent)}
                </p>
              </button>
            ))}
          </div>
        </details>
      ) : null}

    <details
      className="group pv-glass-card min-w-0 space-y-4 overflow-hidden p-4 sm:p-6"
      open={openClientes}
      onToggle={(event) => setOpenClientes(event.currentTarget.open)}
    >
      <FoldableSummary
        title="Clientes"
        hint={`${customers.length} registrados por celular`}
        emoji="🧑"
        iconClass="bg-sky-100"
        actions={
          <input
            type="search"
            className="h-9 w-36 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 sm:w-52"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar nombre o celular"
          />
        }
      />

    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="min-w-0 overflow-x-auto">
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
      </section>

      <section className="min-w-0">
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
              <a
                href={`https://wa.me/${detail.customer.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex"
              >
                <ActionChip as="span" emoji="💬" tone="emerald">
                  WhatsApp
                </ActionChip>
              </a>
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
                        {formatDecimal(Number(product.quantity))} · {formatMoney(product.revenue)}
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
                      {isUnpaidOrder(order) ? ' · por pagar' : order.payment_status === 'paid' ? ' · pagado' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <Link href="/" className="inline-flex">
              <ActionChip as="span" emoji="🧾">
                Ir a pedidos
              </ActionChip>
            </Link>
          </div>
        )}
      </section>
    </div>
    </details>
    </div>
  );
}
