import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSalesExportTables, salesExportFilename } from './sales-export';

test('salesExportFilename uses the branch slug and day or period', () => {
  assert.equal(
    salesExportFilename({ branchSlug: 'la-cite', date: '2026-08-19', days: 30 }),
    'ventas-la-cite-2026-08-19.xlsx',
  );
  assert.equal(
    salesExportFilename({ branchSlug: 'la-cite', days: 30 }),
    'ventas-la-cite-30d.xlsx',
  );
  assert.equal(
    salesExportFilename({
      branchSlug: 'la-cite',
      dates: ['2026-08-19', '2026-08-18'],
      days: 30,
    }),
    'ventas-la-cite-2026-08-18_2026-08-19-2d.xlsx',
  );
});

test('buildSalesExportTables groups by Mexico day and keeps line items', () => {
  const tables = buildSalesExportTables(
    [
      {
        id: 'a',
        order_number: 1015,
        customer_name: 'Mariana',
        customer_phone: '5550100105',
        fulfillment_type: 'pickup',
        payment_method: 'cash',
        payment_status: 'paid',
        source: 'pos',
        total: 89,
        created_at: '2026-08-19T15:00:00-06:00',
      },
      {
        id: 'b',
        order_number: 1008,
        customer_name: 'Ana',
        customer_phone: '5550100101',
        fulfillment_type: 'delivery',
        payment_method: 'transfer',
        payment_status: 'paid',
        source: 'web',
        total: 156,
        created_at: '2026-08-18T18:00:00-06:00',
      },
      {
        id: 'c',
        order_number: 1020,
        customer_name: 'Luis',
        customer_phone: '5550100109',
        fulfillment_type: 'pickup',
        payment_method: 'on_account',
        payment_status: 'pending',
        source: 'pos',
        total: 40,
        created_at: '2026-08-19T16:00:00-06:00',
      },
    ],
    [
      {
        order_id: 'a',
        product_name: 'Jitomate',
        unit: 'kg',
        quantity: 1,
        unit_price: 89,
        line_total: 89,
      },
    ],
    '2026-08-19',
  );

  assert.equal(tables.byDay.length, 2);
  assert.equal(tables.byDay[0]?.Fecha, '2026-08-19');
  assert.equal(tables.byDay[0]?.Día, 'Hoy');
  assert.equal(tables.byDay[0]?.Total, 129);
  assert.equal(tables.byDay[1]?.Día, 'Ayer');
  assert.equal(tables.sales[0]?.Pedido, 1020);
  assert.equal(tables.sales[0]?.Pago, 'Por pagar');
  assert.equal(tables.sales[0]?.['Estado de pago'], 'Por pagar');
  assert.equal(tables.sales[1]?.Pedido, 1015);
  assert.equal(tables.sales[1]?.Origen, 'Mostrador');
  assert.equal(tables.sales[2]?.Entrega, 'Entrega a domicilio');
  assert.equal(tables.items.length, 1);
  assert.equal(tables.items[0]?.Producto, 'Jitomate');
  assert.equal(tables.items[0]?.Pedido, 1015);
});
