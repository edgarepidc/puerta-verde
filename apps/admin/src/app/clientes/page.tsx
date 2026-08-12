import { AdminShell } from '@/components/AdminShell';
import { CustomersManager } from '@/components/CustomersManager';
import { getStaffSession } from '@/lib/auth';
import { createAdminClient } from '@puertaverde/supabase/admin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const staff = await getStaffSession();
  if (!staff) redirect('/login');

  const supabase = createAdminClient();
  const { data: customers } = await supabase
    .from('customers')
    .select('id, phone, full_name, whatsapp_opt_in, created_at, updated_at')
    .eq('organization_id', staff.organizationId)
    .order('updated_at', { ascending: false })
    .limit(200);

  const phones = (customers ?? []).map((c) => c.phone);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: orders } = phones.length
    ? await supabase
        .from('orders')
        .select('id, customer_phone, total, created_at')
        .eq('organization_id', staff.organizationId)
        .in('customer_phone', phones)
        .order('created_at', { ascending: false })
        .limit(1000)
    : { data: [] };

  const statsByPhone = new Map<
    string,
    { orderCount: number; totalSpent: number; lastOrderAt: string | null }
  >();

  for (const order of orders ?? []) {
    const current = statsByPhone.get(order.customer_phone) ?? {
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
    };
    current.orderCount += 1;
    current.totalSpent += Number(order.total);
    if (!current.lastOrderAt || order.created_at > current.lastOrderAt) {
      current.lastOrderAt = order.created_at;
    }
    statsByPhone.set(order.customer_phone, current);
  }

  const enriched = (customers ?? []).map((customer) => {
    const stats = statsByPhone.get(customer.phone);
    return {
      ...customer,
      order_count: stats?.orderCount ?? 0,
      total_spent: Number((stats?.totalSpent ?? 0).toFixed(2)),
      last_order_at: stats?.lastOrderAt ?? null,
    };
  });

  const weekStats = new Map<string, { orderCount: number; totalSpent: number }>();
  for (const order of orders ?? []) {
    if (new Date(order.created_at) < weekAgo) continue;
    const current = weekStats.get(order.customer_phone) ?? { orderCount: 0, totalSpent: 0 };
    current.orderCount += 1;
    current.totalSpent += Number(order.total);
    weekStats.set(order.customer_phone, current);
  }

  const frequentCustomers = enriched
    .map((customer) => {
      const stats = weekStats.get(customer.phone);
      if (!stats) return null;
      return {
        ...customer,
        order_count: stats.orderCount,
        total_spent: Number(stats.totalSpent.toFixed(2)),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.order_count - a.order_count || b.total_spent - a.total_spent)
    .slice(0, 10);

  return (
    <AdminShell title="Clientes" subtitle={`CRM ligero · ${staff.branchName}`}>
      <CustomersManager initialCustomers={enriched} frequentCustomers={frequentCustomers} />
    </AdminShell>
  );
}
