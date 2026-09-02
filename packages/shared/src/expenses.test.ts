import assert from 'node:assert/strict';
import test from 'node:test';

import { validateExpenseInput } from './expenses';

test('validateExpenseInput accepts a valid visit expense', () => {
  assert.equal(
    validateExpenseInput({
      concept: 'Gasolina',
      amount: 450,
      expenseDate: '2026-08-07',
    }),
    null,
  );
});

test('validateExpenseInput rejects missing concept or non-positive amount', () => {
  assert.equal(
    validateExpenseInput({ concept: '  ', amount: 10, expenseDate: '2026-08-07' }),
    'El concepto es obligatorio.',
  );
  assert.equal(
    validateExpenseInput({ concept: 'Gasolina', amount: 0, expenseDate: '2026-08-07' }),
    'El monto debe ser mayor a cero.',
  );
});

test('validateExpenseInput rejects invalid dates', () => {
  assert.equal(
    validateExpenseInput({ concept: 'Gasolina', amount: 10, expenseDate: '07/08/26' }),
    'La fecha del gasto es inválida.',
  );
});

test('validateExpenseInput accepts cash or account', () => {
  assert.equal(
    validateExpenseInput({
      concept: 'Gasolina',
      amount: 450,
      expenseDate: '2026-08-07',
      paidFrom: 'account',
    }),
    null,
  );
});
