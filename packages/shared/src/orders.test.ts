import assert from 'node:assert/strict';
import test from 'node:test';

import { formatMoney, isValidMexicanPhone, normalizePhone, resolvePosCustomer, WALK_IN_NAME, WALK_IN_PHONE, validateGuestCheckout } from './index';

test('normalizePhone adds Mexico country code', () => {
  assert.equal(normalizePhone('5512345678'), '525512345678');
  assert.equal(normalizePhone('52 55 1234 5678'), '525512345678');
});

test('isValidMexicanPhone validates 10-digit numbers', () => {
  assert.equal(isValidMexicanPhone('5512345678'), true);
  assert.equal(isValidMexicanPhone('123'), false);
});

test('validateGuestCheckout requires unit for delivery', () => {
  const error = validateGuestCheckout({
    customerName: 'Ana',
    customerPhone: '5512345678',
    fulfillmentType: 'delivery',
    items: [{ branchProductId: 'abc', quantity: 1 }],
  });
  assert.equal(error, 'Ingresa tu domicilio para la entrega.');
});

test('validateGuestCheckout accepts free-text delivery unit', () => {
  const error = validateGuestCheckout({
    customerName: 'Ana',
    customerPhone: '5512345678',
    fulfillmentType: 'delivery',
    deliveryUnit: 'Calle 12 #45, Col. Centro',
    items: [{ branchProductId: 'abc', quantity: 1 }],
  });
  assert.equal(error, null);
});

test('validateGuestCheckout allows walk-in without phone', () => {
  const error = validateGuestCheckout({
    customerName: '',
    customerPhone: '',
    fulfillmentType: 'pickup',
    walkIn: true,
    items: [{ branchProductId: 'abc', quantity: 1 }],
  });
  assert.equal(error, null);
});

test('resolvePosCustomer treats empty phone as walk-in', () => {
  assert.deepEqual(resolvePosCustomer('', ''), {
    customerName: WALK_IN_NAME,
    customerPhone: WALK_IN_PHONE,
    walkIn: true,
  });
});

test('resolvePosCustomer keeps a typed name without phone', () => {
  const result = resolvePosCustomer('Ana', '  ');
  assert.deepEqual(result, {
    customerName: 'Ana',
    customerPhone: WALK_IN_PHONE,
    walkIn: true,
  });
});

test('resolvePosCustomer rejects a partial phone', () => {
  const result = resolvePosCustomer('Ana', '55123');
  assert.equal('error' in result && result.error, 'Ingresa un teléfono válido de 10 dígitos.');
});

test('resolvePosCustomer uses a valid phone and defaults the name', () => {
  assert.deepEqual(resolvePosCustomer('', '5512345678'), {
    customerName: WALK_IN_NAME,
    customerPhone: '5512345678',
    walkIn: false,
  });
});

test('formatMoney uses MXN locale', () => {
  assert.match(formatMoney(45.5), /\$45\.50/);
});
