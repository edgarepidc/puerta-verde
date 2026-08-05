import Link from 'next/link';

import { BRAND_NAME } from '@puertaverde/shared';

import { OrdersBoard } from '@/components/OrdersBoard';
import { createAdminClient } from '@puertaverde/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const supabase = createAdminClient();

  const [{ data: orders }, { data: branches }] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id,
        branch_id,
        order_number,
        customer_name,
        customer_phone,
        status,
        fulfillment_type,
        total,
        payment_status,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('branches').select('id, name, slug'),
  ]);

  const branchMap = new Map((branches ?? []).map((branch) => [branch.id, branch]));
  const ordersWithBranch = (orders ?? []).map((order) => ({
    ...order,
    branch: branchMap.get(order.branch_id) ?? null,
  }));

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-[var(--pv-green-600)]">{BRAND_NAME}</p>
            <h1 className="text-2xl font-bold text-slate-900">Panel de pedidos</h1>
          </div>
          <Link
            href="http://localhost:3001/puerta-verde-demo"
            className="rounded-full border border-green-200 px-4 py-2 text-sm font-medium text-[var(--pv-green-800)]"
          >
            Ver tienda pública
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <OrdersBoard initialOrders={ordersWithBranch} />
      </div>
    </main>
  );
}
