import { NextResponse } from 'next/server';

import { createAdminClient } from '@puertaverde/supabase/admin';
import type { Json } from '@puertaverde/supabase';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { mergeBranchSettings, parseBranchSettingsFlags } from '@/lib/branch-settings';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data: branch, error } = await supabase
      .from('branches')
      .select(
        'id, name, slug, address, pickup_instructions, delivery_fee, minimum_order_amount, whatsapp_phone, opening_hours, fulfillment_mode, settings',
      )
      .eq('id', tenant.branchId)
      .single();

    if (error || !branch) {
      return NextResponse.json({ error: error?.message ?? 'Sucursal no encontrada' }, { status: 400 });
    }

    const flags = parseBranchSettingsFlags(branch.settings);
    return NextResponse.json({
      tenant,
      branch: { ...branch, usb_scale_enabled: flags.usbScaleEnabled },
      staff: auth,
    });
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

  const denied = await requireStaffPermission(
    auth,
    'branch.settings',
    'No tienes permiso para editar la sucursal',
  );
  if (denied) return denied;

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
      usbScaleEnabled?: boolean;
    };

    const supabase = createAdminClient();

    const { data: current } = await supabase
      .from('branches')
      .select('settings')
      .eq('id', tenant.branchId)
      .maybeSingle();

    const nextSettings =
      body.usbScaleEnabled !== undefined
        ? mergeBranchSettings(current?.settings, { usbScaleEnabled: body.usbScaleEnabled })
        : undefined;

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
        ...(nextSettings ? { settings: nextSettings as Json } : {}),
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
