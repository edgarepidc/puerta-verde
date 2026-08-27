const MEXICO_TZ = 'America/Mexico_City';

export const ORDER_WORKFLOW_STATUSES = ['pending', 'preparing', 'delivered'] as const;
export type OrderWorkflowStatus = (typeof ORDER_WORKFLOW_STATUSES)[number];

export const ORDER_STATUSES = [...ORDER_WORKFLOW_STATUSES, 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const LEGACY_IN_PROGRESS = new Set(['ready', 'out_for_delivery']);

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Recibido',
  preparing: 'Preparando',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isOrderWorkflowStatus(value: string): value is OrderWorkflowStatus {
  return (ORDER_WORKFLOW_STATUSES as readonly string[]).includes(value);
}

/** Map leftover DB values (Listo / En camino) into the 3-step board. */
export function normalizeOrderStatus(status: string): OrderStatus {
  if (LEGACY_IN_PROGRESS.has(status)) return 'preparing';
  if (isOrderStatus(status)) return status;
  return 'pending';
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[normalizeOrderStatus(status)];
}

export function nextWorkflowStatus(status: string): OrderWorkflowStatus | null {
  const current = normalizeOrderStatus(status);
  if (current === 'pending') return 'preparing';
  if (current === 'preparing') return 'delivered';
  return null;
}

export function previousWorkflowStatus(status: string): OrderWorkflowStatus | null {
  const current = normalizeOrderStatus(status);
  if (current === 'delivered') return 'preparing';
  if (current === 'preparing') return 'pending';
  return null;
}

export function mexicoYmdFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: MEXICO_TZ }).format(date);
}

export function todayMexicoYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MEXICO_TZ }).format(now);
}

export function formatMexicoDayLabel(ymd: string, today = todayMexicoYmd()): string {
  if (!ymd) return '';
  if (ymd === today) return 'Hoy';
  const probe = new Date(`${today}T12:00:00-06:00`);
  probe.setDate(probe.getDate() - 1);
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: MEXICO_TZ }).format(probe);
  if (ymd === yesterday) return 'Ayer';
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: MEXICO_TZ,
  }).format(new Date(`${ymd}T12:00:00-06:00`));
}

export interface MexicoDayGroup<T> {
  ymd: string;
  label: string;
  count: number;
  total: number;
  items: T[];
}

export function groupByMexicoDay<T extends { created_at: string; total: number | string }>(
  items: T[],
  today = todayMexicoYmd(),
): MexicoDayGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const ymd = mexicoYmdFromIso(item.created_at);
    if (!ymd) continue;
    const list = buckets.get(ymd) ?? [];
    list.push(item);
    buckets.set(ymd, list);
  }

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([ymd, groupItems]) => ({
      ymd,
      label: formatMexicoDayLabel(ymd, today),
      count: groupItems.length,
      total: groupItems.reduce((sum, row) => sum + Number(row.total), 0),
      items: groupItems,
    }));
}
