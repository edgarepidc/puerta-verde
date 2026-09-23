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

export function buildReceiptText(data: ThermalReceiptData, width = TICKET_WIDTH): string {
  const storeName = data.storeName?.trim() || BRAND_NAME;
  const showPhone = Boolean(data.customerPhone) && !isWalkInPhone(data.customerPhone ?? '');
  const method = paymentLabel(data.paymentMethod, data.paymentSplits);
  const soldAt = formatSoldAt(data.soldAt);
  const lines: string[] = [];
  const rule = '-'.repeat(width);

  if (storeName !== BRAND_NAME) lines.push(padCenter(storeName, width));
  lines.push(padCenter(`Ticket #${data.orderNumber}`, width));
  if (soldAt) lines.push(padCenter(soldAt, width));
  lines.push('');
  const customer = showPhone ? `${data.customerName} - ${data.customerPhone}` : data.customerName;
  for (const line of wrap(customer, width)) lines.push(padCenter(line, width));
  lines.push(rule);

  if (data.items.length === 0) {
    lines.push('(sin partidas)');
  } else {
    for (const item of data.items) {
      for (const line of wrap(item.product_name, width)) lines.push(line);
      lines.push(columns(`  ${quantityLabel(item)}`, formatMoney(Number(item.line_total)), width));
    }
  }

  lines.push(rule);
  lines.push(columns('TOTAL', formatMoney(Number(data.total)), width));
  if (method) lines.push(columns('Forma de pago', method, width));
  if (
    (data.paymentMethod === 'cash' ||
      parsePaymentSplits(data.paymentSplits).some((split) => split.method === 'cash')) &&
    data.amountReceived != null &&
    Number.isFinite(Number(data.amountReceived))
  ) {
    lines.push(columns('Recibido', formatMoney(Number(data.amountReceived)), width));
    lines.push(columns('Cambio', formatMoney(Number(data.changeDue ?? 0)), width));
  }
  lines.push('');
  lines.push(padCenter('Gracias por tu compra!', width));
  lines.push('');
  for (const line of wrap(TICKET_FOOTER, width)) lines.push(padCenter(line, width));
  lines.push('', '', '');
  return lines.join('\n');
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

/** Windows PCs print 30-character text plus a small logo so POS-58 keeps prices on the roll. */
export function printReceiptViaWindows(data: ThermalReceiptData) {
  const width = 30;
  const body = escapeHtml(buildReceiptText(data, width));
  const origin = window.location.origin;
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Ticket #${data.orderNumber}</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; width: 58mm; background: #fff; color: #000; }
  .logo {
    display: block;
    width: 22mm;
    height: auto;
    margin: 2mm auto 1mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  pre {
    margin: 0;
    padding: 0 1.5mm 8mm;
    width: ${width}ch;
    max-width: 58mm;
    box-sizing: border-box;
    font-family: "Consolas", "Courier New", monospace;
    font-size: 9.5px;
    line-height: 1.25;
    letter-spacing: 0;
    white-space: pre;
    overflow: hidden;
  }
</style></head><body>
  <img class="logo" src="${origin}/brand/logo.png" alt="Puerta Verde"/>
  <pre>${body}</pre>
</body></html>`;
  openPrintWindow(html, 'width=280,height=700');
}

export function openPrintWindow(html: string, features = 'width=420,height=800') {
  const win = window.open('', '_blank', features);
  if (!win) throw new Error('Permite ventanas emergentes para imprimir, o usa USB.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  let printed = false;
  const print = () => {
    if (printed) return;
    printed = true;
    try {
      win.print();
    } catch {
      // window closed
    }
  };
  const img = win.document.querySelector('img');
  if (img && !img.complete) {
    img.addEventListener('load', print);
    img.addEventListener('error', print);
    win.setTimeout(print, 1200);
  } else {
    win.setTimeout(print, 200);
  }
}
