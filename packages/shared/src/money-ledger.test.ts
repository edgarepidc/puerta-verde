import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addCollectedTicketMethods,
  buildMoneyLedger,
  eachInclusiveYmd,
  emptyMoneyDay,
  moneyDayHasActivity,
  moneyLedgerRowYmd,
} from './money-ledger';

test('eachInclusiveYmd walks calendar days', () => {
  assert.deepEqual(eachInclusiveYmd('2026-09-29', '2026-10-01'), [
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
  ]);
});

test('moneyLedgerRowYmd keeps date-only values and converts timestamps', () => {
  assert.equal(moneyLedgerRowYmd('2026-09-15'), '2026-09-15');
  assert.equal(moneyLedgerRowYmd('2026-09-15T22:30:00-06:00'), '2026-09-15');
});

test('addCollectedTicketMethods splits cash and TPV', () => {
  const day = emptyMoneyDay('2026-09-01');
  addCollectedTicketMethods(day, {
    ymd: '2026-09-01',
    status: 'delivered',
    payment_status: 'paid',
    payment_method: 'card_terminal',
    payment_splits: [
      { method: 'cash', amount: 80 },
      { method: 'card_terminal', amount: 120 },
    ],
    subtotal: 200,
  });
  assert.equal(day.cashSales, 80);
  assert.equal(day.cardSales, 120);
});

test('buildMoneyLedger tracks cash, TPV, transfer and deposits by day', () => {
  const ledger = buildMoneyLedger({
    from: '2026-09-01',
    to: '2026-09-03',
    opening: { asOfDate: '2026-08-31', cash: 1000, account: 4000 },
    tickets: [
      {
        ymd: '2026-09-01',
        status: 'delivered',
        payment_status: 'paid',
        payment_method: 'cash',
        subtotal: 300,
      },
      {
        ymd: '2026-09-01',
        status: 'delivered',
        payment_status: 'paid',
        payment_method: 'card_terminal',
        subtotal: 500,
      },
      {
        ymd: '2026-09-02',
        status: 'delivered',
        payment_status: 'paid',
        payment_method: 'transfer',
        subtotal: 200,
      },
    ],
    purchases: [{ ymd: '2026-09-02', amount: 150, paidFrom: 'account' }],
    expenses: [],
    incomes: [{ ymd: '2026-09-03', amount: 80, paidFrom: 'account', entryType: 'contribution' }],
    transfers: [{ ymd: '2026-09-03', amount: 400, destination: 'account' }],
  });

  const day1 = ledger.days[0]!;
  assert.equal(day1.cashSales, 300);
  assert.equal(day1.cardSales, 500);
  assert.equal(day1.runningCash, 1300);
  assert.equal(day1.runningAccount, 4500);

  const day2 = ledger.days[1]!;
  assert.equal(day2.transferSales, 200);
  assert.equal(day2.purchasesAccount, 150);
  assert.equal(day2.runningAccount, 4550);

  const day3 = ledger.days[2]!;
  assert.equal(day3.toAccount, 400);
  assert.equal(day3.otherInAccount, 80);
  assert.equal(day3.runningCash, 900);
  assert.equal(day3.runningAccount, 5030);
  assert.equal(ledger.closingAccount, 5030);
  assert.equal(ledger.totals.cardSales, 500);
  assert.equal(ledger.totals.transferSales, 200);
  assert.equal(ledger.totals.toAccount, 400);
});

test('buildMoneyLedger charges rent on the chosen day', () => {
  const ledger = buildMoneyLedger({
    from: '2026-09-01',
    to: '2026-09-02',
    opening: { asOfDate: '2026-08-31', cash: 0, account: 5000 },
    tickets: [],
    purchases: [],
    expenses: [],
    incomes: [],
    transfers: [],
    costs: [
      {
        costType: 'fixed',
        period: 'monthly',
        amount: 3200,
        chargeDay: 1,
        paidFrom: 'account',
        terms: [{ start_date: '2026-01-01', end_date: null }],
      },
    ],
  });
  assert.equal(ledger.days[0]!.expensesAccount, 3200);
  assert.equal(ledger.days[0]!.runningAccount, 1800);
  assert.equal(ledger.days[1]!.expensesAccount, 0);
  assert.equal(ledger.days[1]!.runningAccount, 1800);
});

test('a mid-period count resets running Tienes and leaves that day’s sales visible', () => {
  const ledger = buildMoneyLedger({
    from: '2026-09-01',
    to: '2026-09-03',
    opening: { asOfDate: '2026-08-31', cash: 100, account: 1000 },
    counts: [{ asOfDate: '2026-09-02', cash: 50, account: 800 }],
    tickets: [
      {
        ymd: '2026-09-02',
        status: 'delivered',
        payment_status: 'paid',
        payment_method: 'transfer',
        subtotal: 90,
      },
      {
        ymd: '2026-09-03',
        status: 'delivered',
        payment_status: 'paid',
        payment_method: 'card_terminal',
        subtotal: 40,
      },
    ],
    purchases: [],
    expenses: [],
    incomes: [],
    transfers: [],
  });
  const counted = ledger.days[1]!;
  assert.equal(counted.counted, true);
  assert.equal(counted.transferSales, 90);
  assert.equal(counted.runningAccount, 800);
  assert.equal(ledger.days[2]!.runningAccount, 840);
  assert.equal(moneyDayHasActivity(counted), true);
});

test('paused rent after a mid-period count enters the following day, like Tienes', () => {
  const ledger = buildMoneyLedger({
    from: '2026-09-01',
    to: '2026-09-03',
    opening: { asOfDate: '2026-08-31', cash: 100, account: 1000 },
    counts: [{ asOfDate: '2026-09-02', cash: 50, account: 800, pausedAccount: 100 }],
    tickets: [
      {
        ymd: '2026-09-03',
        status: 'delivered',
        payment_status: 'paid',
        payment_method: 'card_terminal',
        subtotal: 40,
      },
    ],
    purchases: [],
    expenses: [],
    incomes: [],
    transfers: [],
  });
  assert.equal(ledger.days[1]!.runningAccount, 800);
  assert.equal(ledger.days[2]!.runningAccount, 940);
});
