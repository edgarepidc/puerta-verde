import {
  BRAND_NAME,
  PAYMENT_METHOD_LABELS,
  PRODUCT_UNIT_LABELS,
  formatMoney,
  formatProductQuantity,
  isWalkInPhone,
  parsePaymentSplits,
  type PaymentMethod,
  type ProductUnit,
} from '@puertaverde/shared';

import { getEscPosLogo } from '@/lib/thermal-logo';

export interface ThermalReceiptItem {
  product_name: string;
  unit?: ProductUnit | string;
  quantity: number;
  unit_price?: number;
  line_total: number;
}

export interface ThermalReceiptData {
  storeName?: string;
  orderNumber: number;
  soldAt?: string | null;
  customerName: string;
  customerPhone?: string | null;
  paymentMethod?: string | null;
  paymentSplits?: unknown;
  total: number;
  /** Cash tendered by the customer (POS only). */
  amountReceived?: number | null;
  /** Change due when paying cash. */
  changeDue?: number | null;
  items: ThermalReceiptItem[];
}

/** 58 mm paper, Font A: 32 characters. */
export const TICKET_WIDTH = 32;

export const TICKET_FOOTER =
  'Recuerda que puedes hacer tus pedidos al 5562178750 o en puertaverde.com.mx/la-cite';

export function formatSoldAt(soldAt?: string | null) {
  const date = soldAt ? new Date(soldAt) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function paymentLabel(method?: string | null, splits?: unknown) {
  const parsed = parsePaymentSplits(splits);
  if (parsed.length >= 2) {
    return parsed
      .map((split) => `${PAYMENT_METHOD_LABELS[split.method]} ${formatMoney(split.amount)}`)
      .join(' + ');
  }
  if (!method) return null;
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}

export function quantityLabel(item: ThermalReceiptItem) {
  const unit = item.unit as ProductUnit | undefined;
  if (unit && unit in PRODUCT_UNIT_LABELS) {
    return formatProductQuantity(Number(item.quantity), unit);
  }
  return String(item.quantity);
}

const CP1252: Record<string, number> = {
  á: 0xe1,
  é: 0xe9,
  í: 0xed,
  ó: 0xf3,
  ú: 0xfa,
  ü: 0xfc,
  ñ: 0xf1,
  Á: 0xc1,
  É: 0xc9,
  Í: 0xcd,
  Ó: 0xd3,
  Ú: 0xda,
  Ü: 0xdc,
  Ñ: 0xd1,
  '¡': 0xa1,
  '¿': 0xbf,
  '·': 0x2d,
  '°': 0xb0,
  'ª': 0xaa,
  'º': 0xba,
};

function encodeTicketText(text: string): number[] {
  const normalized = text
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  const bytes: number[] = [];
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code < 128) {
      bytes.push(code);
      continue;
    }
    const mapped = CP1252[char];
    bytes.push(mapped ?? (code <= 0xff ? code : 0x3f));
  }
  return bytes;
}

function padCenter(text: string, width = TICKET_WIDTH) {
  const clipped = text.slice(0, width);
  const space = Math.max(0, width - clipped.length);
  const left = Math.floor(space / 2);
  return `${' '.repeat(left)}${clipped}${' '.repeat(space - left)}`;
}

function columns(left: string, right: string, width = TICKET_WIDTH) {
  const r = right.slice(0, width);
  const maxLeft = Math.max(0, width - r.length - 1);
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  return `${l}${' '.repeat(width - l.length - r.length)}${r}`;
}

function wrap(text: string, width = TICKET_WIDTH): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    if (!current) {
      current = word.slice(0, width);
      continue;
    }
    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word.slice(0, width);
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function pushLine(out: number[], text: string) {
  out.push(...encodeTicketText(text), LF);
}

