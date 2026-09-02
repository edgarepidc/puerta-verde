import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMoneyPosition, validateMoneyPositionInput } from './money-position';

test('validateMoneyPositionInput accepts August closing amounts', () => {
  assert.equal(
    validateMoneyPositionInput({
      cashAmount: 2605,
      accountAmount: 4362,
      asOfDate: '2026-08-31',
    }),
    null,
  );
});

test('validateMoneyPositionInput rejects a negative pocket', () => {
  assert.equal(
    validateMoneyPositionInput({
      cashAmount: -1,
      accountAmount: 100,
      asOfDate: '2026-08-31',
    }),
    'El efectivo no puede ser negativo.',
  );
});

test('resolveMoneyPosition uses a snapshot that closes the period', () => {
  const result = resolveMoneyPosition({
    snapshot: { asOfDate: '2026-08-31', cash: 2605, account: 4362 },
    periodEnd: '2026-08-31',
    flows: { cashIn: 999, accountIn: 999, cashOut: 50, accountOut: 50 },
  });
  assert.deepEqual(result, {
    cash: 2605,
    account: 4362,
    source: 'snapshot',
    snapshotAsOf: '2026-08-31',
  });
});

test('resolveMoneyPosition projects from a prior snapshot', () => {
  const result = resolveMoneyPosition({
    snapshot: { asOfDate: '2026-08-31', cash: 2605, account: 4362 },
    periodEnd: '2026-09-15',
    flows: { cashIn: 400, accountIn: 200, cashOut: 100, accountOut: 50 },
  });
  assert.equal(result.source, 'projected');
  assert.equal(result.cash, 2905);
  assert.equal(result.account, 4512);
  assert.equal(result.snapshotAsOf, '2026-08-31');
});

test('resolveMoneyPosition without a snapshot is just the period flow', () => {
  const result = resolveMoneyPosition({
    snapshot: null,
    periodEnd: '2026-08-31',
    flows: { cashIn: 100, accountIn: 80, cashOut: 40, accountOut: 10 },
  });
  assert.equal(result.source, 'period');
  assert.equal(result.cash, 60);
  assert.equal(result.account, 70);
});
