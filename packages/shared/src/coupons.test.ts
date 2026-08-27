import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeCouponDiscount,
  couponValidityError,
  evaluateCoupon,
  normalizeCouponCode,
  validateCouponInput,
} from './coupons';

test('normalizeCouponCode uppercases and strips spaces', () => {
  assert.equal(normalizeCouponCode('  verano 10 '), 'VERANO10');
});

test('validateCouponInput accepts percent and fixed', () => {
  assert.equal(
    validateCouponInput({
      code: 'VERANO10',
      discountType: 'percent',
      discountValue: 10,
      isActive: true,
    }),
    null,
  );
  assert.equal(
    validateCouponInput({
      code: 'MENOS50',
      discountType: 'fixed',
      discountValue: 50,
      isActive: true,
      startsAt: '2026-08-01T00:00:00Z',
      endsAt: '2026-08-31T23:59:59Z',
    }),
    null,
  );
  assert.match(
    validateCouponInput({
      code: 'X',
      discountType: 'percent',
      discountValue: 10,
      isActive: true,
    }) ?? '',
    /3 caracteres/,
  );
});

test('computeCouponDiscount never exceeds subtotal', () => {
  assert.equal(
    computeCouponDiscount(200, { discount_type: 'percent', discount_value: 10 }),
    20,
  );
  assert.equal(
    computeCouponDiscount(40, { discount_type: 'fixed', discount_value: 50 }),
    40,
  );
});

test('evaluateCoupon checks vigencia and min order', () => {
  const coupon = {
    id: '1',
    code: 'PROMO',
    discount_type: 'percent' as const,
    discount_value: 10,
    is_active: true,
    starts_at: '2026-08-01T00:00:00Z',
    ends_at: '2026-08-31T23:59:59Z',
    max_uses: 5,
    times_used: 1,
    min_order_amount: 100,
  };
  assert.equal(
    couponValidityError(coupon, {
      now: new Date('2026-08-20T12:00:00Z'),
      subtotal: 80,
    })?.includes('mínimo') ?? false,
    true,
  );
  const ok = evaluateCoupon(coupon, {
    now: new Date('2026-08-20T12:00:00Z'),
    subtotal: 200,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.discount, 20);
});