export async function encodeEscPos(data: ThermalReceiptData): Promise<Uint8Array> {
  const out: number[] = [];
  const storeName = data.storeName?.trim() || BRAND_NAME;
  const showPhone = Boolean(data.customerPhone) && !isWalkInPhone(data.customerPhone ?? '');
  const method = paymentLabel(data.paymentMethod, data.paymentSplits);
  const soldAt = formatSoldAt(data.soldAt);

  // BLE/USB often drops the first byte of a job. A NUL+LF keeps ESC a from printing as "a".
  out.push(0x00, 0x00, LF);
  out.push(ESC, 0x61, 0x01); // center

  const logo = await getEscPosLogo();
  if (logo.length) {
    for (let i = 0; i < logo.length; i++) out.push(logo[i]);
    out.push(LF, LF);
  } else {
    out.push(ESC, 0x45, 0x01);
    pushLine(out, padCenter(BRAND_NAME.toUpperCase()));
    out.push(ESC, 0x45, 0x00);
  }

  if (storeName !== BRAND_NAME) pushLine(out, padCenter(storeName));
  pushLine(out, padCenter(`Ticket #${data.orderNumber}`));
  if (soldAt) pushLine(out, padCenter(soldAt));
  out.push(LF);

  const customer = showPhone ? `${data.customerName} - ${data.customerPhone}` : data.customerName;
  for (const line of wrap(customer)) pushLine(out, padCenter(line));

  out.push(ESC, 0x61, 0x00); // left
  pushLine(out, '-'.repeat(TICKET_WIDTH));

  if (data.items.length === 0) {
    pushLine(out, '(sin partidas)');
  } else {
    for (const item of data.items) {
      for (const line of wrap(item.product_name)) pushLine(out, line);
      pushLine(out, columns(`  ${quantityLabel(item)}`, formatMoney(Number(item.line_total))));
    }
  }

  pushLine(out, '-'.repeat(TICKET_WIDTH));
  out.push(ESC, 0x45, 0x01);
  pushLine(out, columns('TOTAL', formatMoney(Number(data.total))));
  out.push(ESC, 0x45, 0x00);
  if (method) {
    pushLine(out, columns('Forma de pago', method));
  }
  if (
    (data.paymentMethod === 'cash' ||
      parsePaymentSplits(data.paymentSplits).some((split) => split.method === 'cash')) &&
    data.amountReceived != null &&
    Number.isFinite(Number(data.amountReceived))
  ) {
    pushLine(out, columns('Recibido', formatMoney(Number(data.amountReceived))));
    pushLine(out, columns('Cambio', formatMoney(Number(data.changeDue ?? 0))));
  }
  out.push(LF);
  out.push(ESC, 0x61, 0x01);
  pushLine(out, padCenter('¡Gracias por tu compra!'));
  out.push(LF);
  for (const line of wrap(TICKET_FOOTER)) {
    pushLine(out, padCenter(line));
  }
  out.push(ESC, 0x61, 0x00);

  out.push(LF, LF, LF, LF);
  // Partial cut (ignored if the printer has no cutter)
  out.push(GS, 0x56, 0x41, 0x10);

  return Uint8Array.from(out);
}

export interface ShoppingListItem {
  product_name: string;
  unit?: ProductUnit | string;
  stock: number;
  buyQty: number;
}

export interface ShoppingListTicketData {
  storeName?: string;
  printedAt?: string | null;
  horizonDays?: number;
  items: ShoppingListItem[];
}

export async function encodeEscPosShoppingList(data: ShoppingListTicketData): Promise<Uint8Array> {
  const out: number[] = [];
  const storeName = data.storeName?.trim() || BRAND_NAME;
  const printedAt = formatSoldAt(data.printedAt);

  out.push(0x00, 0x00, LF);
  out.push(ESC, 0x61, 0x01);

  const logo = await getEscPosLogo();
  if (logo.length) {
    for (let i = 0; i < logo.length; i++) out.push(logo[i]);
    out.push(LF, LF);
  } else {
    out.push(ESC, 0x45, 0x01);
    pushLine(out, padCenter(BRAND_NAME.toUpperCase()));
    out.push(ESC, 0x45, 0x00);
  }

  if (storeName !== BRAND_NAME) pushLine(out, padCenter(storeName));
  out.push(ESC, 0x45, 0x01);
  pushLine(out, padCenter('LISTA DE COMPRA'));
  out.push(ESC, 0x45, 0x00);
  if (printedAt) pushLine(out, padCenter(printedAt));
  if (data.horizonDays) pushLine(out, padCenter(`Horizonte ${data.horizonDays} dias`));
  out.push(LF);

  out.push(ESC, 0x61, 0x00);
  pushLine(out, '-'.repeat(TICKET_WIDTH));
  pushLine(out, columns('Producto', 'Comprar'));
  pushLine(out, '-'.repeat(TICKET_WIDTH));

  const items = data.items.filter((item) => Number(item.buyQty) > 0);
  if (items.length === 0) {
    pushLine(out, '(sin articulos)');
  } else {
    for (const item of items) {
      for (const line of wrap(item.product_name)) pushLine(out, line);
      const unit = item.unit as ProductUnit | undefined;
      const buyLabel =
        unit && unit in PRODUCT_UNIT_LABELS
          ? formatProductQuantity(Number(item.buyQty), unit)
          : String(item.buyQty);
      const stockLabel =
        unit && unit in PRODUCT_UNIT_LABELS
          ? formatProductQuantity(Number(item.stock), unit)
          : String(item.stock);
      pushLine(out, columns(`  Hay ${stockLabel}`, buyLabel));
    }
  }

  pushLine(out, '-'.repeat(TICKET_WIDTH));
  out.push(ESC, 0x45, 0x01);
  pushLine(out, columns('Articulos', String(items.length)));
  out.push(ESC, 0x45, 0x00);
  out.push(LF);
  out.push(ESC, 0x61, 0x01);
  pushLine(out, padCenter('Lista para central'));
  out.push(ESC, 0x61, 0x00);
  out.push(LF, LF, LF, LF);
  out.push(GS, 0x56, 0x41, 0x10);

  return Uint8Array.from(out);
}

