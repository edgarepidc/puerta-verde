import { todayMexicoYmd } from '@/lib/mexico-date';
import { normalizeOrderStatus } from '@puertaverde/shared';
import { createAdminClient } from '@puertaverde/supabase/admin';

const OPEN_ORDER_STATUSES = ['pending', 'preparing', 'ready', 'out_for_delivery'] as const;

const ORDER_BOARD_SELECT = `
  id,
  branch_id,
  order_number,
  customer_name,
  customer_phone,
  status,
  fulfillment_type,
  total,
  payment_status,
  payment_method,
  source,
  delivery_notes,
  created_at,
  order_items ( product_name, quantity )
`;

export interface OrderBoardItemPreview {
  product_name: string;
  quantity: number;
}

export interface OrderBoardRow {
  id: string;
  branch_id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  status: ReturnType<typeof normalizeOrderStatus>;
  fulfillment_type: 'delivery' | 'pickup';
  total: number;
  payment_status: string;
  payment_method?: string | null;
  source?: string | null;
  delivery_notes?: string | null;
  created_at: string;
  items: OrderBoardItemPreview[];
  branch: { name: string; slug: string };
}

function deliveredSinceIso(): string {
  const today = todayMexicoYmd();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const monthsAgo = 2;
  const absolute = year * 12 + (month - 1) - monthsAgo;
  const startYear = Math.floor(absolute / 12);
  const startMonth = (absolute % 12) + 1;
  const startYmd = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  return new Date(`${startYmd}T00:00:00-06:00`).toISOString();
}

function normalizeItems(raw: unknown): OrderBoardItemPreview[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as { product_name?: unknown; quantity?: unknown };
      if (typeof item.product_name !== 'string') return null;
      return {
        product_name: item.product_name,
        quantity: Number(item.quantity) || 0,
      };
    })
    .filter((row): row is OrderBoardItemPreview => row != null);
}

export async function loadOrdersBoard(
  branchId: string,
  branch: { name: string; slug: string },
): Promise<OrderBoardRow[]> {
  const supabase = createAdminClient();

  const [{ data: openOrders }, { data: deliveredOrders }] = await Promise.all([
    supabase
      .from('orders')
      .select(ORDER_BOARD_SELECT)
      .eq('branch_id', branchId)
      .in('status', [...OPEN_ORDER_STATUSES])
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select(ORDER_BOARD_SELECT)
      .eq('branch_id', branchId)
      .eq('status', 'delivered')
      .gte('created_at', deliveredSinceIso())
      .order('created_at', { ascending: false }),
  ]);

  const seen = new Set<string>();
  return [...(openOrders ?? []), ...(deliveredOrders ?? [])]
    .filter((order) => {
      if (seen.has(order.id)) return false;
      seen.add(order.id);
      return true;
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((order) => ({
      id: order.id,
      branch_id: order.branch_id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      status: normalizeOrderStatus(order.status),
      fulfillment_type: order.fulfillment_type,
      total: Number(order.total),
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      source: order.source,
      delivery_notes: order.delivery_notes,
      created_at: order.created_at,
      items: normalizeItems(order.order_items),
      branch,
    }));
}

export function formatOrderBoardTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function summarizeOrderItems(items: OrderBoardItemPreview[]): string {
  if (items.length === 0) return 'Sin productos';
  const names = items.map((item) => item.product_name);
  const shown = names.slice(0, 2).join(', ');
  const extra = names.length > 2 ? ` +${names.length - 2}` : '';
  const countLabel =
    names.length === 1 ? '1 producto' : `${names.length} productos`;
  return `${countLabel} · ${shown}${extra}`;
}
