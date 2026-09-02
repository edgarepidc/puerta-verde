import assert from 'node:assert/strict';
import test from 'node:test';

import { costAppliesToRange, operatingCostAmountForRange } from './profitability';

test('costAppliesToRange is true for an open term that started before the period', () => {
  assert.equal(
    costAppliesToRange([{ start_date: '2026-08-01', end_date: null }], '2026-09-01', '2026-09-30'),
    true,
  );
});

test('costAppliesToRange is false when the term ended before the period', () => {
  assert.equal(
    costAppliesToRange(
      [{ start_date: '2026-01-01', end_date: '2026-08-31' }],
      '2026-09-01',
      '2026-09-30',
    ),
    false,
  );
});

test('costAppliesToRange stays true for months before a later pause', () => {
  assert.equal(
    costAppliesToRange(
      [{ start_date: '2026-08-01', end_date: '2026-10-31' }],
      '2026-08-01',
      '2026-08-31',
    ),
    true,
  );
});

test('costAppliesToRange handles a gap then a new term', () => {
  const terms = [
    { start_date: '2026-01-01', end_date: '2026-07-31' },
    { start_date: '2026-09-01', end_date: null },
  ];
  assert.equal(costAppliesToRange(terms, '2026-08-01', '2026-08-31'), false);
  assert.equal(costAppliesToRange(terms, '2026-09-01', '2026-09-01'), true);
});

test('operatingCostAmountForRange uses the full month when the range starts on day 1', () => {
  assert.equal(
    operatingCostAmountForRange(
      { costType: 'fixed', period: 'monthly', amount: 9500 },
      '2026-09-01',
      '2026-09-02',
    ),
    9500,
  );
});

test('operatingCostAmountForRange prorates a monthly cost mid-month', () => {
  const amount = operatingCostAmountForRange(
    { costType: 'fixed', period: 'monthly', amount: 9000 },
    '2026-09-10',
    '2026-09-12',
  );
  assert.equal(amount, 900);
});
