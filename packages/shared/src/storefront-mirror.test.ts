import assert from 'node:assert/strict';
import test from 'node:test';

import { markedUpUnitPrice, normalizeStorefrontSlug, storefrontInputError } from './storefront-mirror';

test('markedUpUnitPrice adds the shipping percent on top of the store price', () => {
  assert.equal(markedUpUnitPrice(100, 15), 115);
  assert.equal(markedUpUnitPrice(80.81, 10), 88.89);
  assert.equal(markedUpUnitPrice(10, 0), 10);
});

test('normalizeStorefrontSlug makes a public path', () => {
  assert.equal(normalizeStorefrontSlug(' Roma Norte '), 'roma-norte');
});

test('storefrontInputError rejects a reserved or empty vitrina', () => {
  assert.equal(
    storefrontInputError({ name: '', slug: 'roma', markupPercent: 10 }),
    'Escribe el nombre de la otra zona.',
  );
  assert.equal(
    storefrontInputError({ name: 'Pedidos', slug: 'pedido', markupPercent: 10 }),
    'Esa liga está reservada. Elige otra.',
  );
  assert.equal(storefrontInputError({ name: 'Roma', slug: 'roma', markupPercent: 12.5 }), null);
});
