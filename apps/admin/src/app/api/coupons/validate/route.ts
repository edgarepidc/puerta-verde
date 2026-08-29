import { NextResponse } from 'next/server';

import { evaluateCoupon } from '@puertaverde/shared';

import { requireStaffApi } from '@/lib/auth';
import { findCouponByCode } from '@/lib/apply-coupon';
import { createAdminClient } from '@puertaverde/supabase/admin';

export async function POST(request: Request) {
  const auth = await requireStaffApi();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as { code?: string; subtotal?: number };
    const code = body.code ?? '';
    const subtotal = Number(body.subtotal);
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      return NextResponse.json({ error: 'Subtotal inválido' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const coupon = await findCouponByCode(supabase, auth.branchId, code);
    if (!coupon) {
      return NextResponse.json({ error: 'Cupón no encontrado' }, { status: 404 });
    }

    const result = evaluateCoupon(coupon, { subtotal });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      discount: result.discount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al validar cupón' },
      { status: 500 },
    );
  }
}
