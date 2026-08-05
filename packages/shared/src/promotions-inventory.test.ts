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

test('validateInventoryMovement requires product', () => {
  assert.equal(
    validateInventoryMovement({
      branchProductId: '',
      movementType: 'purchase',
      quantity: 5,
    }),
    'Selecciona un producto.',
  );
});
