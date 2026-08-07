import assert from 'node:assert/strict';
import test from 'node:test';

import { formatMoney, isValidMexicanPhone, normalizePhone, validateGuestCheckout } from './index';

test('normalizePhone adds Mexico country code', () => {
  assert.equal(normalizePhone('5512345678'), '525512345678');
  assert.equal(normalizePhone('52 55 1234 5678'), '525512345678');
});

test('isValidMexicanPhone validates 10-digit numbers', () => {
  assert.equal(isValidMexicanPhone('5512345678'), true);
  assert.equal(isValidMexicanPhone('123'), false);
});

test('validateGuestCheckout requires department text for delivery', () => {
  const error = validateGuestCheckout({
    customerName: 'Ana',
    customerPhone: '5512345678',
    fulfillmentType: 'delivery',
    items: [{ branchProductId: 'abc', quantity: 1 }],
  });
  assert.equal(error, 'Ingresa tu departamento para la entrega.');
});

test('validateGuestCheckout accepts free-text department', () => {
  const error = validateGuestCheckout({
    customerName: 'Ana',
    customerPhone: '5512345678',
    fulfillmentType: 'delivery',
    deliveryUnit: 'Torre A 101',
    items: [{ branchProductId: 'abc', quantity: 1 }],
  });
  assert.equal(error, null);
});

test('formatMoney uses MXN locale', () => {
  assert.match(formatMoney(45.5), /\$45\.50/);
});
