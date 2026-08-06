import { AdminShell } from '@/components/AdminShell';
import { OrdersBoard } from '@/components/OrdersBoard';
import { getStaffSession } from '@/lib/auth';
import { createAdminClient } from '@puertaverde/supabase/admin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const supabase = createAdminClient();

  const { data: orders } = await supabase
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
      payment_method,
      created_at
    `)
    .eq('branch_id', staff.branchId)
    .order('created_at', { ascending: false })
    .limit(50);

  const branch = {
    id: staff.branchId,
    name: staff.branchName,
    slug: staff.branchSlug,
  };

  const ordersWithBranch = (orders ?? []).map((order) => ({
    ...order,
    branch,
  }));

  return (
    <AdminShell title="Panel de pedidos" subtitle={`${staff.branchName} · Operación del día`}>
      <OrdersBoard initialOrders={ordersWithBranch} />
    </AdminShell>
  );
}
