import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLEARANCE_PACK_DEFAULT_TITLE,
  buildVisitStoreBroadcastMessage,
  formatClearancePackPromoBody,
  validateAssembleClearancePack,
} from './clearance-packs';

test('validateAssembleClearancePack requires price, bags and products', () => {
  assert.equal(
    validateAssembleClearancePack({ price: 0, bagCount: 2, items: [] }),
    'Indica el precio de la bolsa.',
  );
  assert.equal(
    validateAssembleClearancePack({
      price: 50,
      bagCount: 1.5,
      items: [{ branchProductId: 'a', quantity: 0.4 }],
    }),
    'Indica cuántas bolsas armas.',
  );
  assert.equal(
    validateAssembleClearancePack({ price: 50, bagCount: 3, items: [] }),
    'Agrega al menos un producto al paquete.',
  );
  assert.equal(
    validateAssembleClearancePack({
      price: 50,
      bagCount: 3,
      items: [{ branchProductId: 'a', quantity: 0 }],
    }),
    'Cada producto necesita cantidad mayor a cero.',
  );
  assert.equal(
    validateAssembleClearancePack({
      price: 50,
      bagCount: 3,
      items: [
        { branchProductId: 'a', quantity: 0.4 },
        { branchProductId: 'a', quantity: 0.2 },
      ],
    }),
    'Ese producto ya está en el paquete.',
  );
  assert.equal(
    validateAssembleClearancePack({
      price: 50,
      bagCount: 3,
      items: [{ branchProductId: 'a', quantity: 0.4 }],
    }),
    null,
  );
});

test('formatClearancePackPromoBody lists contents and visit copy', () => {
  const body = formatClearancePackPromoBody({
    remaining: 6,
    price: 50,
    contents: ['Plátano', 'Mango'],
    branchName: 'la Cité',
  });
  assert.match(body, /Quedan 6 bolsas a/);
  assert.match(body, /Plátano, Mango/);
  assert.match(body, /Hoy en la Cité/);
  assert.equal(CLEARANCE_PACK_DEFAULT_TITLE, 'Paquete de último momento');
});

test('buildVisitStoreBroadcastMessage does not invite web checkout', () => {
  const message = buildVisitStoreBroadcastMessage({
    title: 'Paquete de último momento $50',
    body: 'Quedan 6 bolsas a $50.00.\nPlátano, mango',
    branchName: 'la Cité',
  });
  assert.match(message, /Ven a la Cité/);
  assert.match(message, /no se pide en línea/);
  assert.equal(message.includes('Pide aquí'), false);
});
