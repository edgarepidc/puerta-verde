import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPaymentSplitsLabel,
  orderPaymentAmounts,
  parsePaymentSplits,
  primaryPaymentMethod,
  validatePaymentSplits,
} from './payment-splits';

test('parsePaymentSplits ignores junk and keeps positive amounts', () => {
  assert.deepEqual(
    parsePaymentSplits([
      { method: 'cash', amount: 100.56 },
      { method: 'card_terminal', amount: 50 },
      { method: 'on_account', amount: 10 },
      { method: 'cash', amount: 0 },
    ]),
    [
      { method: 'cash', amount: 100.56 },
      { method: 'card_terminal', amount: 50 },
    ],
  );
});

test('validatePaymentSplits requires unique methods that sum to the total', () => {
  const splits = [
    { method: 'cash' as const, amount: 80 },
    { method: 'card_terminal' as const, amount: 20 },
  ];
  assert.equal(validatePaymentSplits(splits, 100), null);
  assert.equal(validatePaymentSplits(splits, 90), 'Los montos deben sumar 90.00.');
  assert.match(
    validatePaymentSplits([{ method: 'cash', amount: 100 }], 100) ?? '',
    /al menos dos/,
  );
  assert.match(
    validatePaymentSplits(
      [
        { method: 'cash', amount: 50 },
        { method: 'cash', amount: 50 },
      ],
      100,
    ) ?? '',
    /repitas/,
  );
});

test('primaryPaymentMethod is the largest split', () => {
  assert.equal(
    primaryPaymentMethod([
      { method: 'cash', amount: 40 },
      { method: 'transfer', amount: 60 },
    ]),
    'transfer',
  );
});

test('formatPaymentSplitsLabel lists each method', () => {
  assert.equal(
    formatPaymentSplitsLabel([
      { method: 'cash', amount: 80 },
      { method: 'card_terminal', amount: 20 },
    ]),
    'Efectivo 80.00 + TPV 20.00',
  );
});

test('orderPaymentAmounts uses splits when there are two or more', () => {
  assert.deepEqual(
    orderPaymentAmounts({
      total: 100,
      payment_method: 'cash',
      payment_splits: [
        { method: 'cash', amount: 30 },
        { method: 'card_terminal', amount: 70 },
      ],
    }),
    [
      { method: 'cash', amount: 30 },
      { method: 'card_terminal', amount: 70 },
    ],
  );
  assert.deepEqual(orderPaymentAmounts({ total: 45, payment_method: 'transfer' }), [
    { method: 'transfer', amount: 45 },
  ]);
});
