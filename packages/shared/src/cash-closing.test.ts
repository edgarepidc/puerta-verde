import assert from 'node:assert/strict';
import test from 'node:test';

import { cashCloseValidationError, expectedCashOnHand } from './cash-closing';

test('expectedCashOnHand is fondo plus cash sales', () => {
  assert.equal(expectedCashOnHand(500, 320), 820);
  assert.equal(expectedCashOnHand(null, 320), 320);
});

test('cashCloseValidationError requires a cash count', () => {
  assert.equal(
    cashCloseValidationError({ countedCash: '', openingFloat: 0, cashSales: 100, notes: '' }),
    'Cuenta el efectivo para cuadrar la caja',
  );
});

test('cashCloseValidationError allows a matching count without notes', () => {
  assert.equal(
    cashCloseValidationError({ countedCash: 820, openingFloat: 500, cashSales: 320, notes: '' }),
    null,
  );
});

test('cashCloseValidationError requires a note when the count does not match', () => {
  assert.equal(
    cashCloseValidationError({ countedCash: 800, openingFloat: 500, cashSales: 320, notes: '  ' }),
    'Si hay diferencia, anota por qué para poder cerrar',
  );
  assert.equal(
    cashCloseValidationError({
      countedCash: 800,
      openingFloat: 500,
      cashSales: 320,
      notes: 'faltante de $20',
    }),
    null,
  );
});
