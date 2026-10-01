import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyOperatingCostsToPockets,
  calendarMonthStart,
  chargeDateForMonth,
  costAppliesToRange,
  costPausedAtPeriodStart,
  costTypeFromCategory,
  groupOperatingCostsByCategory,
  inferOperatingCostCategory,
  operatingCostAmountForRange,
  operatingCostsChargedOnYmd,
} from './profitability';
import { pocketTotal, resolveMoneyPosition } from './money-position';

test('inferOperatingCostCategory maps rent, payroll and leftover fixed', () => {
  assert.equal(inferOperatingCostCategory({ name: 'Renta local' }), 'rent');
  assert.equal(inferOperatingCostCategory({ name: 'Ceci 4 días' }), 'payroll');
  assert.equal(inferOperatingCostCategory({ name: 'Pago a Vale' }), 'payroll');
  assert.equal(inferOperatingCostCategory({ name: 'Total Play' }), 'fixed');
  assert.equal(inferOperatingCostCategory({ name: 'Empaque', costType: 'variable' }), 'variable');
  assert.equal(inferOperatingCostCategory({ name: 'Ceci', category: 'fixed' }), 'fixed');
  assert.equal(costTypeFromCategory('payroll'), 'fixed');
  assert.equal(costTypeFromCategory('variable'), 'variable');
});

test('groupOperatingCostsByCategory keeps rent, payroll, then the rest', () => {
  const groups = groupOperatingCostsByCategory(
    [
      { name: 'Total Play', category: 'fixed' as const },
      { name: 'Renta local', category: 'rent' as const },
      { name: 'Ceci', category: 'payroll' as const },
    ],
    (row) => row.category,
  );
  assert.deepEqual(
    groups.map((group) => group.category),
    ['rent', 'payroll', 'fixed'],
  );
  assert.equal(groups[0]?.items[0]?.name, 'Renta local');
});

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

test('unpaid August rent stays in September pockets then September rent leaves', () => {
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
    from: calendarMonthStart('2026-08-31'),
    to: '2026-08-31',
    dayBeforeFrom: '2026-07-31',
    mode: 'paused-addback',
  });
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
  assert.equal(result.account, 7823.98);
  assert.equal(pocketTotal(result), 11780.22);
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

test('operatingCostsChargedOnYmd lists cash payroll on its charge day', () => {
  const cost = {
    name: 'Pago de Ceci',
    category: 'payroll' as const,
    costType: 'fixed' as const,
    period: 'monthly' as const,
    amount: 450,
    chargeDay: 30,
    paidFrom: 'cash' as const,
    terms: [{ start_date: '2026-09-01', end_date: null }],
  };
  assert.deepEqual(operatingCostsChargedOnYmd([cost], '2026-09-30'), [
    { name: 'Pago de Ceci', category: 'payroll', amount: 450, paidFrom: 'cash' },
  ]);
  assert.equal(operatingCostsChargedOnYmd([cost], '2026-09-29').length, 0);
});
