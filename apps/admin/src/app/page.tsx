import { AdminShell } from '@/components/AdminShell';
import { OrdersBoard } from '@/components/OrdersBoard';
import { getStaffSession } from '@/lib/auth';
import { createAdminClient } from '@puertaverde/supabase/admin';
import type { ProductUnit } from '@puertaverde/shared';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const supabase = createAdminClient();

  const [{ data: orders }, { data: products }] = await Promise.all([
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
        payment_method,
        created_at
      `)
      .eq('branch_id', staff.branchId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('branch_products')
      .select('id, price, stock, min_stock, product:products ( id, name, unit, sku, image_url )')
      .eq('branch_id', staff.branchId)
      .eq('is_available', true)
      .order('created_at', { ascending: true }),
  ]);

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
      <OrdersBoard
        initialOrders={ordersWithBranch}
        products={(products ?? []) as Array<{
          id: string;
          price: number;
          stock: number;
          min_stock?: number | null;
          product: { id: string; name: string; unit: ProductUnit; sku?: string | null; image_url?: string | null };
        }>}
      />
    </AdminShell>
  );
}
