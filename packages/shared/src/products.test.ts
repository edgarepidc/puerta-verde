import assert from 'node:assert/strict';
import test from 'node:test';

import { validateProductInput } from './products';

test('validateProductInput requires name', () => {
  assert.equal(
    validateProductInput({
      name: '',
      unit: 'kg',
      price: 10,
      stock: 1,
      isAvailable: true,
      isActive: true,
    }),
    'El nombre del producto es obligatorio.',
  );
});

test('validateProductInput rejects negative price', () => {
  assert.equal(
    validateProductInput({
      name: 'Jitomate',
      unit: 'kg',
      price: -1,
      stock: 1,
      isAvailable: true,
      isActive: true,
    }),
    'El precio no puede ser negativo.',
  );
});
