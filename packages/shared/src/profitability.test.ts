import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyOperatingCostsToPockets,
  costAppliesToRange,
  costPausedAtPeriodStart,
  operatingCostAmountForRange,
} from './profitability';

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

test('costPausedAtPeriodStart is true when Pausar closed the term the day before', () => {
  assert.equal(
    costPausedAtPeriodStart(
      [{ start_date: '2026-01-01', end_date: '2026-07-31' }],
      '2026-08-01',
      '2026-07-31',
    ),
    true,
  );
});

test('costPausedAtPeriodStart is true when the term started on the paused period', () => {
  assert.equal(
    costPausedAtPeriodStart(
      [{ start_date: '2026-08-01', end_date: '2026-07-31' }],
      '2026-08-01',
      '2026-07-31',
    ),
    true,
  );
});

test('costPausedAtPeriodStart is false for an open term', () => {
  assert.equal(
    costPausedAtPeriodStart(
      [{ start_date: '2026-01-01', end_date: null }],
      '2026-08-01',
      '2026-07-31',
    ),
    false,
  );
});

test('applyOperatingCostsToPockets subtracts applying rent from the account', () => {
  const flows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
  applyOperatingCostsToPockets(
    flows,
    [
      {
        costType: 'fixed',
        period: 'monthly',
        amount: 9500,
        paidFrom: 'account',
        terms: [{ start_date: '2026-01-01', end_date: null }],
      },
    ],
    {
      from: '2026-09-01',
      to: '2026-09-02',
      dayBeforeFrom: '2026-08-31',
      mode: 'outflow',
    },
  );
  assert.equal(flows.accountOut, 9500);
  assert.equal(flows.cashOut, 0);
});

test('applyOperatingCostsToPockets adds paused August rent back to the account', () => {
  const flows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
  applyOperatingCostsToPockets(
    flows,
    [
      {
        costType: 'fixed',
        period: 'monthly',
        amount: 9500,
        paidFrom: 'account',
        terms: [{ start_date: '2026-08-01', end_date: '2026-07-31' }],
      },
    ],
    {
      from: '2026-08-01',
      to: '2026-08-31',
      dayBeforeFrom: '2026-07-31',
      mode: 'paused-addback',
    },
  );
  assert.equal(flows.accountIn, 9500);
  assert.equal(flows.cashIn, 0);
});

test('applyOperatingCostsToPockets does not add back rent that still applies', () => {
  const flows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
  applyOperatingCostsToPockets(
    flows,
    [
      {
        costType: 'fixed',
        period: 'monthly',
        amount: 9500,
        paidFrom: 'account',
        terms: [
          { start_date: '2026-08-01', end_date: '2026-07-31' },
          { start_date: '2026-08-01', end_date: null },
        ],
      },
    ],
    {
      from: '2026-08-01',
      to: '2026-08-31',
      dayBeforeFrom: '2026-07-31',
      mode: 'paused-addback',
    },
  );
  assert.equal(flows.accountIn, 0);
});
