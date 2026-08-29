import { NextResponse } from 'next/server';

import {
  normalizeCouponCode,
  validateCouponInput,
  type CouponInput,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function GET() {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('coupons')
      .select(
        'id, code, description, discount_type, discount_value, starts_at, ends_at, is_active, max_uses, times_used, min_order_amount, created_at',
      )
      .eq('branch_id', tenant.branchId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ coupons: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar cupones' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'coupons.manage',
    'No tienes permiso para gestionar cupones',
  );
  if (denied) return denied;

  try {
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as CouponInput;
    const validationError = validateCouponInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('coupons')
      .insert({
        branch_id: tenant.branchId,
        code: normalizeCouponCode(body.code),
        description: body.description?.trim() || null,
        discount_type: body.discountType,
        discount_value: body.discountValue,
        starts_at: body.startsAt || null,
        ends_at: body.endsAt || null,
        is_active: body.isActive,
        max_uses: body.maxUses ?? null,
        min_order_amount: body.minOrderAmount ?? null,
      })
      .select(
        'id, code, description, discount_type, discount_value, starts_at, ends_at, is_active, max_uses, times_used, min_order_amount, created_at',
      )
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'No se pudo crear el cupón' },
        { status: 400 },
      );
    }

    return NextResponse.json({ coupon: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear cupón' },
      { status: 500 },
    );
  }
}
