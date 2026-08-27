import {
  formatMoney,
  orderStatusLabel,
  type OrderStatus,
} from '@puertaverde/shared';

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
}

export interface SendTextMessageInput {
  to: string;
  body: string;
}

export async function sendTextMessage(
  config: WhatsAppConfig,
  input: SendTextMessageInput,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const version = config.apiVersion ?? process.env.WHATSAPP_API_VERSION ?? 'v21.0';
  const url = `https://graph.facebook.com/${version}/${config.phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: input.to.replace(/\D/g, ''),
      type: 'text',
      text: { body: input.body },
    }),
  });

  const payload = (await response.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message: string };
  };

  if (!response.ok) {
    return { ok: false, error: payload.error?.message ?? 'WhatsApp API error' };
  }

  return { ok: true, messageId: payload.messages?.[0]?.id };
}

export function buildOrderConfirmationMessage(input: {
  orderNumber: number;
  customerName: string;
  total: number;
  trackingUrl: string;
  branchName: string;
}): string {
  return [
    `¡Hola ${input.customerName}! 🌿`,
    '',
    `Recibimos tu pedido #${input.orderNumber} en *${input.branchName}*.`,
    `Total: *${formatMoney(input.total)}*`,
    '',
    `Sigue tu pedido aquí: ${input.trackingUrl}`,
    '',
    'Gracias por comprar en Puerta Verde.',
  ].join('\n');
}

export function buildOrderStatusMessage(input: {
  orderNumber: number;
  status: OrderStatus;
  branchName: string;
  trackingUrl: string;
}): string {
  const statusLabel = orderStatusLabel(input.status);
  return [
    `Actualización de tu pedido #${input.orderNumber} en *${input.branchName}*:`,
    `Estado: *${statusLabel}*`,
    '',
    `Detalles: ${input.trackingUrl}`,
  ].join('\n');
}

export function verifyWebhook(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  verifyToken: string,
): string | null {
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return challenge;
  }
  return null;
}

export * from './inbound';
export { verifyWebhookSignature } from './webhook';
