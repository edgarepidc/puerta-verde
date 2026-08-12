import { NextResponse } from 'next/server';

import { normalizePhone, isValidMexicanPhone } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const rawPhone = searchParams.get('phone') ?? '';
    if (!isValidMexicanPhone(rawPhone)) {
      return NextResponse.json({ customer: null });
    }

    const phone = normalizePhone(rawPhone);
    const supabase = createAdminClient();

    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, phone, full_name, default_unit_id, whatsapp_opt_in, created_at')
      .eq('organization_id', auth.organizationId)
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!customer) {
      return NextResponse.json({ customer: null });
    }

    const { data: recentOrders } = await supabase
      .from('orders')
      .select('id, order_number, total, status, created_at')
      .eq('organization_id', auth.organizationId)
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      customer,
      recentOrders: recentOrders ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al buscar cliente' },
      { status: 500 },
    );
  }
}
