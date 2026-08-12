import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data: branch, error } = await supabase
      .from('branches')
      .select('id, name, slug, address, pickup_instructions, delivery_fee, minimum_order_amount, whatsapp_phone, opening_hours, fulfillment_mode')
      .eq('id', tenant.branchId)
      .single();

    if (error || !branch) {
      return NextResponse.json({ error: error?.message ?? 'Sucursal no encontrada' }, { status: 400 });
    }

    return NextResponse.json({ tenant, branch, staff: auth });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar configuración' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as {
      pickupInstructions?: string | null;
      deliveryFee?: number;
      minimumOrderAmount?: number;
      address?: string | null;
      whatsappPhone?: string | null;
      openingHours?: string | null;
      fulfillmentMode?: 'pickup' | 'delivery' | 'both';
    };

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('branches')
      .update({
        pickup_instructions: body.pickupInstructions?.trim() || null,
        delivery_fee: body.deliveryFee,
        minimum_order_amount: body.minimumOrderAmount,
        address: body.address?.trim() || null,
        whatsapp_phone: body.whatsappPhone?.trim() || null,
        opening_hours: body.openingHours?.trim() || null,
        fulfillment_mode: body.fulfillmentMode ?? 'both',
      })
      .eq('id', tenant.branchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al guardar' },
      { status: 500 },
    );
  }
}
