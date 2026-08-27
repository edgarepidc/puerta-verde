import {
  evaluateCoupon,
  normalizeCouponCode,
  type CouponRecord,
} from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export async function findCouponByCode(
  supabase: AdminClient,
  branchId: string,
  code: string,
): Promise<CouponRecord | null> {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('coupons')
    .select(
      'id, code, description, discount_type, discount_value, starts_at, ends_at, is_active, max_uses, times_used, min_order_amount',
    )
    .eq('branch_id', branchId)
    .eq('code', normalized)
    .maybeSingle();

  if (error || !data) return null;
  return {
    ...data,
    discount_type: data.discount_type as CouponRecord['discount_type'],
    discount_value: Number(data.discount_value),
    max_uses: data.max_uses == null ? null : Number(data.max_uses),
    times_used: Number(data.times_used ?? 0),
    min_order_amount:
      data.min_order_amount == null ? null : Number(data.min_order_amount),
  };
}

/** Apply a coupon to an existing order (after place_guest_order). */
export async function applyCouponToOrder(
  supabase: AdminClient,
  input: { orderId: string; branchId: string; code: string },
): Promise<
  | { ok: true; discount: number; code: string; total: number }
  | { ok: false; error: string }
> {
  const coupon = await findCouponByCode(supabase, input.branchId, input.code);
  if (!coupon) return { ok: false, error: 'Cupón no encontrado' };

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, subtotal, delivery_fee, discount_amount, coupon_id')
    .eq('id', input.orderId)
    .eq('branch_id', input.branchId)
    .maybeSingle();

  if (orderError || !order) {
    return { ok: false, error: orderError?.message ?? 'Pedido no encontrado' };
  }
  if (order.coupon_id) {
    return { ok: false, error: 'Este pedido ya tiene un cupón aplicado' };
  }

  const subtotal = Number(order.subtotal);
  const evaluated = evaluateCoupon(coupon, { subtotal });
  if (!evaluated.ok) return evaluated;

  const deliveryFee = Number(order.delivery_fee ?? 0);
  const total = roundMoney(subtotal - evaluated.discount + deliveryFee);

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      coupon_id: coupon.id,
      coupon_code: coupon.code,
      discount_amount: evaluated.discount,
      total,
    })
    .eq('id', input.orderId)
    .eq('branch_id', input.branchId);

  if (updateError) return { ok: false, error: updateError.message };

  const { error: useError } = await supabase
    .from('coupons')
    .update({
      times_used: Number(coupon.times_used ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', coupon.id)
    .eq('branch_id', input.branchId);

  if (useError) return { ok: false, error: useError.message };

  return {
    ok: true,
    discount: evaluated.discount,
    code: coupon.code,
    total,
  };
}
