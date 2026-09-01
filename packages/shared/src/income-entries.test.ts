import assert from 'node:assert/strict';
import test from 'node:test';

import { validateIncomeEntryInput } from './income-entries';

test('validateIncomeEntryInput accepts a capital contribution', () => {
  assert.equal(
    validateIncomeEntryInput({
      entryType: 'contribution',
      concept: 'Aportación de capital',
      amount: 40000,
      entryDate: '2026-08-01',
    }),
    null,
  );
});

test('validateIncomeEntryInput rejects a missing type, concept, or amount', () => {
  assert.equal(
    validateIncomeEntryInput({
      entryType: 'operating',
      concept: '  ',
      amount: 10,
      entryDate: '2026-08-01',
    }),
    'El concepto es obligatorio.',
  );
  assert.equal(
    validateIncomeEntryInput({
      entryType: 'contribution',
      concept: 'Capital',
      amount: 0,
      entryDate: '2026-08-01',
    }),
    'El monto debe ser mayor a cero.',
  );
});

test('validateIncomeEntryInput rejects an invalid date', () => {
  assert.equal(
    validateIncomeEntryInput({
      entryType: 'operating',
      concept: 'Reembolso',
      amount: 50,
      entryDate: '01/08/26',
    }),
    'La fecha es inválida.',
  );
});
