'use client';

import {
  BRAND_NAME,
  formatMoney,
  isWalkInPhone,
} from '@puertaverde/shared';

import {
  formatSoldAt,
  paymentLabel,
  quantityLabel,
  TICKET_FOOTER,
  type ThermalReceiptData,
} from '@/lib/thermal-ticket';

export type { ThermalReceiptData, ThermalReceiptItem } from '@/lib/thermal-ticket';

const AUTO_PRINT_KEY = 'pv.autoPrintTicket';

export function getAutoPrintTicket(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(AUTO_PRINT_KEY);
  return stored === null ? true : stored === '1';
}

export function setAutoPrintTicket(enabled: boolean) {
  window.localStorage.setItem(AUTO_PRINT_KEY, enabled ? '1' : '0');
}

export function ThermalReceipt({
  data,
  className,
}: {
  data: ThermalReceiptData;
  className?: string;
}) {
  const storeName = data.storeName?.trim() || BRAND_NAME;
  const showPhone = Boolean(data.customerPhone) && !isWalkInPhone(data.customerPhone ?? '');
  const method = paymentLabel(data.paymentMethod);
  const soldAt = formatSoldAt(data.soldAt);

  return (
    <article className={className}>
      <header className="pv-thermal-head">
        <img src="/brand/logo.png" alt={BRAND_NAME} className="pv-thermal-logo" />
        {storeName !== BRAND_NAME ? <p className="pv-thermal-store">{storeName}</p> : null}
        <p className="pv-thermal-ticket">Ticket #{data.orderNumber}</p>
        {soldAt ? <p>{soldAt}</p> : null}
      </header>

      <p className="pv-thermal-customer">
        {data.customerName}
        {showPhone ? ` · ${data.customerPhone}` : ''}
      </p>

      <div className="pv-thermal-rule" />

      <ul className="pv-thermal-items">
        {data.items.length === 0 ? <li>(sin partidas)</li> : null}
        {data.items.map((item, index) => (
          <li key={`${item.product_name}-${index}`}>
            <span className="pv-thermal-item-name">{item.product_name}</span>
            <span className="pv-thermal-item-row">
              <span>{quantityLabel(item)}</span>
              <span>{formatMoney(Number(item.line_total))}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="pv-thermal-rule" />

      <p className="pv-thermal-total">
        <span>TOTAL</span>
        <span>{formatMoney(Number(data.total))}</span>
      </p>

      {method ? (
        <p className="pv-thermal-total">
          <span>Forma de pago</span>
          <span>{method}</span>
        </p>
      ) : null}

      {data.paymentMethod === 'cash' &&
      data.amountReceived != null &&
      Number.isFinite(Number(data.amountReceived)) ? (
        <div className="pv-thermal-cash">
          <p className="pv-thermal-total">
            <span>Recibido</span>
            <span>{formatMoney(Number(data.amountReceived))}</span>
          </p>
          <p className="pv-thermal-total">
            <span>Cambio</span>
            <span>{formatMoney(Number(data.changeDue ?? 0))}</span>
          </p>
        </div>
      ) : null}

      <p className="pv-thermal-thanks">¡Gracias por tu compra!</p>
      <p className="pv-thermal-footer">{TICKET_FOOTER}</p>
    </article>
  );
}
