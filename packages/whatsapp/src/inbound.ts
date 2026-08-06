import {
  ORDER_STATUS_LABELS,
  formatMoney,
  type OrderStatus,
} from '@puertaverde/shared';

export interface InboundWhatsAppMessage {
  messageId: string;
  from: string;
  timestamp: string;
  text: string;
  phoneNumberId: string;
  contactName?: string;
}

export interface WhatsAppStatusUpdate {
  messageId: string;
  status: string;
  recipientPhone: string;
}

export type InboundIntent =
  | { type: 'help' }
  | { type: 'order_status' }
  | { type: 'order_number'; orderNumber: number }
  | { type: 'promos' }
  | { type: 'store_link' }
  | { type: 'opt_out' }
  | { type: 'opt_in' }
  | { type: 'unknown' };

const HELP_KEYWORDS = [
  'ayuda',
  'menu',
  'menú',
  'hola',
  'buenas',
  'buenos dias',
  'buenos días',
  'hi',
  'hello',
  'opciones',
  'comando',
  'comandos',
  'info',
];

const ORDER_STATUS_KEYWORDS = [
  'estado',
  'pedido',
  'mi pedido',
  'seguimiento',
  'status',
  'donde esta',
  'dónde está',
  'donde esta mi',
  'dónde está mi',
];

const PROMO_KEYWORDS = ['promo', 'promos', 'promocion', 'promoción', 'promociones', 'ofertas', 'oferta'];

const STORE_KEYWORDS = ['tienda', 'catalogo', 'catálogo', 'comprar', 'pedir', 'ordenar'];

const OPT_OUT_KEYWORDS = ['baja', 'stop', 'cancelar mensajes', 'no mensajes', 'unsubscribe', 'salir'];

const OPT_IN_KEYWORDS = ['alta', 'suscribir', 'volver', 'subscribe', 'reactivar'];

function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function containsKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function detectInboundIntent(text: string): InboundIntent {
  const normalized = normalizeText(text);

  if (!normalized) return { type: 'unknown' };

  if (containsKeyword(normalized, OPT_OUT_KEYWORDS)) return { type: 'opt_out' };
  if (containsKeyword(normalized, OPT_IN_KEYWORDS)) return { type: 'opt_in' };

  const orderNumberMatch = normalized.match(/(?:pedido\s*#?\s*|#\s*)?(\d{4,})/);
  if (orderNumberMatch) {
    return { type: 'order_number', orderNumber: Number(orderNumberMatch[1]) };
  }

  if (/^\d{4,}$/.test(normalized)) {
    return { type: 'order_number', orderNumber: Number(normalized) };
  }

  if (containsKeyword(normalized, ORDER_STATUS_KEYWORDS)) return { type: 'order_status' };
  if (containsKeyword(normalized, PROMO_KEYWORDS)) return { type: 'promos' };
  if (containsKeyword(normalized, STORE_KEYWORDS)) return { type: 'store_link' };
  if (containsKeyword(normalized, HELP_KEYWORDS)) return { type: 'help' };

  return { type: 'unknown' };
}

export function parseInboundMessages(payload: unknown): InboundWhatsAppMessage[] {
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          messages?: Array<{
            id?: string;
            from?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };

  const messages: InboundWhatsAppMessage[] = [];

  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      const phoneNumberId = value.metadata?.phone_number_id ?? '';
      const contactName = value.contacts?.[0]?.profile?.name;

      for (const message of value.messages) {
        if (message.type !== 'text' || !message.text?.body || !message.from || !message.id) {
          continue;
        }

        messages.push({
          messageId: message.id,
          from: message.from,
          timestamp: message.timestamp ?? new Date().toISOString(),
          text: message.text.body,
          phoneNumberId,
          contactName,
        });
      }
    }
  }

  return messages;
}

export function parseStatusUpdates(payload: unknown): WhatsAppStatusUpdate[] {
  if (!payload || typeof payload !== 'object') return [];

  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          statuses?: Array<{
            id?: string;
            status?: string;
            recipient_id?: string;
          }>;
        };
      }>;
    }>;
  };

  const updates: WhatsAppStatusUpdate[] = [];

  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) continue;
        updates.push({
          messageId: status.id,
          status: status.status,
          recipientPhone: status.recipient_id ?? '',
        });
      }
    }
  }

  return updates;
}

