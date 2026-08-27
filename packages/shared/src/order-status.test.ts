import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMexicoDayLabel,
  groupByMexicoDay,
  mexicoYmdFromIso,
  nextWorkflowStatus,
  normalizeOrderStatus,
  orderStatusLabel,
  previousWorkflowStatus,
} from './order-status';

test('normalizeOrderStatus folds Listo and En camino into Preparando', () => {
  assert.equal(normalizeOrderStatus('ready'), 'preparing');
  assert.equal(normalizeOrderStatus('out_for_delivery'), 'preparing');
  assert.equal(normalizeOrderStatus('pending'), 'pending');
  assert.equal(normalizeOrderStatus('delivered'), 'delivered');
});

test('nextWorkflowStatus is Recibido → Preparando → Entregado', () => {
  assert.equal(nextWorkflowStatus('pending'), 'preparing');
  assert.equal(nextWorkflowStatus('preparing'), 'delivered');
  assert.equal(nextWorkflowStatus('ready'), 'delivered');
  assert.equal(nextWorkflowStatus('delivered'), null);
  assert.equal(nextWorkflowStatus('cancelled'), null);
});

test('previousWorkflowStatus rolls back Entregado → Preparando → Recibido', () => {
  assert.equal(previousWorkflowStatus('delivered'), 'preparing');
  assert.equal(previousWorkflowStatus('preparing'), 'pending');
  assert.equal(previousWorkflowStatus('pending'), null);
  assert.equal(previousWorkflowStatus('cancelled'), null);
});

test('orderStatusLabel uses the short board names', () => {
  assert.equal(orderStatusLabel('pending'), 'Recibido');
  assert.equal(orderStatusLabel('ready'), 'Preparando');
  assert.equal(orderStatusLabel('out_for_delivery'), 'Preparando');
  assert.equal(orderStatusLabel('delivered'), 'Entregado');
});

test('groupByMexicoDay buckets sales and labels Hoy', () => {
  const today = '2026-08-19';
  const groups = groupByMexicoDay(
    [
      { created_at: '2026-08-19T18:00:00-06:00', total: 100 },
      { created_at: '2026-08-19T09:00:00-06:00', total: 50 },
      { created_at: '2026-08-18T21:00:00-06:00', total: 80 },
    ],
    today,
  );

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.ymd, '2026-08-19');
  assert.equal(groups[0]?.label, 'Hoy');
  assert.equal(groups[0]?.count, 2);
  assert.equal(groups[0]?.total, 150);
  assert.equal(groups[1]?.label, 'Ayer');
  assert.equal(groups[1]?.total, 80);
});

test('mexicoYmdFromIso and formatMexicoDayLabel handle a calendar date', () => {
  assert.equal(mexicoYmdFromIso('2026-08-19T23:30:00-06:00'), '2026-08-19');
  assert.equal(formatMexicoDayLabel('2026-08-17', '2026-08-19').length > 0, true);
});
