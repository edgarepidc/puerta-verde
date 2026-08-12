import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, phone, full_name, whatsapp_opt_in, created_at, updated_at')
      .eq('organization_id', auth.organizationId)
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const phones = (customers ?? []).map((c) => c.phone);
    const { data: orders } = phones.length
      ? await supabase
          .from('orders')
          .select('id, customer_phone, total, created_at, status')
          .eq('organization_id', auth.organizationId)
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

    return NextResponse.json({ customers: enriched });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar clientes' },
      { status: 500 },
    );
  }
}
