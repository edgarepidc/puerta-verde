import { NextResponse } from 'next/server';

import { normalizeStorefrontSlug, storefrontInputError } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function PUT(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'branch.settings',
    'No tienes permiso para editar la tienda',
  );
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      markupPercent?: number;
      isActive?: boolean;
      pickupInstructions?: string | null;
      fulfillmentMode?: 'pickup' | 'delivery' | 'both';
      deliveryFee?: number;
      minimumOrderAmount?: number;
      whatsappPhone?: string | null;
      openingHours?: string | null;
    };
    const name = body.name?.trim() ?? '';
    const slug = normalizeStorefrontSlug(body.slug ?? '');
    const markupPercent = Number(body.markupPercent);
    const isActive = body.isActive !== false;
    const fulfillmentMode = body.fulfillmentMode ?? 'both';
    const deliveryFee = Number(body.deliveryFee);
    const minimumOrderAmount = Number(body.minimumOrderAmount);
    if (!['pickup', 'delivery', 'both'].includes(fulfillmentMode)) {
      return NextResponse.json({ error: 'Elige cómo se recibe el pedido.' }, { status: 400 });
    }
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || !Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) {
      return NextResponse.json({ error: 'El envío y el mínimo tienen que ser cero o más.' }, { status: 400 });
    }
    const validation = storefrontInputError({ name, slug, markupPercent });
    if (validation) {
      return NextResponse.json({ error: validation }, { status: 400 });
    }

    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    const { data: branchHit } = await supabase
      .from('branches')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (branchHit) {
      return NextResponse.json(
        { error: 'Esa liga ya es de una tienda. Elige otra.' },
        { status: 409 },
      );
    }

    const { data: slugHit } = await supabase
      .from('storefronts')
      .select('id, branch_id')
      .eq('slug', slug)
      .maybeSingle();
    if (slugHit && slugHit.branch_id !== tenant.branchId) {
      return NextResponse.json({ error: 'Esa liga ya está en uso. Elige otra.' }, { status: 409 });
    }

    const row = {
      name,
      slug,
      markup_percent: markupPercent,
      is_active: isActive,
      pickup_instructions: body.pickupInstructions?.trim() || null,
      fulfillment_mode: fulfillmentMode,
      delivery_fee: deliveryFee,
      minimum_order_amount: minimumOrderAmount,
      whatsapp_phone: body.whatsappPhone?.trim() || null,
      opening_hours: body.openingHours?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('storefronts')
      .select('id')
      .eq('branch_id', tenant.branchId)
      .maybeSingle();

    const { data, error } = existing
      ? await supabase
          .from('storefronts')
          .update(row)
          .eq('id', existing.id)
          .select(
            'id, name, slug, markup_percent, is_active, pickup_instructions, fulfillment_mode, delivery_fee, minimum_order_amount, whatsapp_phone, opening_hours',
          )
          .single()
      : await supabase
          .from('storefronts')
          .insert({ ...row, branch_id: tenant.branchId })
          .select(
            'id, name, slug, markup_percent, is_active, pickup_instructions, fulfillment_mode, delivery_fee, minimum_order_amount, whatsapp_phone, opening_hours',
          )
          .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 400 });
    }

    return NextResponse.json({ storefront: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al guardar' },
      { status: 500 },
    );
  }
}
