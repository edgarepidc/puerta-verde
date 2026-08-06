import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';
import { createServerClient } from '@puertaverde/supabase/client';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phone?: string; branchSlug?: string };
    const phone = body.phone?.trim() ?? '';
    const branchSlug = body.branchSlug?.trim() ?? '';
    if (!phone || phone.replace(/\D/g, '').length < 8) {
      return NextResponse.json({ error: 'Ingresa un teléfono válido' }, { status: 400 });
    }
    if (!branchSlug) {
      return NextResponse.json({ error: 'Sucursal requerida' }, { status: 400 });
    }

    const publicClient = createServerClient();
    const { data: branchRows } = await publicClient.rpc('get_public_branch', {
      target_slug: branchSlug,
    });
    const branch = branchRows?.[0];
    if (!branch) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('get_orders_by_customer_phone', {
      p_organization_id: branch.organization_id,
      p_phone: phone,
      p_limit: 8,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      orders: (data ?? []).map((order) => ({
        orderNumber: order.order_number,
        status: order.status,
        total: order.total,
        trackingToken: order.tracking_token,
        createdAt: order.created_at,
        branchName: order.branch_name,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al buscar' },
      { status: 500 },
    );
  }
}
