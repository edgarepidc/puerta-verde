import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addCollectedTicket,
  addPocketInflow,
  addPocketOutflow,
  isCollectedTicket,
  pocketTotal,
  resolveMoneyPosition,
  ticketCollectedAmount,
  ticketMoneyPocket,
  validateMoneyPositionInput,
} from './money-position';

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

test('addPocketOutflow sends cash and account to different pockets', () => {
  const flows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
  addPocketOutflow(flows, 'cash', 40);
  addPocketOutflow(flows, 'account', 15);
  addPocketOutflow(flows, 'cash', 0);
  assert.equal(flows.cashOut, 40);
  assert.equal(flows.accountOut, 15);
});

test('addPocketInflow returns money to the matching pocket', () => {
  const flows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
  addPocketInflow(flows, 'account', 9500);
  addPocketInflow(flows, 'cash', 100);
  assert.equal(flows.accountIn, 9500);
  assert.equal(flows.cashIn, 100);
});

test('pocketTotal is caja plus cuenta', () => {
  assert.equal(pocketTotal({ cash: 2605, account: 4362 }), 6967);
});

test('ticketCollectedAmount is subtotal minus discount plus delivery', () => {
  assert.equal(
    ticketCollectedAmount({ subtotal: 100, discount_amount: 10, delivery_fee: 25 }),
    115,
  );
});

test('ticketMoneyPocket sends card and transfer to the account', () => {
  assert.equal(ticketMoneyPocket('cash'), 'cash');
  assert.equal(ticketMoneyPocket('card_terminal'), 'account');
  assert.equal(ticketMoneyPocket('transfer'), 'account');
  assert.equal(ticketMoneyPocket('online'), 'account');
  assert.equal(ticketMoneyPocket('on_account'), null);
  assert.equal(ticketMoneyPocket(null), 'cash');
});

test('cancelled or unpaid tickets do not enter caja or cuenta', () => {
  assert.equal(
    isCollectedTicket({ status: 'cancelled', payment_status: 'paid', payment_method: 'cash' }),
    false,
  );
  assert.equal(
    isCollectedTicket({ status: 'delivered', payment_status: 'pending', payment_method: 'cash' }),
    false,
  );
  assert.equal(
    isCollectedTicket({
      status: 'delivered',
      payment_status: 'paid',
      payment_method: 'on_account',
    }),
    false,
  );
  assert.equal(
    isCollectedTicket({
      status: 'delivered',
      payment_status: 'paid',
      payment_method: 'card_terminal',
    }),
    true,
  );
});

test('addCollectedTicket uses the ticket amount and the payment pocket', () => {
  const flows = { cashIn: 0, accountIn: 0, cashOut: 0, accountOut: 0 };
  addCollectedTicket(flows, {
    status: 'delivered',
    payment_status: 'paid',
    payment_method: 'cash',
    subtotal: 80,
    discount_amount: 0,
    delivery_fee: 0,
  });
  addCollectedTicket(flows, {
    status: 'delivered',
    payment_status: 'paid',
    payment_method: 'transfer',
    subtotal: 200,
    discount_amount: 20,
    delivery_fee: 0,
  });
  addCollectedTicket(flows, {
    status: 'cancelled',
    payment_status: 'paid',
    payment_method: 'cash',
    subtotal: 50,
    discount_amount: 0,
    delivery_fee: 0,
  });
  addCollectedTicket(flows, {
    status: 'delivered',
    payment_status: 'paid',
    payment_method: 'on_account',
    subtotal: 40,
    discount_amount: 0,
    delivery_fee: 0,
  });
  assert.equal(flows.cashIn, 80);
  assert.equal(flows.accountIn, 180);
});
