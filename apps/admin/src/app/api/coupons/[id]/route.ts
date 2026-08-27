import { NextResponse } from 'next/server';

import {
  normalizeCouponCode,
  validateCouponInput,
  type CouponInput,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { requireStaffApi, requireStaffPermission } from '@/lib/auth';
import { getDefaultTenant } from '@/lib/tenant';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'coupons.manage',
    'No tienes permiso para gestionar cupones',
  );
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const tenant = await getDefaultTenant();
    const body = (await request.json()) as CouponInput;
    const validationError = validateCouponInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('coupons')
      .update({
        code: normalizeCouponCode(body.code),
        description: body.description?.trim() || null,
        discount_type: body.discountType,
        discount_value: body.discountValue,
        starts_at: body.startsAt || null,
        ends_at: body.endsAt || null,
        is_active: body.isActive,
        max_uses: body.maxUses ?? null,
        min_order_amount: body.minOrderAmount ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('branch_id', tenant.branchId)
      .select(
        'id, code, description, discount_type, discount_value, starts_at, ends_at, is_active, max_uses, times_used, min_order_amount, created_at',
      )
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Cupón no encontrado' },
        { status: 400 },
      );
    }

    return NextResponse.json({ coupon: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar cupón' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  const denied = await requireStaffPermission(
    auth,
    'coupons.manage',
    'No tienes permiso para gestionar cupones',
  );
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const tenant = await getDefaultTenant();
    const supabase = createAdminClient();

    // Soft-disable if already used on orders; hard delete otherwise.
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', id)
      .eq('branch_id', tenant.branchId);

    if ((count ?? 0) > 0) {
      const { data, error } = await supabase
        .from('coupons')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('branch_id', tenant.branchId)
        .select('id')
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? 'Cupón no encontrado' },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true, deactivated: true });
    }

    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id)
      .eq('branch_id', tenant.branchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, deactivated: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar cupón' },
      { status: 500 },
    );
  }
}
