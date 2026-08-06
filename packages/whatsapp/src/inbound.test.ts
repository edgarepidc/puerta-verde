import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInboundHelpMessage,
  buildInboundOrderLookupMessage,
  detectInboundIntent,
  parseInboundMessages,
  parseStatusUpdates,
} from './inbound';

test('detectInboundIntent recognizes help and order commands', () => {
  assert.deepEqual(detectInboundIntent('Hola'), { type: 'help' });
  assert.deepEqual(detectInboundIntent('AYUDA'), { type: 'help' });
  assert.deepEqual(detectInboundIntent('estado de mi pedido'), { type: 'order_status' });
  assert.deepEqual(detectInboundIntent('pedido 1234'), { type: 'order_number', orderNumber: 1234 });
  assert.deepEqual(detectInboundIntent('#5678'), { type: 'order_number', orderNumber: 5678 });
  assert.deepEqual(detectInboundIntent('promos'), { type: 'promos' });
  assert.deepEqual(detectInboundIntent('tienda'), { type: 'store_link' });
  assert.deepEqual(detectInboundIntent('baja'), { type: 'opt_out' });
  assert.deepEqual(detectInboundIntent('alta'), { type: 'opt_in' });
});

test('parseInboundMessages extracts text messages from webhook payload', () => {
  const messages = parseInboundMessages({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: '12345' },
              contacts: [{ profile: { name: 'Ana' } }],
              messages: [
                {
                  id: 'wamid.abc',
                  from: '525512345678',
                  timestamp: '1710000000',
                  type: 'text',
                  text: { body: 'Hola' },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.text, 'Hola');
  assert.equal(messages[0]?.from, '525512345678');
  assert.equal(messages[0]?.phoneNumberId, '12345');
  assert.equal(messages[0]?.contactName, 'Ana');
});

test('parseStatusUpdates extracts delivery statuses', () => {
  const updates = parseStatusUpdates({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                {
                  id: 'wamid.abc',
                  status: 'delivered',
                  recipient_id: '525512345678',
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.status, 'delivered');
});

test('buildInboundHelpMessage includes store link', () => {
  const message = buildInboundHelpMessage({
    storeUrl: 'https://puerta-verde-web.vercel.app',
    branchSlug: 'puerta-verde-demo',
    branchName: 'Puerta Verde — Torre A',
  });

  assert.match(message, /PEDIDO/);
  assert.match(message, /puerta-verde-demo/);
});

test('buildInboundOrderLookupMessage formats found order', () => {
  const message = buildInboundOrderLookupMessage({
    found: true,
    orderNumber: 1001,
    status: 'preparing',
    total: 120,
    trackingUrl: 'https://example.com/pedido/abc',
    branchName: 'Torre A',
  });

  assert.match(message, /#1001/);
  assert.match(message, /Preparando/);
  assert.match(message, /\$120\.00/);
});
