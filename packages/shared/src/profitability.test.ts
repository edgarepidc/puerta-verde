import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyOperatingCostsToPockets,
  calendarMonthStart,
  chargeDateForMonth,
  costAppliesToRange,
  costPausedAtPeriodStart,
  operatingCostAmountForRange,
} from './profitability';
import { pocketTotal, resolveMoneyPosition } from './money-position';

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

test('costAppliesToRange hides a cost quit from October while keeping August', () => {
  const terms = [{ start_date: '2026-08-01', end_date: '2026-09-30' }];
  assert.equal(costAppliesToRange(terms, '2026-08-01', '2026-08-31'), true);
  assert.equal(costAppliesToRange(terms, '2026-09-01', '2026-09-30'), true);
  assert.equal(costAppliesToRange(terms, '2026-10-01', '2026-10-31'), false);
});

test('costAppliesToRange handles a gap then a new term', () => {
  const terms = [
    { start_date: '2026-01-01', end_date: '2026-07-31' },
    { start_date: '2026-09-01', end_date: null },
  ];
  assert.equal(costAppliesToRange(terms, '2026-08-01', '2026-08-31'), false);
  assert.equal(costAppliesToRange(terms, '2026-09-01', '2026-09-01'), true);
});

test('operatingCostAmountForRange charges the full amount when the calendar day is in range', () => {
  assert.equal(
    operatingCostAmountForRange(
      { costType: 'fixed', period: 'monthly', amount: 9500, chargeDay: 1 },
      '2026-09-01',
      '2026-09-02',
    ),
    9500,
  );
});

test('operatingCostAmountForRange does not charge before the calendar day', () => {
  assert.equal(
    operatingCostAmountForRange(
      { costType: 'fixed', period: 'monthly', amount: 9000, chargeDay: 1 },
      '2026-09-10',
      '2026-09-12',
    ),
    0,
  );
});

test('operatingCostAmountForRange charges a one-off in full on its day, not prorated', () => {
  assert.equal(
    operatingCostAmountForRange(
      {
        costType: 'variable',
        period: 'monthly',
        amount: 450,
        chargeDay: 1,
        terms: [{ start_date: '2026-09-01', end_date: null }],
      },
      '2026-09-01',
      '2026-09-02',
    ),
    450,
  );
});

test('operatingCostAmountForRange waits until the chosen day', () => {
  const cost = { costType: 'fixed' as const, period: 'monthly' as const, amount: 3200, chargeDay: 15 };
  assert.equal(operatingCostAmountForRange(cost, '2026-09-01', '2026-09-14'), 0);
  assert.equal(operatingCostAmountForRange(cost, '2026-09-01', '2026-09-15'), 3200);
});

test('chargeDateForMonth clamps day 31 to February 28', () => {
  assert.equal(chargeDateForMonth(2026, 2, 31), '2026-02-28');
  assert.equal(
    operatingCostAmountForRange(
      { costType: 'fixed', period: 'monthly', amount: 100, chargeDay: 31 },
      '2026-02-01',
      '2026-02-28',
    ),
    100,
  );
  assert.equal(
    operatingCostAmountForRange(
      { costType: 'fixed', period: 'monthly', amount: 100, chargeDay: 31 },
      '2026-02-01',
      '2026-02-27',
    ),
    0,
  );
});

test('operatingCostAmountForRange charges once per overlapping month', () => {
  assert.equal(
    operatingCostAmountForRange(
      { costType: 'fixed', period: 'monthly', amount: 9500, chargeDay: 1 },
      '2026-08-15',
      '2026-09-15',
    ),
    9500,
  );
  assert.equal(
    operatingCostAmountForRange(
      { costType: 'fixed', period: 'monthly', amount: 9500, chargeDay: 20 },
      '2026-08-15',
      '2026-09-15',
    ),
    9500,
  );
});

test('operatingCostAmountForRange skips a charge date after the term ended', () => {
  assert.equal(
    operatingCostAmountForRange(
      {
        costType: 'fixed',
        period: 'monthly',
        amount: 450,
        chargeDay: 1,
        terms: [{ start_date: '2026-08-01', end_date: '2026-08-31' }],
      },
      '2026-10-01',
      '2026-10-31',
    ),
    0,
  );
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
        chargeDay: 1,
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

test('applyOperatingCostsToPockets does not subtract rent before its calendar day', () => {
  const flows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
  applyOperatingCostsToPockets(
    flows,
    [
      {
        costType: 'fixed',
        period: 'monthly',
        amount: 9500,
        chargeDay: 15,
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
  assert.equal(flows.accountOut, 0);
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
        chargeDay: 1,
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

test('calendarMonthStart is the first day of that month', () => {
  assert.equal(calendarMonthStart('2026-08-31'), '2026-08-01');
});

test('a counted snapshot is not inflated by paused rent; September rent still leaves', () => {
  const costs = [
    {
      costType: 'fixed' as const,
      period: 'monthly' as const,
      amount: 9500,
      chargeDay: 1,
      paidFrom: 'account' as const,
      terms: [
        { start_date: '2026-08-01', end_date: '2026-07-31' },
        { start_date: '2026-09-01', end_date: null },
      ],
    },
  ];
  const flows = { cashIn: 1351.24, accountIn: 3461.98, cashOut: 0, accountOut: 0 };
  applyOperatingCostsToPockets(flows, costs, {
    from: '2026-09-01',
    to: '2026-09-02',
    dayBeforeFrom: '2026-08-31',
    mode: 'outflow',
  });
  const result = resolveMoneyPosition({
    snapshot: { asOfDate: '2026-08-31', cash: 2605, account: 4362 },
    periodEnd: '2026-09-02',
    flows,
  });
  assert.equal(result.cash, 3956.24);
  assert.equal(result.account, -1676.02);
  assert.equal(pocketTotal(result), 2280.22);
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
        chargeDay: 1,
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
