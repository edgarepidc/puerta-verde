import { NextResponse } from 'next/server';

import { evaluateCoupon } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

import { findCouponByCode } from '@/lib/apply-coupon';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      branchSlug?: string;
      code?: string;
      subtotal?: number;
    };
    const branchSlug = body.branchSlug?.trim();
    const code = body.code ?? '';
    const subtotal = Number(body.subtotal);

    if (!branchSlug) {
      return NextResponse.json({ error: 'Sucursal requerida' }, { status: 400 });
    }
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      return NextResponse.json({ error: 'Subtotal inválido' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id')
      .eq('slug', branchSlug)
      .maybeSingle();

    if (branchError || !branch) {
      return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 400 });
    }

    const coupon = await findCouponByCode(supabase, branch.id, code);
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