export function encodeEscPosTest(): Uint8Array {
  const out: number[] = [];
  out.push(0x00, 0x00, LF);
  out.push(ESC, 0x61, 0x01);
  out.push(ESC, 0x45, 0x01);
  pushLine(out, padCenter('PUERTA VERDE'));
  out.push(ESC, 0x45, 0x00);
  pushLine(out, padCenter('Prueba de impresora'));
  out.push(LF);
  pushLine(out, padCenter('Si lees esto, ya imprime'));
  out.push(LF, LF, LF, LF);
  out.push(GS, 0x56, 0x41, 0x10);
  return Uint8Array.from(out);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Windows PCs print through the system dialog (POS-58 / USB), not Chrome Web Bluetooth. */
export function printReceiptViaWindows(data: ThermalReceiptData) {
  const storeName = data.storeName?.trim() || BRAND_NAME;
  const soldAt = formatSoldAt(data.soldAt);
  const method = paymentLabel(data.paymentMethod, data.paymentSplits);
  const showPhone = Boolean(data.customerPhone) && !isWalkInPhone(data.customerPhone ?? '');
  const origin = window.location.origin;
  const items = data.items
    .map((item) => {
      return `<li>
        <span class="name">${escapeHtml(item.product_name)}</span>
        <span class="row"><span>${escapeHtml(quantityLabel(item))}</span><span>${escapeHtml(formatMoney(Number(item.line_total)))}</span></span>
      </li>`;
    })
    .join('');
  const cash =
    (data.paymentMethod === 'cash' ||
      parsePaymentSplits(data.paymentSplits).some((split) => split.method === 'cash')) &&
    data.amountReceived != null
      ? `<p class="total"><span>Recibido</span><span>${escapeHtml(formatMoney(Number(data.amountReceived)))}</span></p>
         <p class="total"><span>Cambio</span><span>${escapeHtml(formatMoney(Number(data.changeDue ?? 0)))}</span></p>`
      : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Ticket #${data.orderNumber}</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  html,body { margin: 0; padding: 0; }
  body { width: 58mm; color: #000; font-family: ui-monospace, Consolas, "Courier New", monospace; font-size: 11px; line-height: 1.3; }
  article { padding: 3mm 3mm 8mm; }
  .head, .customer, .thanks, .footer { text-align: center; }
  img { display: block; width: 26mm; height: auto; margin: 0 auto 8px; }
  p { margin: 0; }
  .rule { border-top: 1px dashed #000; margin: 6px 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  li + li { margin-top: 5px; }
  .name { display: block; font-weight: 700; }
  .row, .total { display: flex; justify-content: space-between; gap: 8px; }
  .total { font-weight: 700; font-size: 12px; }
  .thanks { margin-top: 8px; }
  .footer { margin-top: 6px; font-size: 10px; }
</style></head><body><article>
  <header class="head">
    <img src="${origin}/brand/logo.png" alt="${escapeHtml(BRAND_NAME)}"/>
    ${storeName !== BRAND_NAME ? `<p>${escapeHtml(storeName)}</p>` : ''}
    <p>Ticket #${data.orderNumber}</p>
    ${soldAt ? `<p>${escapeHtml(soldAt)}</p>` : ''}
  </header>
  <p class="customer">${escapeHtml(data.customerName)}${showPhone ? ` · ${escapeHtml(data.customerPhone ?? '')}` : ''}</p>
  <div class="rule"></div>
  <ul>${items || '<li>(sin partidas)</li>'}</ul>
  <div class="rule"></div>
  <p class="total"><span>TOTAL</span><span>${escapeHtml(formatMoney(Number(data.total)))}</span></p>
  ${method ? `<p class="total"><span>Forma de pago</span><span>${escapeHtml(method)}</span></p>` : ''}
  ${cash}
  <p class="thanks">¡Gracias por tu compra!</p>
  <p class="footer">${escapeHtml(TICKET_FOOTER)}</p>
</article>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const win = window.open('', '_blank', 'noopener,noreferrer,width=420,height=800');
  if (!win) throw new Error('Permite ventanas emergentes para imprimir, o usa USB.');
  win.document.write(html);
  win.document.close();
}
