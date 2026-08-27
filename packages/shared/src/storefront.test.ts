import assert from 'node:assert/strict';
import test from 'node:test';

import { validateInventoryMovement, validatePromotionInput } from './index';

test('validatePromotionInput requires title', () => {
  assert.equal(
    validatePromotionInput({
      title: '',
      kind: 'banner',
      isActive: true,
    }),
    'El título es obligatorio.',
  );
});

test('validatePromotionInput requires discount percent', () => {
  assert.equal(
    validatePromotionInput({
      title: 'Oferta',
      kind: 'discount',
      isActive: true,
      discountPercent: 0,
    }),
    'Indica un descuento entre 1 y 100%.',
  );
});

test('getDefaultQuantity is always 1', async () => {
  const { getDefaultQuantity } = await import('./storefront');
  assert.equal(getDefaultQuantity('kg'), 1);
  assert.equal(getDefaultQuantity('piece'), 1);
  assert.equal(getDefaultQuantity('bunch'), 1);
});