export function buildInboundHelpMessage(input: {
  storeUrl: string;
  branchSlug: string;
  branchName: string;
}): string {
  const storeLink = `${input.storeUrl}/${input.branchSlug}`;
  return [
    `¡Hola! Soy el asistente de *${input.branchName}* 🌿`,
    '',
    'Puedes escribirme:',
    '• *PEDIDO* — ver tus pedidos recientes',
    '• *PROMOS* — ofertas activas',
    '• *TIENDA* — link para hacer pedido',
    '• *AYUDA* — este menú',
    '• *BAJA* — dejar de recibir mensajes',
    '',
    `También puedes pedir en línea: ${storeLink}`,
  ].join('\n');
}

export function buildInboundUnknownMessage(input: {
  storeUrl: string;
  branchSlug: string;
}): string {
  return [
    'No entendí tu mensaje.',
    'Escribe *AYUDA* para ver las opciones o *PEDIDO* para consultar tu pedido.',
    '',
    `Tienda: ${input.storeUrl}/${input.branchSlug}`,
  ].join('\n');
}

export function buildInboundOptOutMessage(): string {
  return [
    'Listo, ya no te enviaremos mensajes promocionales.',
    'Seguirás recibiendo actualizaciones de pedidos activos.',
    '',
    'Escribe *ALTA* cuando quieras volver a recibir promociones.',
  ].join('\n');
}

export function buildInboundOptInMessage(): string {
  return '¡Perfecto! Vuelves a estar suscrito a promociones y avisos de Puerta Verde 🌿';
}

export function buildInboundOptedOutNotice(): string {
  return 'Estás dado de baja de mensajes. Escribe *ALTA* para reactivar o *PEDIDO* para consultar un pedido.';
}

export function buildInboundOrdersMessage(input: {
  orders: Array<{
    orderNumber: number;
    status: OrderStatus;
    total: number;
    trackingUrl: string;
    branchName: string;
    createdAt: string;
  }>;
  storeUrl: string;
  branchSlug: string;
}): string {
  if (input.orders.length === 0) {
    return [
      'No encontré pedidos con tu número.',
      `Haz tu primer pedido aquí: ${input.storeUrl}/${input.branchSlug}`,
    ].join('\n');
  }

  const lines = ['Tus pedidos recientes:', ''];

  for (const order of input.orders) {
    lines.push(
      `*#${order.orderNumber}* — ${ORDER_STATUS_LABELS[order.status]}`,
      `${order.branchName} · ${formatMoney(order.total)}`,
      order.trackingUrl,
      '',
    );
  }

  return lines.join('\n').trim();
}

export function buildInboundOrderLookupMessage(input: {
  found: boolean;
  orderNumber: number;
  status?: OrderStatus;
  total?: number;
  trackingUrl?: string;
  branchName?: string;
}): string {
  if (!input.found || !input.status || input.total === undefined || !input.trackingUrl) {
    return `No encontré el pedido #${input.orderNumber} con tu número. Escribe *PEDIDO* para ver tus pedidos recientes.`;
  }

  return [
    `Pedido *#${input.orderNumber}*`,
    input.branchName ? `Sucursal: *${input.branchName}*` : null,
    `Estado: *${ORDER_STATUS_LABELS[input.status]}*`,
    `Total: *${formatMoney(input.total)}*`,
    '',
    `Seguimiento: ${input.trackingUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildInboundPromosMessage(input: {
  promos: Array<{ title: string; body: string | null; discountPercent: number | null }>;
  storeUrl: string;
  branchSlug: string;
}): string {
  if (input.promos.length === 0) {
    return [
      'Por ahora no hay promociones activas.',
      `Revisa el catálogo: ${input.storeUrl}/${input.branchSlug}`,
    ].join('\n');
  }

  const lines = ['*Promociones activas* 🎉', ''];

  for (const promo of input.promos) {
    const discount =
      promo.discountPercent && promo.discountPercent > 0
        ? ` (${promo.discountPercent}% de descuento)`
        : '';
    lines.push(`• *${promo.title}*${discount}`);
    if (promo.body) lines.push(`  ${promo.body}`);
  }

  lines.push('', `Pide aquí: ${input.storeUrl}/${input.branchSlug}`);
  return lines.join('\n');
}

export function buildInboundStoreLinkMessage(input: {
  storeUrl: string;
  branchSlug: string;
  branchName: string;
}): string {
  return [
    `Haz tu pedido en *${input.branchName}*:`,
    `${input.storeUrl}/${input.branchSlug}`,
    '',
    'Sin registro · Entrega o recoger · Pago al entregar',
  ].join('\n');
}
