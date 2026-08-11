import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePurchaseInput, validateSupplierInput } from './purchases';

test('validateSupplierInput requires name', () => {
  assert.equal(validateSupplierInput({ name: '  ' }), 'El nombre del proveedor es obligatorio.');
});

test('validatePurchaseInput requires supplier and items', () => {
  assert.equal(
    validatePurchaseInput({ supplierId: '', items: [] }),
    'Selecciona un proveedor.',
  );
  assert.equal(
    validatePurchaseInput({
      supplierId: 'sup-1',
      items: [{ branchProductId: 'bp-1', quantity: 0, unitPrice: 10 }],
    }),
    'La cantidad debe ser mayor a cero.',
  );
  assert.equal(
    validatePurchaseInput({
      supplierId: 'sup-1',
      items: [{ branchProductId: 'bp-1', quantity: 2, unitPrice: 12.5 }],
    }),
    null,
  );
});
