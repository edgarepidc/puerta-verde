import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHILE_LOW_STOCK_KG,
  getDefaultLowStockThreshold,
  isChileProduct,
  isLowStock,
  LOW_STOCK_THRESHOLD,
  quantityForStockCount,
} from './inventory';

test('chile detection by name or category', () => {
  assert.equal(isChileProduct({ name: 'Chile morita' }), true);
  assert.equal(isChileProduct({ categoryName: 'Chiles' }), true);
  assert.equal(isChileProduct({ name: 'Jitomate' }), false);
});

test('default thresholds', () => {
  assert.equal(getDefaultLowStockThreshold({ unit: 'kg', name: 'Papa' }), LOW_STOCK_THRESHOLD);
  assert.equal(getDefaultLowStockThreshold({ unit: 'bunch', name: 'Perejil' }), 3);
  assert.equal(getDefaultLowStockThreshold({ unit: 'box', name: 'Fresas' }), 3);
  assert.equal(getDefaultLowStockThreshold({ unit: 'piece', name: 'Piña' }), 3);
  assert.equal(
    getDefaultLowStockThreshold({ unit: 'kg', name: 'Chile jalapeño' }),
    CHILE_LOW_STOCK_KG,
  );
});

test('isLowStock uses less-than threshold', () => {
  assert.equal(isLowStock({ stock: 2.9, unit: 'kg', name: 'Papa', minStock: 3 }), true);
  assert.equal(isLowStock({ stock: 3, unit: 'kg', name: 'Papa', minStock: 3 }), false);
  assert.equal(isLowStock({ stock: 0.29, unit: 'kg', name: 'Chile ancho', minStock: 0.3 }), true);
  assert.equal(isLowStock({ stock: 0.3, unit: 'kg', name: 'Chile ancho', minStock: 0.3 }), false);
});

test('quantityForStockCount writes off exact remaining stock at count 0', () => {
  assert.equal(
    quantityForStockCount({ system: 6.137, counted: 0, kind: 'waste' }),
    6.137,
  );
  assert.notEqual(
    quantityForStockCount({ system: 6.137, counted: 0, kind: 'waste' }),
    6.14,
  );
  assert.equal(
    quantityForStockCount({ system: 6.137, counted: 0, kind: 'adjustment' }),
    -6.137,
  );
});

test('quantityForStockCount merma uses three decimal places', () => {
  assert.equal(
    quantityForStockCount({ system: 6.137, counted: 1, kind: 'waste' }),
    5.137,
  );
});
