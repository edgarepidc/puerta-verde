import Link from 'next/link';

import { BrandLogo } from '@/components/BrandLogo';
import { createServerClient } from '@puertaverde/supabase/client';
import {
  formatMoney,
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  PRODUCT_UNIT_LABELS,
  type OrderStatus,
  type ProductUnit,
} from '@puertaverde/shared';

export const dynamic = 'force-dynamic';

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServerClient();

  const { data: orderRows } = await supabase.rpc('get_order_by_tracking_token', {
    p_token: token,
  });
  const order = orderRows?.[0];

  if (!order) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">Pedido no encontrado</h1>
      </main>
    );
  }

  const items = (order.items as Array<{
    product_name: string;
    quantity: number;
    unit: string;
    line_total: number;
  }>) ?? [];

  return (
    <>
      <div className="pv-ambient" aria-hidden />
      <main className="relative mx-auto max-w-xl px-6 py-12">
        <div className="mb-6 flex justify-center">
          <BrandLogo href="/" imageClassName="h-12 w-auto" />
        </div>
        <div className="pv-glass-panel p-6">
        <p className="text-sm font-medium text-[var(--pv-green-600)]">{order.branch_name}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--pv-green-900)]">
          Pedido #{order.order_number}
        </h1>
        <p className="mt-2 text-[var(--pv-green-800)]">
          Hola {order.customer_name}, tu pedido está{' '}
          <strong>{ORDER_STATUS_LABELS[order.status as OrderStatus]}</strong>.
        </p>
        <p className="mt-1 text-sm text-[var(--pv-green-800)]">
          {FULFILLMENT_LABELS[order.fulfillment_type as keyof typeof FULFILLMENT_LABELS]}
        </p>

        <ul className="mt-6 space-y-2 border-t border-green-100 pt-4 text-sm">
          {items.map((item: {
            product_name: string;
            quantity: number;
            unit: string;
            line_total: number;
          }) => (
            <li key={`${item.product_name}-${item.quantity}`} className="flex justify-between gap-3">
              <span>
                {item.product_name} × {item.quantity}{' '}
                {PRODUCT_UNIT_LABELS[item.unit as ProductUnit]}
              </span>
              <span>{formatMoney(Number(item.line_total))}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-between border-t border-green-100 pt-4 font-semibold">
          <span>Total</span>
          <span>{formatMoney(Number(order.total))}</span>
        </div>

        <p className="pv-callout mt-4 p-3 text-sm">
          Pago al {order.fulfillment_type === 'delivery' ? 'entregar' : 'recoger'} con efectivo o TPV.
          Estado de pago: {order.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}.
        </p>

        <Link href="/" className="mt-6 inline-block text-sm font-medium text-[var(--pv-green-700)]">
          ← Volver al inicio
        </Link>
      </div>
    </main>
    </>
  );
}
