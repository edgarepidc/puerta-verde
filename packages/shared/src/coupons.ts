export const COUPON_DISCOUNT_TYPES = ['percent', 'fixed'] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

export const COUPON_DISCOUNT_TYPE_LABELS: Record<CouponDiscountType, string> = {
  percent: 'Porcentaje (%)',
  fixed: 'Monto fijo ($)',
};

export interface CouponInput {
  code: string;
  description?: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
  maxUses?: number | null;
  minOrderAmount?: number | null;
}

export interface CouponRecord {
  id: string;
  code: string;
  description?: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
  max_uses?: number | null;
  times_used?: number | null;
  min_order_amount?: number | null;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function validateCouponInput(input: CouponInput): string | null {
  const code = normalizeCouponCode(input.code);
  if (!code) return 'El código del cupón es obligatorio.';
  if (code.length < 3) return 'El código debe tener al menos 3 caracteres.';
  if (code.length > 32) return 'El código no puede pasar de 32 caracteres.';
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return 'El código solo puede usar letras, números, guion y guion bajo.';
  }
  if (!COUPON_DISCOUNT_TYPES.includes(input.discountType)) {
    return 'Tipo de descuento inválido.';
  }
  const value = Number(input.discountValue);
  if (!Number.isFinite(value) || value <= 0) {
    return 'Indica un valor de descuento mayor a cero.';
  }
  if (input.discountType === 'percent' && value > 100) {
    return 'El porcentaje no puede ser mayor a 100.';
  }
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) {
    return 'La vigencia de fin debe ser posterior al inicio.';
  }
  if (input.maxUses != null) {
    const maxUses = Number(input.maxUses);
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      return 'El máximo de usos debe ser un entero mayor a cero.';
    }
  }
  if (input.minOrderAmount != null) {
    const min = Number(input.minOrderAmount);
    if (!Number.isFinite(min) || min < 0) {
      return 'El pedido mínimo no es válido.';
    }
  }
  return null;
}

export function computeCouponDiscount(
  subtotal: number,
  coupon: Pick<CouponRecord, 'discount_type' | 'discount_value'>,
): number {
  const base = Number(subtotal);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const value = Number(coupon.discount_value);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const raw =
    coupon.discount_type === 'percent' ? (base * value) / 100 : value;
  return roundMoney(Math.min(Math.max(raw, 0), base));
}

export function couponValidityError(
  coupon: Pick<
    CouponRecord,
    | 'is_active'
    | 'starts_at'
    | 'ends_at'
    | 'max_uses'
    | 'times_used'
    | 'min_order_amount'
  >,
  options: { now?: Date; subtotal?: number } = {},
): string | null {
  if (!coupon.is_active) return 'Este cupón no está activo.';
  const now = options.now ?? new Date();
  if (coupon.starts_at) {
    const start = new Date(coupon.starts_at);
    if (!Number.isNaN(start.getTime()) && now < start) {
      return 'Este cupón aún no inicia su vigencia.';
    }
  }
  if (coupon.ends_at) {
    const end = new Date(coupon.ends_at);
    if (!Number.isNaN(end.getTime()) && now > end) {
      return 'Este cupón ya venció.';
    }
  }
  if (coupon.max_uses != null) {
    const used = Number(coupon.times_used ?? 0);
    if (used >= Number(coupon.max_uses)) {
      return 'Este cupón ya alcanzó el máximo de usos.';
    }
  }
  if (coupon.min_order_amount != null && options.subtotal != null) {
    const min = Number(coupon.min_order_amount);
    if (Number.isFinite(min) && Number(options.subtotal) < min) {
      return `Pedido mínimo de $${min.toFixed(2)} para usar este cupón.`;
    }
  }
  return null;
}

export function evaluateCoupon(
  coupon: CouponRecord,
  options: { now?: Date; subtotal: number },
): { ok: true; discount: number } | { ok: false; error: string } {
  const validity = couponValidityError(coupon, options);
  if (validity) return { ok: false, error: validity };
  const discount = computeCouponDiscount(options.subtotal, coupon);
  if (discount <= 0) return { ok: false, error: 'El cupón no aplica a este pedido.' };
  return { ok: true, discount };
}
