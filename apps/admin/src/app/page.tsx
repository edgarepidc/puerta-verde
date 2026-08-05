import { AdminShell } from '@/components/AdminShell';
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
    <AdminShell title="Panel de pedidos" subtitle="Operación del día">
      <OrdersBoard initialOrders={ordersWithBranch} />
    </AdminShell>
  );
}
