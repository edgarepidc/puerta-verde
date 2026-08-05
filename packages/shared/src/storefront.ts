import { PRODUCT_UNIT_LABELS, type ProductUnit } from './index';
import { LOW_STOCK_THRESHOLD } from './inventory';

export type StockStatus = 'out' | 'low' | 'available';

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  out: 'Agotado',
  low: 'Últimas unidades',
  available: 'Disponible',
};

export function getStockStatus(stock: number, isAvailable = true): StockStatus {
  if (!isAvailable || stock <= 0) return 'out';
  if (stock <= LOW_STOCK_THRESHOLD) return 'low';
  return 'available';
}

export function getQuantityStep(unit: ProductUnit): number {
  return unit === 'kg' ? 0.25 : 1;
}

export function getDefaultQuantity(unit: ProductUnit): number {
  return unit === 'kg' ? 0.5 : 1;
}

export function formatProductQuantity(quantity: number, unit: ProductUnit): string {
  const label = PRODUCT_UNIT_LABELS[unit];
  const formatted = unit === 'kg' ? quantity.toFixed(2).replace(/\.?0+$/, '') : String(quantity);
  return `${formatted} ${label}`;
}

export function applyDiscount(price: number, discountPercent: number): number {
  if (discountPercent <= 0) return price;
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

export function getActiveDiscountPercent(
  promotions: Array<{ kind: string; discount_percent?: number | null }>,
): number {
  return promotions.reduce((max, promo) => {
    if (promo.kind !== 'discount' || !promo.discount_percent) return max;
    return Math.max(max, Number(promo.discount_percent));
  }, 0);
}
