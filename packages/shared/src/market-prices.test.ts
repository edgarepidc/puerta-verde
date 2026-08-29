import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPriceAdjustment, suggestSalePrice } from './market-prices';

test('suggestSalePrice uses cost plus default margin', () => {
  assert.equal(suggestSalePrice({ cost: 20 }), 27);
});

test('suggestSalePrice is 10 percent below the cheapest market price', () => {
  assert.equal(suggestSalePrice({ cost: 20, marketPrices: [22, 24] }), 19.8);
});

test('suggestSalePrice uses market when there is no cost', () => {
  assert.equal(suggestSalePrice({ marketPrices: [50] }), 45);
});

test('applyPriceAdjustment supports pesos and percent', () => {
  assert.equal(applyPriceAdjustment(30, 'amount', 2), 32);
  assert.equal(applyPriceAdjustment(30, 'percent', -10), 27);
});
