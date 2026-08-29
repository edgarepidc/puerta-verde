import {
  formatMexicoDayLabel,
  groupByMexicoDay,
  mexicoYmdFromIso,
  todayMexicoYmd,
} from './order-status';

const MEXICO_TZ = 'America/Mexico_City';

const FULFILLMENT_LABELS: Record<string, string> = {
  delivery: 'Entrega a domicilio',
  pickup: 'Paso a recoger',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card_terminal: 'TPV',
  transfer: 'Transferencia',
  online: 'En línea',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  refunded: 'Reembolsado',
};

const SOURCE_LABELS: Record<string, string> = {
  pos: 'Mostrador',
  web: 'En línea',
};

const UNIT_LABELS: Record<string, string> = {
  kg: 'kg',
  piece: 'pieza',
  bunch: 'manojo',
  bag: 'bolsa',
  liter: 'litro',
  box: 'caja',
};

export interface SalesExportOrder {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  fulfillment_type: string;
  payment_method?: string | null;
  payment_status: string;
  source?: string | null;
  total: number | string;
  created_at: string;
}

export interface SalesExportItem {
  order_id: string;
  product_name: string;
  unit: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
}

export interface SalesDayRow {
  Fecha: string;
  Día: string;
  Ventas: number;
  Total: number;
}

export interface SalesOrderRow {
  Fecha: string;
  Hora: string;
  Pedido: number;
  Cliente: string;
  Teléfono: string;
  Entrega: string;
  Origen: string;
  Pago: string;
  'Estado de pago': string;
  Total: number;
}

export interface SalesItemRow {
  Fecha: string;
  Pedido: number;
  Producto: string;
  Cantidad: number;
  Unidad: string;
  'Precio unitario': number;
  Importe: number;
}

export function salesExportFilename(input: {
  branchSlug: string;
  date?: string;
  dates?: string[];
  days: number;
}): string {
  const slug = input.branchSlug.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'sucursal';
  const dates = [...(input.dates ?? [])].filter(Boolean).sort();
  if (dates.length === 1) return `ventas-${slug}-${dates[0]}.xlsx`;
  if (dates.length > 1) {
    return `ventas-${slug}-${dates[0]}_${dates[dates.length - 1]}-${dates.length}d.xlsx`;
  }
  if (input.date) return `ventas-${slug}-${input.date}.xlsx`;
  return `ventas-${slug}-${input.days}d.xlsx`;
}

function formatMexicoTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MEXICO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function buildSalesExportTables(
  orders: SalesExportOrder[],
  items: SalesExportItem[],
  today = todayMexicoYmd(),
): {
  byDay: SalesDayRow[];
  sales: SalesOrderRow[];
  items: SalesItemRow[];
} {
  const sorted = [...orders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const days = groupByMexicoDay(sorted, today);
  const byId = new Map(sorted.map((order) => [order.id, order]));

  return {
    byDay: days.map((day) => ({
      Fecha: day.ymd,
      Día: formatMexicoDayLabel(day.ymd, today),
      Ventas: day.count,
      Total: day.total,
    })),
    sales: sorted.map((order) => ({
      Fecha: mexicoYmdFromIso(order.created_at),
      Hora: formatMexicoTime(order.created_at),
      Pedido: Number(order.order_number),
      Cliente: order.customer_name,
      Teléfono: order.customer_phone,
      Entrega: FULFILLMENT_LABELS[order.fulfillment_type] ?? order.fulfillment_type,
      Origen: SOURCE_LABELS[order.source ?? ''] ?? order.source ?? '',
      Pago: PAYMENT_METHOD_LABELS[order.payment_method ?? ''] ?? order.payment_method ?? '',
      'Estado de pago': PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status,
      Total: Number(order.total),
    })),
    items: items.flatMap((item) => {
      const order = byId.get(item.order_id);
      if (!order) return [];
      return [{
        Fecha: mexicoYmdFromIso(order.created_at),
        Pedido: Number(order.order_number),
        Producto: item.product_name,
        Cantidad: Number(item.quantity),
        Unidad: UNIT_LABELS[item.unit] ?? item.unit,
        'Precio unitario': Number(item.unit_price),
        Importe: Number(item.line_total),
      }];
    }),
  };
}
