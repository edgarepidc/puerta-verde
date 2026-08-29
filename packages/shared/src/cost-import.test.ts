import assert from 'node:assert/strict';
import test from 'node:test';

import { mapCostImportHeaders, parseCostImportRows } from './cost-import';

test('parseCostImportRows reads Spanish headers', () => {
  const { rows, errors } = parseCostImportRows([
    ['Producto', 'Costo unitario', 'Cantidad', 'Precio', 'Categoria', 'Unidad', 'min_stock'],
    ['Aguacate Hass', 55, 10, 89, 'Frutas', 'kg', 8],
    ['Jitomate', '18.50', '', 35, 'Verduras', 'kg', 5],
  ]);

  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.productName, 'Aguacate Hass');
  assert.equal(rows[0]?.unitCost, 55);
  assert.equal(rows[0]?.quantity, 10);
  assert.equal(rows[0]?.categoryName, 'Frutas');
  assert.equal(rows[0]?.unit, 'kg');
  assert.equal(rows[0]?.minStock, 8);
});

test('mapCostImportHeaders detects columns', () => {
  const map = mapCostImportHeaders(['nombre', 'costo_compra', 'precio_venta']);
  assert.equal(map.productName, 0);
  assert.equal(map.unitCost, 1);
  assert.equal(map.salePrice, 2);
});
