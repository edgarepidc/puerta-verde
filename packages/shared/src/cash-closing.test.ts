import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCashDrawerLines,
  cashCloseValidationError,
  expectedCashOnHand,
  expectedCashOnHandForCount,
} from './cash-closing';

test('expectedCashOnHand is fondo plus cash sales', () => {
  assert.equal(expectedCashOnHand(500, 320), 820);
  assert.equal(expectedCashOnHand(null, 320), 320);
});

test('expectedCashOnHand subtracts cash payroll and other drawer payments', () => {
  const lines = buildCashDrawerLines({
    operating: [
      { name: 'Pago de Ceci', category: 'payroll', amount: 450, paidFrom: 'cash' },
      { name: 'Renta', category: 'rent', amount: 9000, paidFrom: 'account' },
    ],
  });
  assert.deepEqual(lines, [
    { direction: 'out', label: 'Nómina · Pago de Ceci', amount: 450, pocket: 'cash' },
    { direction: 'out', label: 'Renta', amount: 9000, pocket: 'account' },
  ]);
  assert.equal(expectedCashOnHand(2719.5, 364.5, lines), 2634);
});

test('account payroll explains a matching cash shortage', () => {
  const lines = buildCashDrawerLines({
    operating: [{ name: 'Pago de Ceci', category: 'payroll', amount: 450, paidFrom: 'account' }],
  });
  assert.equal(expectedCashOnHand(2719.5, 364.5, lines), 3084);
  assert.equal(expectedCashOnHandForCount(2719.5, 364.5, lines, 2634), 2634);
  assert.equal(expectedCashOnHandForCount(2719.5, 364.5, lines, 3084), 3084);
  assert.equal(expectedCashOnHandForCount(2719.5, 364.5, lines, 2600), 3084);
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

test('cashCloseValidationError treats explained cash payroll as matching', () => {
  const cashLines = buildCashDrawerLines({
    operating: [{ name: 'Pago de Ceci', category: 'payroll', amount: 450, paidFrom: 'cash' }],
  });
  assert.equal(
    cashCloseValidationError({
      countedCash: 2634,
      openingFloat: 2719.5,
      cashSales: 364.5,
      notes: '',
      cashLines,
    }),
    null,
  );
});

test('cashCloseValidationError treats matching account payroll as explaining the drawer', () => {
  const cashLines = buildCashDrawerLines({
    operating: [{ name: 'Pago de Ceci', category: 'payroll', amount: 450, paidFrom: 'account' }],
  });
  assert.equal(
    cashCloseValidationError({
      countedCash: 2634,
      openingFloat: 2719.5,
      cashSales: 364.5,
      notes: '',
      cashLines,
    }),
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
