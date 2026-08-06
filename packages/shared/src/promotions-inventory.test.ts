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

test('validateInventoryMovement requires product', () => {
  assert.equal(
    validateInventoryMovement({
      branchProductId: '',
      movementType: 'purchase',
      quantity: 5,
      unitCost: 10,
    }),
    'Selecciona un producto.',
  );
});

test('validateInventoryMovement requires unit cost on purchase', () => {
  assert.equal(
    validateInventoryMovement({
      branchProductId: 'abc',
      movementType: 'purchase',
      quantity: 5,
    }),
    'El costo de compra es obligatorio en entradas.',
  );
});
